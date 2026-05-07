import crypto from "crypto";
import { Router } from "express";
import axios from "axios";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import {
  CLIENT_URL,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_PLAN_PLUS_ID,
  PAYPAL_PLAN_GOLD_ID,
  NODE_ENV,
} from "../config/env.js";

const router = Router();

// PayPal API base — sandbox for dev/test, live for production
const PAYPAL_BASE =
  NODE_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

// Get a short-lived PayPal access token
async function getPayPalToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured");
  }
  const credentials = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const res = await axios.post(
    `${PAYPAL_BASE}/v1/oauth2/token`,
    "grant_type=client_credentials",
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  return res.data.access_token;
}

export const PLANS = {
  plus: {
    name: "PulsDate Plus",
    planId: () => PAYPAL_PLAN_PLUS_ID,
    price: 9.99,
    features: [
      "Unlimited likes",
      "5 Super Likes per day",
      "See who liked you",
      "1 Boost per week",
      "Advanced filters",
      "Read receipts",
    ],
  },
  gold: {
    name: "PulsDate Gold",
    planId: () => PAYPAL_PLAN_GOLD_ID,
    price: 19.99,
    features: [
      "Everything in Plus",
      "Unlimited Super Likes",
      "3 Boosts per month",
      "Priority matching",
      "Virtual gifts included (5/month)",
      "Profile highlighted in search",
    ],
  },
};

// GET /api/billing/plans — public price list
router.get("/plans", (_req, res) => {
  return res.json({
    plans: [
      {
        tier: "free",
        name: "PulsDate Free",
        price: 0,
        features: ["20 likes/day", "1 Super Like/day", "Basic filters"],
      },
      { tier: "plus", ...PLANS.plus, planId: undefined },
      { tier: "gold", ...PLANS.gold, planId: undefined },
    ],
  });
});

// GET /api/billing/subscription — current user's subscription record
router.get("/subscription", requireAuth, async (req, res) => {
  const sub = await prisma.subscription.findUnique({
    where: { userId: req.user.id },
  });
  return res.json({ subscription: sub || null });
});

// POST /api/billing/checkout — create a PayPal subscription and return approval URL
router.post("/checkout", requireAuth, async (req, res) => {
  const { tier } = req.body;
  if (!["plus", "gold"].includes(tier)) {
    return res.status(400).json({ error: "Invalid tier. Choose plus or gold." });
  }

  const planId = PLANS[tier].planId();
  if (!planId) {
    return res
      .status(503)
      .json({ error: "Billing is not configured yet. Please check back soon." });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const baseUrl = CLIENT_URL.split(",")[0].trim();

  const token = await getPayPalToken();

  const response = await axios.post(
    `${PAYPAL_BASE}/v1/billing/subscriptions`,
    {
      plan_id: planId,
      subscriber: {
        name: { given_name: user.name || "User" },
        email_address: user.email,
      },
      application_context: {
        brand_name: "PulsDate",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${baseUrl}/billing/success`,
        cancel_url: `${baseUrl}/upgrade`,
      },
      custom_id: `${user.id}:${tier}`,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
    }
  );

  const approveLink = response.data.links?.find((l) => l.rel === "approve");
  if (!approveLink) {
    return res
      .status(500)
      .json({ error: "Failed to create PayPal subscription." });
  }

  // Pre-create subscription row in pending state
  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {
      stripeSubscriptionId: response.data.id,
      stripePriceId: planId,
      tier,
      status: "pending",
    },
    create: {
      id: crypto.randomUUID(),
      userId: user.id,
      stripeCustomerId: "",
      stripeSubscriptionId: response.data.id,
      stripePriceId: planId,
      tier,
      status: "pending",
    },
  });

  return res.json({ url: approveLink.href });
});

// POST /api/billing/capture — activate subscription after PayPal redirects back
// PayPal appends ?subscription_id=I-xxxxx to the return_url
router.post("/capture", requireAuth, async (req, res) => {
  const { subscription_id } = req.body;
  if (!subscription_id) {
    return res.status(400).json({ error: "subscription_id is required" });
  }

  const token = await getPayPalToken();
  const { data } = await axios.get(
    `${PAYPAL_BASE}/v1/billing/subscriptions/${subscription_id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!["ACTIVE", "APPROVED"].includes(data.status)) {
    return res.status(400).json({
      error: `Subscription not yet active (status: ${data.status}). Wait a moment and refresh.`,
    });
  }

  const [userId, tier = "plus"] = (data.custom_id || "").split(":");

  if (userId !== req.user.id) {
    return res
      .status(403)
      .json({ error: "Subscription does not belong to this account." });
  }

  const periodEnd = data.billing_info?.next_billing_time
    ? new Date(data.billing_info.next_billing_time)
    : null;
  const payerId = data.subscriber?.payer_id || "";

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      stripeCustomerId: payerId,
      stripeSubscriptionId: subscription_id,
      stripePriceId: data.plan_id || "",
      tier,
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
    create: {
      id: crypto.randomUUID(),
      userId,
      stripeCustomerId: payerId,
      stripeSubscriptionId: subscription_id,
      stripePriceId: data.plan_id || "",
      tier,
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { isPremium: true, premiumTier: tier },
  });

  return res.json({ success: true, tier });
});

// POST /api/billing/cancel — cancel the user's active PayPal subscription
router.post("/cancel", requireAuth, async (req, res) => {
  const sub = await prisma.subscription.findUnique({
    where: { userId: req.user.id },
  });
  if (!sub?.stripeSubscriptionId || sub.status !== "active") {
    return res.status(400).json({ error: "No active subscription found." });
  }

  const token = await getPayPalToken();
  await axios.post(
    `${PAYPAL_BASE}/v1/billing/subscriptions/${sub.stripeSubscriptionId}/cancel`,
    { reason: "Customer requested cancellation" },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  await prisma.subscription.update({
    where: { userId: req.user.id },
    data: { status: "canceled", cancelAtPeriodEnd: true },
  });

  return res.json({
    success: true,
    message: "Subscription cancelled. You keep access until the billing period ends.",
  });
});

// POST /api/billing/webhook — PayPal IPN/webhook events
// Register this URL in PayPal Developer dashboard under your app's Webhooks:
//   https://api.pulsedate.net/api/billing/webhook
// Events to subscribe to:
//   BILLING.SUBSCRIPTION.ACTIVATED, BILLING.SUBSCRIPTION.RENEWED,
//   BILLING.SUBSCRIPTION.CANCELLED, BILLING.SUBSCRIPTION.EXPIRED,
//   BILLING.SUBSCRIPTION.PAYMENT.FAILED, BILLING.SUBSCRIPTION.SUSPENDED
router.post("/webhook", async (req, res) => {
  try {
    await handleWebhookEvent(req.body);
  } catch (err) {
    console.error("PayPal webhook error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
  return res.json({ received: true });
});

async function handleWebhookEvent(event) {
  const resource = event.resource || {};

  switch (event.event_type) {
    case "BILLING.SUBSCRIPTION.ACTIVATED": {
      const subId = resource.id;
      const [userId, tier = "plus"] = (resource.custom_id || "").split(":");
      if (!userId) break;

      const periodEnd = resource.billing_info?.next_billing_time
        ? new Date(resource.billing_info.next_billing_time)
        : null;

      await prisma.subscription.upsert({
        where: { userId },
        update: {
          stripeSubscriptionId: subId,
          stripePriceId: resource.plan_id || "",
          tier,
          status: "active",
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
        create: {
          id: crypto.randomUUID(),
          userId,
          stripeCustomerId: resource.subscriber?.payer_id || "",
          stripeSubscriptionId: subId,
          stripePriceId: resource.plan_id || "",
          tier,
          status: "active",
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      });
      await prisma.user.update({
        where: { id: userId },
        data: { isPremium: true, premiumTier: tier },
      });
      break;
    }

    case "BILLING.SUBSCRIPTION.RENEWED": {
      const subId = resource.id;
      const periodEnd = resource.billing_info?.next_billing_time
        ? new Date(resource.billing_info.next_billing_time)
        : null;
      if (periodEnd) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: subId },
          data: { status: "active", currentPeriodEnd: periodEnd },
        });
      }
      break;
    }

    case "BILLING.SUBSCRIPTION.CANCELLED":
    case "BILLING.SUBSCRIPTION.EXPIRED": {
      const subId = resource.id;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subId },
        data: { tier: "free", status: "canceled", cancelAtPeriodEnd: false },
      });
      const dbSub = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subId },
      });
      if (dbSub) {
        await prisma.user.update({
          where: { id: dbSub.userId },
          data: { isPremium: false, premiumTier: "free" },
        });
      }
      break;
    }

    case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
    case "BILLING.SUBSCRIPTION.SUSPENDED": {
      const subId = resource.id;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subId },
        data: { status: "past_due" },
      });
      break;
    }

    default:
      break;
  }
}

export default router;

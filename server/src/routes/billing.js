import crypto from "crypto";
import { Router } from "express";
import axios from "axios";
import Stripe from "stripe";
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

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const STRIPE_PRICE_PLUS_ID = process.env.STRIPE_PRICE_PLUS_ID || "";
const STRIPE_PRICE_GOLD_ID = process.env.STRIPE_PRICE_GOLD_ID || "";

// PayPal API base — sandbox for dev/test, live for production
const PAYPAL_BASE =
  NODE_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

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
    stripePriceId: () => STRIPE_PRICE_PLUS_ID,
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
    stripePriceId: () => STRIPE_PRICE_GOLD_ID,
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
  const providers = {
    paypal: Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET && PAYPAL_PLAN_PLUS_ID && PAYPAL_PLAN_GOLD_ID),
    stripeCard: Boolean(STRIPE_SECRET_KEY && STRIPE_PRICE_PLUS_ID && STRIPE_PRICE_GOLD_ID),
  };

  return res.json({
    providers,
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

// POST /api/billing/checkout — create a subscription checkout session for PayPal or Stripe
router.post("/checkout", requireAuth, async (req, res) => {
  const { tier, provider = "paypal" } = req.body;
  if (!["plus", "gold"].includes(tier)) {
    return res.status(400).json({ error: "Invalid tier. Choose plus or gold." });
  }

  if (!["paypal", "stripe"].includes(provider)) {
    return res.status(400).json({ error: "Invalid provider. Choose paypal or stripe." });
  }

  if (provider === "stripe") {
    if (!stripe) {
      return res.status(503).json({ error: "Card checkout is not configured yet." });
    }

    const stripePriceId = PLANS[tier].stripePriceId();
    if (!stripePriceId) {
      return res.status(503).json({ error: "Card checkout plan is not configured yet." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const baseUrl = CLIENT_URL.split(",")[0].trim();
    let session;
    try {
      session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      metadata: { userId: user.id, tier },
      subscription_data: {
        metadata: { userId: user.id, tier },
      },
        success_url: `${baseUrl}/billing/success?provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/upgrade`,
      });
    } catch (stripeErr) {
      return res.status(502).json({ error: `Stripe error: ${stripeErr.message}` });
    }

    await prisma.subscription.upsert({
      where: { userId: user.id },
      update: {
        stripeCustomerId: `stripe_pending_${user.id}`,
        stripeSubscriptionId: null,
        stripePriceId: stripePriceId,
        tier,
        status: "pending",
      },
      create: {
        id: crypto.randomUUID(),
        userId: user.id,
        stripeCustomerId: `stripe_pending_${user.id}`,
        stripeSubscriptionId: null,
        stripePriceId: stripePriceId,
        tier,
        status: "pending",
      },
    });

    return res.json({ url: session.url });
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
      stripeCustomerId: `paypal_pending_${user.id}`,
      stripeSubscriptionId: response.data.id,
      stripePriceId: planId,
      tier,
      status: "pending",
    },
    create: {
      id: crypto.randomUUID(),
      userId: user.id,
      stripeCustomerId: `paypal_pending_${user.id}`,
      stripeSubscriptionId: response.data.id,
      stripePriceId: planId,
      tier,
      status: "pending",
    },
  });

  return res.json({ url: approveLink.href });
});

// POST /api/billing/stripe/confirm — activate a Stripe subscription after checkout redirect
router.post("/stripe/confirm", requireAuth, async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) {
    return res.status(400).json({ error: "session_id is required" });
  }
  if (!stripe) {
    return res.status(503).json({ error: "Card checkout is not configured yet." });
  }

  const session = await stripe.checkout.sessions.retrieve(session_id, {
    expand: ["subscription", "customer"],
  });

  const sub = session.subscription;
  if (!sub || typeof sub === "string") {
    return res.status(400).json({ error: "Stripe subscription not found in checkout session." });
  }

  const userId = sub.metadata?.userId || session.metadata?.userId;
  const tier = sub.metadata?.tier || session.metadata?.tier || "plus";
  if (userId !== req.user.id) {
    return res.status(403).json({ error: "Checkout session does not belong to this account." });
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || `stripe_pending_${userId}`;

  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: sub.items?.data?.[0]?.price?.id || "",
      tier,
      status: sub.status === "active" || sub.status === "trialing" ? "active" : "pending",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
    create: {
      id: crypto.randomUUID(),
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: sub.items?.data?.[0]?.price?.id || "",
      tier,
      status: sub.status === "active" || sub.status === "trialing" ? "active" : "pending",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    },
  });

  if (sub.status === "active" || sub.status === "trialing") {
    await prisma.user.update({
      where: { id: userId },
      data: { isPremium: true, premiumTier: tier },
    });
  }

  return res.json({ success: true, tier, status: sub.status });
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

  if (sub.stripeSubscriptionId?.startsWith("sub_")) {
    if (!stripe) {
      return res.status(503).json({ error: "Card billing is not configured." });
    }
    const updated = await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    const periodEnd = updated.current_period_end
      ? new Date(updated.current_period_end * 1000)
      : sub.currentPeriodEnd;

    await prisma.subscription.update({
      where: { userId: req.user.id },
      data: {
        status: "active",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: true,
      },
    });

    return res.json({
      success: true,
      message: "Subscription cancelled. You keep access until the billing period ends.",
    });
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

// POST /api/billing/webhook/stripe — Stripe webhook events
router.post("/webhook/stripe", async (req, res) => {
  try {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ error: "Stripe webhook is not configured." });
    }
    const sig = req.headers["stripe-signature"];
    if (!sig) return res.status(400).json({ error: "Missing stripe-signature header" });

    const event = stripe.webhooks.constructEvent(req.rawBody || "", sig, STRIPE_WEBHOOK_SECRET);
    await handleStripeWebhookEvent(event);
    return res.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook error:", err);
    return res.status(400).json({ error: "Webhook processing failed" });
  }
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

async function handleStripeWebhookEvent(event) {
  const localStatusFromStripe = (stripeStatus) => {
    switch (stripeStatus) {
      case "active":
        return "active";
      case "trialing":
        return "trialing";
      case "past_due":
      case "incomplete":
      case "paused":
        return "past_due";
      case "canceled":
      case "incomplete_expired":
      case "unpaid":
        return "canceled";
      default:
        return "pending";
    }
  };

  const resolveDbSubscription = async ({ stripeSubscriptionId, stripeCustomerId }) => {
    if (stripeSubscriptionId) {
      const bySubId = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId },
      });
      if (bySubId) return bySubId;
    }
    if (stripeCustomerId) {
      return prisma.subscription.findFirst({
        where: { stripeCustomerId: String(stripeCustomerId) },
      });
    }
    return null;
  };

  const upsertFromStripeSubscription = async (sub) => {
    const dbExisting = await resolveDbSubscription({
      stripeSubscriptionId: sub.id,
      stripeCustomerId: sub.customer,
    });

    const userId = sub.metadata?.userId || dbExisting?.userId;
    if (!userId) return;

    const tier = sub.metadata?.tier || dbExisting?.tier || "plus";
    const localStatus = localStatusFromStripe(sub.status);
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
    const stripeCustomerId = String(sub.customer || dbExisting?.stripeCustomerId || `stripe_pending_${userId}`);

    await prisma.subscription.upsert({
      where: { userId },
      update: {
        stripeCustomerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: sub.items?.data?.[0]?.price?.id || dbExisting?.stripePriceId || "",
        tier,
        status: localStatus,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      },
      create: {
        id: crypto.randomUUID(),
        userId,
        stripeCustomerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: sub.items?.data?.[0]?.price?.id || "",
        tier,
        status: localStatus,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      },
    });

    if (localStatus === "active" || localStatus === "trialing") {
      await prisma.user.update({
        where: { id: userId },
        data: { isPremium: true, premiumTier: tier },
      });
    } else if (localStatus === "canceled") {
      await prisma.user.update({
        where: { id: userId },
        data: { isPremium: false, premiumTier: "free" },
      });
    }
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode !== "subscription" || !session.subscription) break;
      const stripeSub = await stripe.subscriptions.retrieve(String(session.subscription));
      await upsertFromStripeSubscription(stripeSub);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      await upsertFromStripeSubscription(sub);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const dbSub = await prisma.subscription.findFirst({
        where: { stripeSubscriptionId: sub.id },
      });
      if (!dbSub) break;

      await prisma.subscription.update({
        where: { userId: dbSub.userId },
        data: {
          status: "canceled",
          tier: "free",
          cancelAtPeriodEnd: false,
        },
      });
      await prisma.user.update({
        where: { id: dbSub.userId },
        data: { isPremium: false, premiumTier: "free" },
      });
      break;
    }

    case "invoice.payment_failed":
    case "invoice.payment_action_required": {
      const invoice = event.data.object;
      const stripeSubscriptionId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
      if (!stripeSubscriptionId) break;

      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId },
        data: { status: "past_due" },
      });
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object;
      const stripeSubscriptionId = typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription?.id;
      if (!stripeSubscriptionId) break;

      const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      await upsertFromStripeSubscription(stripeSub);
      break;
    }

    default:
      break;
  }
}

export default router;

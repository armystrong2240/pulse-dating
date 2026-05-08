import { Resend } from "resend";
import nodemailer from "nodemailer";

async function send(to, subject, html) {
  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({ from: "PulseDate 💘 <noreply@pulsedate.net>", to, subject, html });
    return;
  }
  // Dev fallback: Ethereal fake SMTP
  const testAccount = await nodemailer.createTestAccount();
  const t = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    auth: { user: testAccount.user, pass: testAccount.pass },
  });
  const info = await t.sendMail({ from: '"PulseDate 💘" <noreply@pulsedate.net>', to, subject, html });
  console.log("📧 Preview URL:", nodemailer.getTestMessageUrl(info));
}

export async function sendVerificationEmail(to, name, token, baseUrl) {
  const url = `${baseUrl}/verify-email?token=${token}`;
  await send(to, "Verify your PulseDate email", `
    <h2>Hey ${name}!</h2>
    <p>Welcome to PulseDate — tap the button below to verify your email.</p>
    <p><a href="${url}" style="background:#e91e8c;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Verify Email</a></p>
    <p style="color:#888;font-size:12px">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
  `);
}

export async function sendPasswordResetEmail(to, name, url) {
  await send(to, "Reset your PulseDate password", `
    <h2>Hey ${name}!</h2>
    <p>We received a request to reset your PulseDate password.</p>
    <p><a href="${url}" style="background:#e91e8c;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Reset Password</a></p>
    <p style="color:#888;font-size:12px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `);
}

export async function sendMagicLoginEmail(to, name, url) {
  await send(to, "Your PulseDate sign-in link", `
    <h2>Hey ${name || "there"}!</h2>
    <p>Use this secure link to sign in to PulseDate.</p>
    <p><a href="${url}" style="background:#1f9d55;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Sign in securely</a></p>
    <p style="color:#888;font-size:12px">This link expires in 15 minutes and can only be used once.</p>
  `);
}

// ── Drip campaign emails ──────────────────────────────────────────────────────

const APP_URL = process.env.CLIENT_URL?.split(",")[0]?.trim() || "https://www.pulsedate.net";

export async function sendDripDay1(to, name) {
  await send(to, "Your PulseDate profile is ready 🌟", `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#e91e8c">Hey ${name}! Your profile is live 🎉</h2>
      <p>You're one step away from your first match. Here's how to get started fast:</p>
      <ul style="line-height:2">
        <li><strong>Add a great photo</strong> — profiles with photos get 9× more likes</li>
        <li><strong>Fill your bio</strong> — a sentence or two about you goes a long way</li>
        <li><strong>Start swiping</strong> — matches are waiting right now</li>
      </ul>
      <p><a href="${APP_URL}/onboarding" style="background:#e91e8c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700">Complete My Profile →</a></p>
      <p style="color:#888;font-size:12px">You're receiving this because you joined PulseDate. <a href="${APP_URL}/profile">Manage preferences</a></p>
    </div>
  `);
}

export async function sendDripDay3(to, name) {
  await send(to, "You have new potential matches waiting 💘", `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#e91e8c">Hey ${name}, don't miss out!</h2>
      <p>New people join PulseDate every day and some of them match your interests. Come check who's nearby.</p>
      <p>💡 <strong>Pro tip:</strong> Users who send the first message are <strong>3× more likely</strong> to get a response.</p>
      <p><a href="${APP_URL}/" style="background:#e91e8c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700">See Who's Online →</a></p>
      <p style="color:#888;font-size:12px"><a href="${APP_URL}/profile">Manage preferences</a></p>
    </div>
  `);
}

export async function sendDripDay7(to, name) {
  await send(to, "Last chance — your matches may expire soon ⏰", `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#e91e8c">Hey ${name} — matches expire in 72 hours without a message!</h2>
      <p>Don't let a great connection slip away. Jump back in and start a conversation.</p>
      <p>✨ <strong>Upgrade to PulseDate Plus</strong> and get unlimited likes, profile boosts, and see who already liked you.</p>
      <p>
        <a href="${APP_URL}/" style="background:#e91e8c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700;margin-right:8px">Go to Matches →</a>
        <a href="${APP_URL}/upgrade" style="background:#9b59b6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700">Upgrade →</a>
      </p>
      <p style="color:#888;font-size:12px"><a href="${APP_URL}/profile">Manage preferences</a></p>
    </div>
  `);
}

export async function sendDripDay14(to, name) {
  await send(to, `We miss you, ${name} 😢`, `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#e91e8c">Hey ${name}, it's been a while!</h2>
      <p>There are new members in your area who match your preferences. Come see who's new.</p>
      <p>🎁 Use your referral link to invite a friend — you both get <strong>bonus Roses</strong> for it!</p>
      <p><a href="${APP_URL}/" style="background:#e91e8c;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:700">Come Back →</a></p>
      <p style="color:#888;font-size:12px"><a href="${APP_URL}/profile">Manage preferences</a></p>
    </div>
  `);
}

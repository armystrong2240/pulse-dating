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

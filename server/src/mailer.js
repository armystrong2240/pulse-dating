import nodemailer from "nodemailer";

// For development: use Ethereal (fake SMTP that captures emails).
// In production set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars.
let _transporter = null;

async function getTransporter() {
  if (_transporter) return _transporter;
  if (process.env.SMTP_HOST) {
    _transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  } else {
    const testAccount = await nodemailer.createTestAccount();
    _transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.log("📧 Ethereal test account:", testAccount.user);
  }
  return _transporter;
}

export async function sendVerificationEmail(to, name, token, baseUrl) {
  const t = await getTransporter();
  const url = `${baseUrl}/verify-email?token=${token}`;
  const info = await t.sendMail({
    from: '"PulseDate 💘" <noreply@pulsedate.net>',
    to,
    subject: "Verify your PulseDate email",
    html: `<h2>Hey ${name}!</h2>
<p>Welcome to PulseDate — tap the button below to verify your email.</p>
<p><a href="${url}" style="background:#e91e8c;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Verify Email</a></p>
<p style="color:#888;font-size:12px">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>`,
  });
  if (!process.env.SMTP_HOST) {
    console.log("📧 Preview URL:", nodemailer.getTestMessageUrl(info));
  }
}

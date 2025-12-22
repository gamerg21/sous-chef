import nodemailer from "nodemailer";

/**
 * Check if SMTP is configured
 */
export function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  );
}

/**
 * Get SMTP transporter if configured
 */
function getTransporter() {
  if (!isSmtpConfigured()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

/**
 * Send password reset email
 * @param email - Recipient email address
 * @param token - Password reset token
 * @param resetUrl - Full URL to reset password page
 * @returns true if email was sent, false if SMTP not configured
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  resetUrl: string
): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    return false;
  }

  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || "noreply@example.com";

  try {
    await transporter.sendMail({
      from,
      to: email,
      subject: "Reset your Sous Chef password",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 32px;">
              <h1 style="color: #059669; font-size: 24px; margin-top: 0; margin-bottom: 16px;">
                Reset your password 🍳
              </h1>
              <p style="margin-top: 0; margin-bottom: 16px;">
                You requested to reset your password for Sous Chef. Click the button below to reset your password:
              </p>
              <div style="margin: 24px 0;">
                <a href="${resetUrl}" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500;">
                  Reset Password
                </a>
              </div>
              <p style="margin-top: 24px; margin-bottom: 8px; font-size: 14px; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin-top: 0; margin-bottom: 24px; font-size: 12px; color: #9ca3af; word-break: break-all;">
                ${resetUrl}
              </p>
              <p style="margin-top: 24px; margin-bottom: 0; font-size: 14px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 16px;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
              </p>
            </div>
          </body>
        </html>
      `,
      text: `
Reset your password 🍳

You requested to reset your password for Sous Chef. Click the link below to reset your password:

${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
      `.trim(),
    });

    return true;
  } catch (error) {
    console.error("[EMAIL] Failed to send password reset email:", error);
    return false;
  }
}


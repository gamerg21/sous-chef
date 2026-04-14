import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { resolveAllowedRedirectUrl } from "../src/lib/app-url";
import { isValidEmail, normalizeEmail } from "../src/lib/auth-utils";

function getPasswordProfile(params: Record<string, unknown>) {
  const rawEmail = typeof params.email === "string" ? params.email : "";
  const email = normalizeEmail(rawEmail);

  if (!isValidEmail(email)) {
    throw new Error("Invalid email address");
  }

  const rawName = typeof params.name === "string" ? params.name.trim() : "";
  const profile: Record<string, string> = { email };

  if (rawName) {
    profile.name = rawName;
  }

  return profile as Record<string, string> & { email: string };
}

function validatePasswordRequirements(password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  if (password.length > 128) {
    throw new Error("Password must be less than 128 characters");
  }
}

const passwordResetProvider = Email({
  async sendVerificationRequest({ identifier, url, expires }) {
    if (process.env.RESEND_API_KEY) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:
            process.env.SMTP_FROM ??
            "Sous Chef <no-reply@souschef.local>",
          to: identifier,
          subject: "Reset your Sous Chef password",
          html: [
            "<p>Use the link below to reset your Sous Chef password.</p>",
            `<p><a href="${url}">Reset password</a></p>`,
            `<p>This link expires at ${expires.toUTCString()}.</p>`,
          ].join(""),
          text: [
            "Reset your Sous Chef password.",
            "",
            url,
            "",
            `This link expires at ${expires.toUTCString()}.`,
          ].join("\n"),
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to send password reset email: ${response.status} ${response.statusText}`,
        );
      }

      return;
    }

    console.warn(
      "[auth] Password reset email delivery is not configured. " +
        "Set RESEND_API_KEY to send emails automatically.",
    );
    console.info(`[auth] Password reset link for ${identifier}: ${url}`);
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        return getPasswordProfile(params);
      },
      reset: passwordResetProvider,
      validatePasswordRequirements,
    }),
  ],
  callbacks: {
    async redirect({ redirectTo }) {
      return resolveAllowedRedirectUrl(redirectTo);
    },
  },
});

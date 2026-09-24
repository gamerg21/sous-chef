"use client";
import { Loader2 } from "lucide-react";
import { eyebrowClassName } from "@/components/ui/kit";
import { AuthCard, AuthMessage, authInputClassName, authQuietLinkClassName, authSubmitClassName } from "../auth-card";

import { useAuthActions } from "@/lib/kitchen/client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { isValidEmail, normalizeEmail } from "@/lib/auth-utils";

export default function ForgotPassword() {
  const [delivery, setDelivery] = useState<{mode:string}>();
  useEffect(() => { void fetch('/api/auth').then(r=>r.json()).then(data=>setDelivery({mode:data.resetMode})); }, []);
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    // Validate email format
    if (!email.trim()) {
      setMessage("Error: Email is required");
      setIsLoading(false);
      return;
    }

    if (!isValidEmail(email)) {
      setMessage("Error: Please enter a valid email address");
      setIsLoading(false);
      return;
    }

    try {
      const normalizedEmail = normalizeEmail(email);


      const formData = new FormData();
      formData.set("email", normalizedEmail);
      formData.set("flow", "reset");
      formData.set(
        "redirectTo",
        `/auth/reset-password?email=${encodeURIComponent(normalizedEmail)}`,
      );

      await signIn("password", formData);
      setMessage(
        delivery?.mode === 'operator'
          ? "Recovery requested. This instance does not send email. Ask the instance owner to reset your password using the local recovery command."
          : "If an account with that email exists, a password reset link has been sent.",
      );
    } catch (error) {
      console.error("Forgot password error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to request password reset";

      if (
        /not configured|SITE_URL|APP_BASE_URL|Internal Server Error|Provider/i.test(
          errorMessage,
        )
      ) {
        setMessage(
          "Error: Password reset is not configured correctly. Check the auth environment and server logs.",
        );
      } else if (/InvalidAccountId|Invalid credentials/i.test(errorMessage)) {
        setMessage(
          delivery?.mode === 'operator'
            ? "Recovery requested. This instance does not send email. Ask the instance owner to reset your password using the local recovery command."
            : "If an account with that email exists, a password reset link has been sent.",
        );
      } else {
        setMessage("Error: We couldn’t complete the reset request. Please try again in a few minutes, or contact the instance owner.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description={delivery?.mode === 'operator' ? 'Email delivery isn’t enabled on this instance. You can request a recovery link from the instance owner.' : 'Enter your email address to request a password reset link.'}
      footer={
        <>
          <Link href="/auth/signin" className={authQuietLinkClassName}>
            Back to sign in
          </Link>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Without email delivery, the server operator can reset your password locally.
          </p>
        </>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="email" className={eyebrowClassName}>
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClassName}
            placeholder="Email address"
          />
        </div>

        <AuthMessage message={message} role="status" />

        <button
          type="submit"
          disabled={isLoading || !delivery}
          className={authSubmitClassName}
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isLoading ? "Requesting…" : delivery?.mode === 'operator' ? "Request recovery link" : "Send reset link"}
        </button>
      </form>
    </AuthCard>
  );
}

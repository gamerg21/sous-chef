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
  const [configError, setConfigError] = useState(false);
  useEffect(() => {
    void fetch('/api/auth').then(r => {
      if (!r.ok) throw new Error('Unable to load recovery settings');
      return r.json();
    }).then(data => setDelivery({mode: data.resetMode})).catch(() => setConfigError(true));
  }, []);
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
      setMessage("If an account with that email exists, check your inbox for a reset link. Check spam too. The link expires after one hour. If it does not arrive, use the recovery instructions below.");
    } catch {
      setMessage("Error: We couldn’t send the reset request. Try again later, or use the recovery instructions below.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      description={delivery?.mode === 'operator' ? 'Password reset emails aren’t set up for this kitchen. You can still reset your password on the computer running Sous Chef.' : delivery ? 'Enter the email address you use to sign in.' : configError ? 'We couldn’t check whether email recovery is available. Reload this page or use the instructions below.' : 'Checking password recovery options…'}
      footer={
        <Link href="/auth/signin" className={authQuietLinkClassName}>
          Back to sign in
        </Link>
      }
    >
      <>
      {delivery?.mode === 'email' && <form className="space-y-5" onSubmit={handleSubmit}>
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
          {isLoading ? "Requesting…" : "Send reset link"}
        </button>
      </form>}

      <div className={`space-y-3 text-sm text-stone-600 dark:text-stone-400${delivery?.mode === 'email' ? ' mt-8' : ''}`}>
        <h2 className="font-semibold text-stone-900 dark:text-stone-100">Reset without email</h2>
        <p><strong>Did you install Sous Chef?</strong> You can reset your own password from the computer running it. You do not need to sign in or edit the database.</p>
        <p><strong>Did someone else set it up?</strong> Ask that person to reset the password for your sign-in email address. This page does not send them a notification.</p>
        <Link href="/auth/recovery" className="block font-medium text-emerald-600 dark:text-emerald-400 underline">Show step-by-step recovery instructions</Link>
        <a href="https://github.com/gamerg21/sous-chef/blob/main/docs/PASSWORD_RECOVERY.md#optional-set-up-password-reset-emails" className="block underline">Set up password reset emails (optional)</a>
      </div>
      </>
    </AuthCard>
  );
}

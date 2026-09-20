"use client";

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
    <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-sm dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-center text-3xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50" style={{ fontFamily: 'var(--font-heading)' }}>
            Reset your password
          </h1>
          <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
            {delivery?.mode === 'operator' ? 'Email delivery isn’t enabled on this instance. You can request a recovery link from the instance owner.' : 'Enter your email address to request a password reset link.'}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="sr-only">
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
              className="relative block w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-stone-900 dark:text-stone-50 placeholder-stone-500 dark:placeholder-stone-400 focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm transition-colors"
              placeholder="Email address"
            />
          </div>

          {message && (
            <div
              role="status"
              className={`rounded-md p-3 text-sm ${
                message.includes("Error")
                  ? "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 border border-red-200 dark:border-red-800"
                  : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
              }`}
            >
              {message}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading || !delivery}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Requesting…" : delivery?.mode === 'operator' ? "Request recovery link" : "Send reset link"}
            </button>
          </div>
        </form>

        {/* Sign in link */}
        <div className="text-center text-sm" style={{ fontFamily: 'var(--font-body)' }}>
          <Link
            href="/auth/signin"
            className="font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
          >
            Back to sign in
          </Link>
        </div>

        <p className="text-center text-xs text-stone-500 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
          Without email delivery, the server operator can reset your password locally.
        </p>
      </div>
    </div>
  );
}

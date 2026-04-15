"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { isValidEmail, normalizeEmail } from "@/lib/auth-utils";

function ResetPasswordFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div className="text-center text-stone-600 dark:text-stone-400">
          Loading...
        </div>
      </div>
    </div>
  );
}

function ResetPasswordContent() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const repairPasswordAccountByEmail = useMutation(
    api.users.repairPasswordAccountByEmail,
  );
  const router = useRouter();
  const searchParams = useSearchParams();

  const code = searchParams.get("code") ?? "";
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/inventory");
    }
  }, [authLoading, isAuthenticated, router]);

  const hasCode = code.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    const normalizedEmail = normalizeEmail(email);

    if (!hasCode) {
      setMessage("Error: This reset link is invalid or has expired.");
      setIsSubmitting(false);
      return;
    }

    if (!normalizedEmail) {
      setMessage("Error: Email is required");
      setIsSubmitting(false);
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setMessage("Error: Please enter a valid email address");
      setIsSubmitting(false);
      return;
    }

    if (!password) {
      setMessage("Error: Password is required");
      setIsSubmitting(false);
      return;
    }

    if (password.length < 8) {
      setMessage("Error: Password must be at least 8 characters");
      setIsSubmitting(false);
      return;
    }

    if (password.length > 128) {
      setMessage("Error: Password must be less than 128 characters");
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Error: Passwords do not match");
      setIsSubmitting(false);
      return;
    }

    try {
      await repairPasswordAccountByEmail({ email: normalizedEmail });

      const result = await signIn("password", {
        email: normalizedEmail,
        code,
        flow: "reset-verification",
        newPassword: password,
      });

      if (!result.signingIn) {
        setMessage("Error: Failed to finish password reset");
        setIsSubmitting(false);
        return;
      }

      setMessage("Password updated. Redirecting...");
      router.push("/inventory");
    } catch (error) {
      console.error("Reset password error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to reset password";
      setMessage(`Error: ${errorMessage}`);
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
        <div className="w-full max-w-md space-y-8 rounded-lg border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <div className="text-center text-stone-600 dark:text-stone-400">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  if (!hasCode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
        <div className="w-full max-w-md space-y-8 rounded-lg border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <div>
            <h1 className="text-center text-3xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50" style={{ fontFamily: 'var(--font-heading)' }}>
              Invalid Reset Link
            </h1>
            <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
              This password reset link is invalid or has expired.
            </p>
          </div>

          <div className="text-center space-y-4">
            <Link
              href="/auth/forgot-password"
              className="inline-block font-medium text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
            >
              Request a new reset link
            </Link>
            <div className="text-sm">
              <Link
                href="/auth/signin"
                className="text-stone-600 transition-colors hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div>
          <h1 className="text-center text-3xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50" style={{ fontFamily: 'var(--font-heading)' }}>
            Reset your password
          </h1>
          <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
            Enter your email and choose a new password.
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
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
                className="relative block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder-stone-500 transition-colors focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-50 dark:placeholder-stone-400 sm:text-sm"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                New password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder-stone-500 transition-colors focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-50 dark:placeholder-stone-400 sm:text-sm"
                placeholder="New password (min 8 characters)"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="relative block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder-stone-500 transition-colors focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-50 dark:placeholder-stone-400 sm:text-sm"
                placeholder="Confirm password"
              />
            </div>
          </div>

          {message && (
            <div
              className={`rounded-md p-3 text-sm ${
                message.includes("Error")
                  ? "border border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
              }`}
            >
              {message}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isSubmitting ? "Resetting password..." : "Reset password"}
            </button>
          </div>
        </form>

        <div className="text-center text-sm" style={{ fontFamily: 'var(--font-body)' }}>
          <Link
            href="/auth/signin"
            className="font-medium text-emerald-600 transition-colors hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

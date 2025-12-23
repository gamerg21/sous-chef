"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

export default function ResetPassword() {
  const router = useRouter();
  const params = useParams();
  const token = params?.token as string;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [message, setMessage] = useState("");
  const [tokenValid, setTokenValid] = useState(false);

  // Validate token on page load
  useEffect(() => {
    const validateToken = () => {
      if (!token) {
        return { valid: false, message: "Error: Invalid reset link" };
      }

      // Token format validation (basic check)
      if (token.length < 20) {
        return { valid: false, message: "Error: Invalid reset token format" };
      }

      // Token is present and looks valid
      return { valid: true, message: "" };
    };

    // Defer state updates to avoid synchronous setState in effect
    setTimeout(() => {
      const result = validateToken();
      if (result.valid) {
        setTokenValid(true);
        setMessage("");
      } else {
        setTokenValid(false);
        setMessage(result.message);
      }
      setIsValidating(false);
    }, 0);
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    // Client-side validation
    if (!password) {
      setMessage("Error: Password is required");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setMessage("Error: Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    if (password.length > 128) {
      setMessage("Error: Password must be less than 128 characters");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Error: Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/reset-password/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(`Error: ${data.error || "Failed to reset password"}`);
        setIsLoading(false);
        return;
      }

      // Success - show message and redirect
      setMessage("Password reset successfully! Redirecting to sign in...");
      setTimeout(() => {
        router.push("/auth/signin");
      }, 1500);
    } catch (error) {
      console.error("Reset password error:", error);
      setMessage("Error: Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  // Show loading state while validating token
  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
        <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-sm dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <div className="text-center">
            <p className="text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
              Validating reset token...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show error if token is invalid
  if (!tokenValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
        <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-sm dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
          <div>
            <h1 className="text-center text-3xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50" style={{ fontFamily: 'var(--font-heading)' }}>
              Invalid Reset Link
            </h1>
            <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
              {message || "This password reset link is invalid or has expired."}
            </p>
          </div>

          {message && (
            <div className="rounded-md p-3 text-sm bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 border border-red-200 dark:border-red-800">
              {message}
            </div>
          )}

          <div className="text-center space-y-4">
            <Link
              href="/auth/forgot-password"
              className="inline-block font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
            >
              Request a new reset link
            </Link>
            <div className="text-sm">
              <Link
                href="/auth/signin"
                className="text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 transition-colors"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show reset form
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-sm dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-center text-3xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50" style={{ fontFamily: 'var(--font-heading)' }}>
            Reset your password
          </h1>
          <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
            Enter your new password below
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="password" className="sr-only">
                New Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-stone-900 dark:text-stone-50 placeholder-stone-500 dark:placeholder-stone-400 focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm transition-colors"
                placeholder="New password (min 8 characters)"
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="relative block w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-stone-900 dark:text-stone-50 placeholder-stone-500 dark:placeholder-stone-400 focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm transition-colors"
                placeholder="Confirm password"
              />
            </div>
          </div>

          {message && (
            <div
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
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Resetting password..." : "Reset password"}
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
      </div>
    </div>
  );
}



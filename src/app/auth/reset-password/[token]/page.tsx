"use client";

import Link from "next/link";
export default function LegacyResetPasswordLink() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-lg border border-stone-200 bg-white p-8 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <div>
          <h1 className="text-center text-3xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50" style={{ fontFamily: 'var(--font-heading)' }}>
            Reset Link Expired
          </h1>
          <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
            This link uses the old reset format from before the Convex auth migration. Request a new password reset email to continue.
          </p>
        </div>

        {/* Sign in link */}
        <div className="space-y-4 text-center text-sm" style={{ fontFamily: 'var(--font-body)' }}>
          <Link
            href="/auth/forgot-password"
            className="font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
          >
            Request a new reset link
          </Link>
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


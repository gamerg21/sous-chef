"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useMutation } from "convex/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";

export default function SignIn() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const repairPasswordAccountByEmail = useMutation(
    api.users.repairPasswordAccountByEmail,
  );
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/inventory");
    }
  }, [isAuthenticated, router]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    if (!email.trim()) {
      setMessage("Error: Email is required");
      setIsLoading(false);
      return;
    }

    if (!password) {
      setMessage("Error: Password is required");
      setIsLoading(false);
      return;
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      await repairPasswordAccountByEmail({ email: normalizedEmail });

      const formData = new FormData();
      formData.set("email", normalizedEmail);
      formData.set("password", password);
      formData.set("flow", "signIn");
      await signIn("password", formData);
      // Don't router.push here — the useEffect watching isAuthenticated
      // will handle the redirect once auth state updates.
    } catch (error) {
      console.error("Sign-in error:", error);
      setMessage("Error: Invalid email or password");
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
        <div className="text-stone-600 dark:text-stone-400">Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-sm dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
        <div>
          <h1 className="text-center text-3xl font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50" style={{ fontFamily: 'var(--font-heading)' }}>
            Sign in to Sous Chef
          </h1>
          <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
            Sign in with your email and password
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handlePasswordSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email-password" className="sr-only">Email address</label>
              <input
                id="email-password"
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
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relative block w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-stone-900 dark:text-stone-50 placeholder-stone-500 dark:placeholder-stone-400 focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm transition-colors"
                placeholder="Password"
              />
            </div>
          </div>

          {message && (
            <div className={`rounded-md p-3 text-sm ${
              message.includes("Error")
                ? "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 border border-red-200 dark:border-red-800"
                : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
            }`}>
              {message}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </div>

          <div className="text-center text-sm" style={{ fontFamily: 'var(--font-body)' }}>
            <Link href="/auth/forgot-password" className="font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
              Forgot your password?
            </Link>
          </div>
        </form>

        <div className="text-center text-sm" style={{ fontFamily: 'var(--font-body)' }}>
          <span className="text-stone-600 dark:text-stone-400">Don&apos;t have an account? </span>
          <Link href="/auth/signup" className="font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignUp() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/inventory");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
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

    if (password.length < 8) {
      setMessage("Error: Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Error: Passwords do not match");
      setIsLoading(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.set("email", email.trim().toLowerCase());
      formData.set("password", password);
      formData.set("name", name.trim());
      formData.set("flow", "signUp");
      await signIn("password", formData);
      // Don't router.push here — the useEffect watching isAuthenticated
      // will handle the redirect once auth state updates.
    } catch (error) {
      console.error("Signup error:", error);
      setMessage("Error: Failed to create account. The email may already be in use.");
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
            Create your account
          </h1>
          <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
            Sign up for Sous Chef
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="sr-only">Name (optional)</label>
              <input id="name" name="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="relative block w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-stone-900 dark:text-stone-50 placeholder-stone-500 dark:placeholder-stone-400 focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm transition-colors" placeholder="Name (optional)" />
            </div>
            <div>
              <label htmlFor="email" className="sr-only">Email address</label>
              <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="relative block w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-stone-900 dark:text-stone-50 placeholder-stone-500 dark:placeholder-stone-400 focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm transition-colors" placeholder="Email address" />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input id="password" name="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="relative block w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-stone-900 dark:text-stone-50 placeholder-stone-500 dark:placeholder-stone-400 focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm transition-colors" placeholder="Password (min 8 characters)" />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">Confirm Password</label>
              <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="relative block w-full rounded-md border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 px-3 py-2 text-stone-900 dark:text-stone-50 placeholder-stone-500 dark:placeholder-stone-400 focus:z-10 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 sm:text-sm transition-colors" placeholder="Confirm password" />
            </div>
          </div>

          {message && (
            <div className={`rounded-md p-3 text-sm ${message.includes("Error") ? "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400 border border-red-200 dark:border-red-800" : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"}`}>
              {message}
            </div>
          )}

          <div>
            <button type="submit" disabled={isLoading} className="group relative flex w-full justify-center rounded-md border border-transparent bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 transition-colors">
              {isLoading ? "Creating account..." : "Sign up"}
            </button>
          </div>
        </form>

        <div className="text-center text-sm" style={{ fontFamily: 'var(--font-body)' }}>
          <span className="text-stone-600 dark:text-stone-400">Already have an account? </span>
          <Link href="/auth/signin" className="font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

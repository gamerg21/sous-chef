"use client";

import { signIn, useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { normalizeEmail, isValidEmail } from "@/lib/auth-utils";

type AuthMode = "magic-link" | "password";

export default function SignIn() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mode] = useState<AuthMode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Redirect if already signed in
  useEffect(() => {
    if (status === "authenticated" && session) {
      router.push("/inventory");
    }
  }, [status, session, router]);

  // handleMagicLinkSubmit is defined but not currently used (kept for future magic link feature)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
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
      const result = await signIn("email", {
        email: normalizedEmail,
        redirect: false,
        callbackUrl: "/inventory",
      });

      if (result?.error) {
        // Provide user-friendly error messages
        if (result.error === "EmailSignin") {
          setMessage("Error: Failed to send email. Please try again.");
        } else {
          setMessage(`Error: ${result.error}`);
        }
      } else {
        setMessage("Check your email for the sign-in link!");
      }
    } catch (error) {
      console.error("Magic link sign-in error:", error);
      setMessage("Error: Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    // Validate inputs
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

    if (!password) {
      setMessage("Error: Password is required");
      setIsLoading(false);
      return;
    }

    try {
      const normalizedEmail = normalizeEmail(email);
      const result = await signIn("credentials", {
        email: normalizedEmail,
        password,
        redirect: false,
        callbackUrl: "/inventory",
      });

      if (result?.error) {
        // Provide user-friendly error message without revealing if user exists
        if (result.error === "CredentialsSignin") {
          setMessage("Error: Invalid email or password");
        } else {
          setMessage("Error: Sign-in failed. Please try again.");
        }
      } else if (result?.ok) {
        // Successful sign-in - redirect to inventory
        window.location.href = "/inventory";
      } else {
        // Unexpected result format - try redirect anyway
        setMessage("Signing you in...");
        setTimeout(() => {
          window.location.href = "/inventory";
        }, 500);
      }
    } catch (error) {
      console.error("Password sign-in error:", error);
      setMessage("Error: Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading state while checking session
  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 font-sans dark:bg-stone-950">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  // Don't render the form if already authenticated (redirect will happen)
  if (status === "authenticated") {
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
            Sign in to Sous Chef 🍳
          </h1>
          <p className="mt-2 text-center text-sm text-stone-600 dark:text-stone-400" style={{ fontFamily: 'var(--font-body)' }}>
            Sign in with your email and password
          </p>
        </div>

        {/* Password Form */}
        {mode === "password" && (
          <form className="mt-8 space-y-6" onSubmit={handlePasswordSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="email-password" className="sr-only">
                  Email address
                </label>
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
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
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
                <div className="mt-2 text-right">
                  <Link
                    href="/auth/forgot-password"
                    className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
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
                {isLoading ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>
        )}

        {/* Sign up link */}
        <div className="text-center text-sm" style={{ fontFamily: 'var(--font-body)' }}>
          <span className="text-stone-600 dark:text-stone-400">Don&apos;t have an account? </span>
          <Link
            href="/auth/signup"
            className="font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
          >
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}

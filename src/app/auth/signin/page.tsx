"use client";
import { Loader2 } from "lucide-react";
import { AppSplash } from "@/components/ui/page-loader";
import { eyebrowClassName } from "@/components/ui/kit";
import { AuthCard, AuthMessage, authInputClassName, authLinkClassName, authSubmitClassName } from "../auth-card";

import { useAuthActions } from "@/lib/kitchen/client";
import { useKitchenAuth } from "@/lib/kitchen/client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignIn() {
  const { isAuthenticated, isLoading: authLoading } = useKitchenAuth();
  const { signIn } = useAuthActions();
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

  if (authLoading || isAuthenticated) {
    return <AppSplash />;
  }

  return (
    <AuthCard
      title="Sign in to Sous Chef"
      description="Sign in with your email and password"
      footer={
        <p>
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className={authLinkClassName}>
            Sign up
          </Link>
        </p>
      }
    >
      <form className="space-y-5" onSubmit={handlePasswordSubmit}>
        <div>
          <label htmlFor="email-password" className={eyebrowClassName}>Email address</label>
          <input
            id="email-password"
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
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="password" className={eyebrowClassName}>Password</label>
            <Link href="/auth/forgot-password" className="text-xs font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300">
              Forgot your password?
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authInputClassName}
            placeholder="Password"
          />
        </div>

        <AuthMessage message={message} />

        <button type="submit" disabled={isLoading} className={authSubmitClassName}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isLoading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}

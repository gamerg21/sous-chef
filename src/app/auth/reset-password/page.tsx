"use client";
import { Loader2 } from "lucide-react";
import { AppSplash } from "@/components/ui/page-loader";
import { eyebrowClassName } from "@/components/ui/kit";
import { AuthCard, AuthMessage, authInputClassName, authLinkClassName, authQuietLinkClassName, authSubmitClassName } from "../auth-card";

import { useAuthActions } from "@/lib/kitchen/client";
import { useKitchenAuth } from "@/lib/kitchen/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isValidEmail, normalizeEmail } from "@/lib/auth-utils";

function ResetPasswordFallback() {
  return <AppSplash />;
}

function ResetPasswordContent() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useKitchenAuth();
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
    return <AppSplash />;
  }

  if (!hasCode) {
    return (
      <AuthCard
        title="Invalid Reset Link"
        description="This password reset link is invalid or has expired."
        footer={
          <Link href="/auth/signin" className={authQuietLinkClassName}>
            Back to sign in
          </Link>
        }
      >
        <Link href="/auth/forgot-password" className={authSubmitClassName}>
          Request a new reset link
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and choose a new password."
      footer={
        <Link href="/auth/signin" className={authLinkClassName}>
          Back to sign in
        </Link>
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
        <div>
          <label htmlFor="password" className={eyebrowClassName}>
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
            className={authInputClassName}
            placeholder="New password (min 8 characters)"
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className={eyebrowClassName}>
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
            className={authInputClassName}
            placeholder="Confirm password"
          />
        </div>

        <AuthMessage message={message} />

        <button type="submit" disabled={isSubmitting} className={authSubmitClassName}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Resetting password..." : "Reset password"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function ResetPassword() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

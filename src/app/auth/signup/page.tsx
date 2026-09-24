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

export default function SignUp() {
  const { isAuthenticated, isLoading: authLoading } = useKitchenAuth();
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

  if (authLoading || isAuthenticated) {
    return <AppSplash />;
  }

  return (
    <AuthCard
      title="Create your account"
      description="Sign up for Sous Chef"
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/auth/signin" className={authLinkClassName}>
            Sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name" className={eyebrowClassName}>Name (optional)</label>
          <input id="name" name="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={authInputClassName} placeholder="Name (optional)" />
        </div>
        <div>
          <label htmlFor="email" className={eyebrowClassName}>Email address</label>
          <input id="email" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={authInputClassName} placeholder="Email address" />
        </div>
        <div>
          <label htmlFor="password" className={eyebrowClassName}>Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={authInputClassName} placeholder="Password (min 8 characters)" />
        </div>
        <div>
          <label htmlFor="confirmPassword" className={eyebrowClassName}>Confirm Password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={authInputClassName} placeholder="Confirm password" />
        </div>

        <AuthMessage message={message} />

        <button type="submit" disabled={isLoading} className={authSubmitClassName}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isLoading ? "Creating account..." : "Sign up"}
        </button>
      </form>
    </AuthCard>
  );
}

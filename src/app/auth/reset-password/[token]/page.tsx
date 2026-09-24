"use client";

import Link from "next/link";
import { AuthCard, authQuietLinkClassName, authSubmitClassName } from "../../auth-card";

export default function LegacyResetPasswordLink() {
  return (
    <AuthCard
      title="Reset Link Expired"
      description="This link uses the old reset format from an older account system. Request a new password reset email to continue."
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

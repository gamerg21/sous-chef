import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { normalizeEmail, isValidEmail } from "@/lib/auth-utils";
import { sendPasswordResetEmail, isSmtpConfigured } from "@/lib/email";
import { randomBytes } from "crypto";

const requestSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address")
    .refine((email) => isValidEmail(email), {
      message: "Invalid email format",
    }),
});

const TOKEN_EXPIRY_SECONDS = Number(process.env.PASSWORD_RESET_TOKEN_EXPIRY) || 3600; // 1 hour default

export async function POST(request: NextRequest) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (error) {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Validate input
    const validatedData = requestSchema.parse(body);

    // Normalize email for consistent storage
    const normalizedEmail = normalizeEmail(validatedData.email);

    // Check if user exists (but don't reveal if they don't - security best practice)
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true },
    });

    // Always return success to prevent user enumeration
    // If user doesn't exist, we still generate a token but don't send email
    // This prevents attackers from discovering which emails are registered

    // Generate cryptographically secure random token (32 bytes = 256 bits)
    const token = randomBytes(32).toString("base64url");

    // Calculate expiration time
    const expires = new Date(Date.now() + TOKEN_EXPIRY_SECONDS * 1000);

    // Delete any existing tokens for this email first
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: normalizedEmail,
      },
    });

    // Create new token
    await prisma.verificationToken.create({
      data: {
        identifier: normalizedEmail,
        token,
        expires,
      },
    });

    // If user exists and SMTP is configured, send email
    let emailSent = false;
    if (user && isSmtpConfigured()) {
      const resetUrl = `${process.env.NEXTAUTH_URL || request.headers.get("origin") || "http://localhost:3000"}/auth/reset-password/${token}`;
      emailSent = await sendPasswordResetEmail(normalizedEmail, token, resetUrl);
    }

    // Always return success message (security best practice)
    return NextResponse.json(
      {
        message: "If an account with that email exists, a password reset link has been sent.",
        // Include token in response if SMTP not configured (for self-hosted environments)
        ...(user && !isSmtpConfigured() ? { token, resetUrl: `/auth/reset-password/${token}` } : {}),
        emailSent,
      },
      { status: 200 }
    );
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return NextResponse.json(
        { error: firstError?.message || "Validation error" },
        { status: 400 }
      );
    }

    // Log error for debugging but don't expose details to client
    console.error("Password reset request error:", error);
    // Still return success to prevent user enumeration
    return NextResponse.json(
      { message: "If an account with that email exists, a password reset link has been sent." },
      { status: 200 }
    );
  }
}


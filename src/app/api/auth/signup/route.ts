import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { normalizeEmail, isValidEmail } from "@/lib/auth-utils";
import { Prisma } from "@/generated/prisma/client";

const signupSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Invalid email address")
    .refine((email) => isValidEmail(email), {
      message: "Invalid email format",
    }),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be less than 128 characters"),
  name: z
    .string()
    .max(255, "Name must be less than 255 characters")
    .optional()
    .nullable(),
});

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
    const validatedData = signupSchema.parse(body);

    // Normalize email for consistent storage
    const normalizedEmail = normalizeEmail(validatedData.email);

    // Check if user already exists (using normalized email)
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      // Return generic error to prevent user enumeration
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 400 }
      );
    }

    // Hash password with salt rounds
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Create user with normalized email
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: validatedData.name?.trim() || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { message: "User created successfully", user },
      { status: 201 }
    );
  } catch (error) {
    // Handle validation errors
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || "Validation error" },
        { status: 400 }
      );
    }

    // Handle Prisma unique constraint violations
    if (error && typeof error === 'object' && 'code' in error) {
      const prismaError = error as { code?: string };
      if (prismaError.code === "P2002") {
        // Unique constraint violation
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 400 }
        );
      }
    }

    // Log error for debugging but don't expose details to client
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Failed to create account. Please try again." },
      { status: 500 }
    );
  }
}


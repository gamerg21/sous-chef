import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { normalizeEmail } from "@/lib/auth-utils";

const updateProfileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long").optional(),
  email: z.string().email("Invalid email address").optional(),
  image: z.string().url("Invalid image URL").nullable().optional(),
});

/**
 * GET /api/user/profile
 * Get current user's profile
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/profile
 * Update current user's profile
 */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = updateProfileSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: validation.error.errors },
        { status: 400 }
      );
    }

    const updateData: {
      name?: string;
      email?: string;
      image?: string | null;
      emailVerified?: Date | null;
    } = {};

    if (validation.data.name !== undefined) {
      updateData.name = validation.data.name;
    }

    if (validation.data.email !== undefined) {
      const normalizedEmail = normalizeEmail(validation.data.email);
      
      // Get current user to check if email is changing
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { email: true },
      });

      // Check if email is already taken by another user
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (existingUser && existingUser.id !== session.user.id) {
        return NextResponse.json(
          { error: "Email is already taken" },
          { status: 400 }
        );
      }

      updateData.email = normalizedEmail;
      // Reset email verification if email changed
      if (currentUser && normalizedEmail !== currentUser.email) {
        updateData.emailVerified = null;
      }
    }

    if (validation.data.image !== undefined) {
      updateData.image = validation.data.image;
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}


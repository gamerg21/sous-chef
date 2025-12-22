import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAppAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "@/lib/auth-utils";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  isAppAdmin: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// GET /api/admin/users/[id] - Get a specific user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is app admin
    const hasPermission = await isAppAdmin();
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Forbidden: Only app administrators can view users" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const targetUserId = id;

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAppAdmin: true,
        createdAt: true,
        updatedAt: true,
        households: {
          select: {
            role: true,
            household: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      isAppAdmin: user.isAppAdmin,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      households: user.households.map((h) => ({
        householdId: h.household.id,
        householdName: h.household.name,
        role: h.role,
      })),
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}

// PATCH /api/admin/users/[id] - Update a user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is app admin
    const hasPermission = await isAppAdmin();
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Forbidden: Only app administrators can update users" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const targetUserId = id;
    const body = await request.json();
    const validated = updateUserSchema.parse(body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // If email is being changed, check for conflicts
    if (validated.email) {
      const normalizedEmail = normalizeEmail(validated.email);
      if (normalizedEmail !== existingUser.email) {
        const emailConflict = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });
        if (emailConflict) {
          return NextResponse.json(
            { error: "Email already in use" },
            { status: 400 }
          );
        }
      }
    }

    // Prepare update data
    const updateData: any = {};
    if (validated.name) updateData.name = validated.name;
    if (validated.email) updateData.email = normalizeEmail(validated.email);
    if (validated.isAppAdmin !== undefined)
      updateData.isAppAdmin = validated.isAppAdmin;
    if (validated.password) {
      updateData.password = await bcrypt.hash(validated.password, 10);
    }

    // Update user
    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAppAdmin: true,
        createdAt: true,
        updatedAt: true,
        households: {
          select: {
            role: true,
            household: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      isAppAdmin: user.isAppAdmin,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      households: user.households.map((h) => ({
        householdId: h.household.id,
        householdName: h.household.name,
        role: h.role,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users/[id] - Delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is app admin
    const hasPermission = await isAppAdmin();
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Forbidden: Only app administrators can delete users" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const targetUserId = id;

    // Prevent deleting yourself
    if (targetUserId === userId) {
      return NextResponse.json(
        { error: "Cannot delete yourself" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({
      where: { id: targetUserId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting user:", error);
    return NextResponse.json(
      { error: "Failed to delete user" },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { isHouseholdOwnerOrAdmin, isHouseholdOwner } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateUserSchema = z.object({
  role: z.enum(["owner", "admin", "member"]).optional(),
  name: z.string().min(1).optional(),
});

// PATCH /api/household/users/[id] - Update a user's role or name in the household
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    // Check if user is owner or admin
    const hasPermission = await isHouseholdOwnerOrAdmin(householdId);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Forbidden: Only owners and admins can update users" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const targetUserId = id;
    const body = await request.json();
    const validated = updateUserSchema.parse(body);

    // Find the membership
    const membership = await prisma.householdMember.findFirst({
      where: {
        userId: targetUserId,
        householdId,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "User is not a member of this household" },
        { status: 404 }
      );
    }

    // Only owners can change roles to/from owner
    if (validated.role && validated.role !== membership.role) {
      const isOwner = await isHouseholdOwner(householdId);
      if (
        validated.role === "owner" ||
        membership.role === "owner"
      ) {
        if (!isOwner) {
          return NextResponse.json(
            { error: "Forbidden: Only owners can change owner roles" },
            { status: 403 }
          );
        }
      }
    }

    // Update membership role if provided
    if (validated.role) {
      await prisma.householdMember.update({
        where: { id: membership.id },
        data: { role: validated.role },
      });
    }

    // Update user name if provided
    if (validated.name) {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { name: validated.name },
      });
    }

    // Fetch updated data
    const updatedMembership = await prisma.householdMember.findFirst({
      where: {
        userId: targetUserId,
        householdId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: updatedMembership!.user.id,
      name: updatedMembership!.user.name,
      email: updatedMembership!.user.email,
      image: updatedMembership!.user.image,
      role: updatedMembership!.role,
      joinedAt: updatedMembership!.createdAt.toISOString(),
      createdAt: updatedMembership!.user.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error updating household user:", error);
    return NextResponse.json(
      { error: "Failed to update user" },
      { status: 500 }
    );
  }
}

// DELETE /api/household/users/[id] - Remove a user from the household
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const householdId = await getCurrentHouseholdId(userId);
    if (!householdId) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    // Check if user is owner or admin
    const hasPermission = await isHouseholdOwnerOrAdmin(householdId);
    if (!hasPermission) {
      return NextResponse.json(
        { error: "Forbidden: Only owners and admins can remove users" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const targetUserId = id;

    // Prevent removing yourself
    if (targetUserId === userId) {
      return NextResponse.json(
        { error: "Cannot remove yourself from the household" },
        { status: 400 }
      );
    }

    // Find the membership
    const membership = await prisma.householdMember.findFirst({
      where: {
        userId: targetUserId,
        householdId,
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "User is not a member of this household" },
        { status: 404 }
      );
    }

    // Only owners can remove owners
    if (membership.role === "owner") {
      const isOwner = await isHouseholdOwner(householdId);
      if (!isOwner) {
        return NextResponse.json(
          { error: "Forbidden: Only owners can remove other owners" },
          { status: 403 }
        );
      }
    }

    // Ensure at least one owner remains
    if (membership.role === "owner") {
      const ownerCount = await prisma.householdMember.count({
        where: {
          householdId,
          role: "owner",
        },
      });

      if (ownerCount <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last owner from the household" },
          { status: 400 }
        );
      }
    }

    // Remove the membership
    await prisma.householdMember.delete({
      where: { id: membership.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing user from household:", error);
    return NextResponse.json(
      { error: "Failed to remove user from household" },
      { status: 500 }
    );
  }
}


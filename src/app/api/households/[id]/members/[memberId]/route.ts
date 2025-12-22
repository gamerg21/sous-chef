import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/households/[id]/members/[memberId]
 * Update member role
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: householdId, memberId } = await params;

  // Verify user has permission (owner or admin)
  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  // Only owners can change roles to/from owner
  if (membership.role !== "owner") {
    return NextResponse.json(
      { error: "Only owners can change member roles" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { role } = body;

    if (!role || !["owner", "admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Prevent removing the last owner
    if (role !== "owner") {
      const ownerCount = await prisma.householdMember.count({
        where: {
          householdId,
          role: "owner",
        },
      });

      const targetMember = await prisma.householdMember.findUnique({
        where: { id: memberId },
      });

      if (targetMember?.role === "owner" && ownerCount === 1) {
        return NextResponse.json(
          { error: "Cannot remove the last owner" },
          { status: 400 }
        );
      }
    }

    const updatedMember = await prisma.householdMember.update({
      where: { id: memberId },
      data: { role: role as "owner" | "admin" | "member" },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return NextResponse.json({
      member: {
        id: updatedMember.id,
        userId: updatedMember.user.id,
        name: updatedMember.user.name,
        email: updatedMember.user.email,
        avatarUrl: updatedMember.user.image,
        role: updatedMember.role,
        joinedAt: updatedMember.createdAt,
      },
    });
  } catch (error) {
    console.error("Error updating member:", error);
    return NextResponse.json(
      { error: "Failed to update member" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/households/[id]/members/[memberId]
 * Remove a member from household
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: householdId, memberId } = await params;

  // Verify user has permission (owner or admin)
  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }

  // Get target member
  const targetMember = await prisma.householdMember.findUnique({
    where: { id: memberId },
    include: {
      household: true,
    },
  });

  if (!targetMember || targetMember.householdId !== householdId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Users can remove themselves, or owners/admins can remove others
  const canRemove =
    targetMember.userId === userId ||
    membership.role === "owner" ||
    (membership.role === "admin" && targetMember.role !== "owner");

  if (!canRemove) {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  // Prevent removing the last owner
  if (targetMember.role === "owner") {
    const ownerCount = await prisma.householdMember.count({
      where: {
        householdId,
        role: "owner",
      },
    });

    if (ownerCount === 1) {
      return NextResponse.json(
        { error: "Cannot remove the last owner" },
        { status: 400 }
      );
    }
  }

  try {
    await prisma.householdMember.delete({
      where: { id: memberId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing member:", error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
}


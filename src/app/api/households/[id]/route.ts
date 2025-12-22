import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/households/[id]
 * Get household details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const householdId = id;

  // Verify user has access to this household
  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId,
    },
    include: {
      household: {
        include: {
          members: {
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
          },
          _count: {
            select: {
              inventoryItems: true,
              recipes: true,
            },
          },
        },
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }

  return NextResponse.json({
    household: {
      id: membership.household.id,
      name: membership.household.name,
      role: membership.role,
      createdAt: membership.household.createdAt,
      members: membership.household.members.map((m: {
        id: string;
        user: { id: string; name: string | null; email: string; image: string | null };
        role: string;
        createdAt: Date;
      }) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.image,
        role: m.role,
        joinedAt: m.createdAt,
      })),
      stats: {
        inventoryItems: membership.household._count.inventoryItems,
        recipes: membership.household._count.recipes,
      },
    },
  });
}

/**
 * PATCH /api/households/[id]
 * Update household name (only owners/admins can update)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const householdId = id;

  // Verify user has access and permission
  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId,
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }

  // Only owners and admins can update household
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Insufficient permissions" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Household name is required" },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "Household name must be 100 characters or less" },
        { status: 400 }
      );
    }

    const updatedHousehold = await prisma.household.update({
      where: { id: householdId },
      data: { name: name.trim() },
    });

    return NextResponse.json({
      household: {
        id: updatedHousehold.id,
        name: updatedHousehold.name,
      },
    });
  } catch (error) {
    console.error("Error updating household:", error);
    return NextResponse.json(
      { error: "Failed to update household" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/households/[id]
 * Delete household (only owners can delete)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const householdId = id;

  // Verify user is owner
  const membership = await prisma.householdMember.findFirst({
    where: {
      userId,
      householdId,
      role: "owner",
    },
  });

  if (!membership) {
    return NextResponse.json(
      { error: "Only household owners can delete households" },
      { status: 403 }
    );
  }

  try {
    await prisma.household.delete({
      where: { id: householdId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting household:", error);
    return NextResponse.json(
      { error: "Failed to delete household" },
      { status: 500 }
    );
  }
}


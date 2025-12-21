import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDefaultHousehold } from "@/lib/household";

/**
 * GET /api/households
 * Get all households for the current user
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const households = await prisma.householdMember.findMany({
    where: { userId: session.user.id },
    include: {
      household: {
        include: {
          _count: {
            select: {
              members: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return NextResponse.json({
    households: households.map((m) => ({
      id: m.household.id,
      name: m.household.name,
      role: m.role,
      memberCount: m.household._count.members,
      createdAt: m.household.createdAt,
    })),
  });
}

/**
 * POST /api/households
 * Create a new household
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const household = await createDefaultHousehold(
      session.user.id,
      null,
      null
    );

    // Update the household name
    const updatedHousehold = await prisma.household.update({
      where: { id: household.id },
      data: { name: name.trim() },
    });

    return NextResponse.json({
      household: {
        id: updatedHousehold.id,
        name: updatedHousehold.name,
        role: "owner",
        createdAt: updatedHousehold.createdAt,
      },
    });
  } catch (error) {
    console.error("Error creating household:", error);
    return NextResponse.json(
      { error: "Failed to create household" },
      { status: 500 }
    );
  }
}


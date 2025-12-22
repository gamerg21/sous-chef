import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/households/[id]/members
 * Get all members of a household
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
  });

  if (!membership) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }

  const members = await prisma.householdMember.findMany({
    where: { householdId },
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
    orderBy: {
      createdAt: "asc",
    },
  });

  return NextResponse.json({
    members: members.map((m: {
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
  });
}

/**
 * POST /api/households/[id]/members
 * Add a member to a household (invite by email)
 */
export async function POST(
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

  try {
    const body = await request.json();
    const { email, role = "member" } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Validate role
    if (!["owner", "admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if user is already a member
    const existingMember = await prisma.householdMember.findFirst({
      where: {
        userId: user.id,
        householdId,
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already a member" },
        { status: 400 }
      );
    }

    // Add member
    const newMember = await prisma.householdMember.create({
      data: {
        userId: user.id,
        householdId,
        role: role as "owner" | "admin" | "member",
      },
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
        id: newMember.id,
        userId: newMember.user.id,
        name: newMember.user.name,
        email: newMember.user.email,
        avatarUrl: newMember.user.image,
        role: newMember.role,
        joinedAt: newMember.createdAt,
      },
    });
  } catch (error) {
    console.error("Error adding member:", error);
    return NextResponse.json(
      { error: "Failed to add member" },
      { status: 500 }
    );
  }
}


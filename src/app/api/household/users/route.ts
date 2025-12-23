import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentHouseholdId } from "@/lib/user";
import { isHouseholdOwnerOrAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "@/lib/auth-utils";

const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["owner", "admin", "member"]).default("member"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
});

// updateUserSchema is defined but not currently used - kept for future use
// const updateUserSchema = z.object({
//   role: z.enum(["owner", "admin", "member"]).optional(),
//   name: z.string().min(1).optional(),
// });

// GET /api/household/users - List all users in the current household
export async function GET(_request: NextRequest) {
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
        { error: "Forbidden: Only owners and admins can view users" },
        { status: 403 }
      );
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
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const users = members.map((member: {
      user: { id: string; name: string | null; email: string; image: string | null; createdAt: Date };
      role: string;
      createdAt: Date;
    }) => ({
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
      createdAt: member.user.createdAt.toISOString(),
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error fetching household users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

// POST /api/household/users - Add a new user to the household
export async function POST(request: NextRequest) {
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
        { error: "Forbidden: Only owners and admins can add users" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = createUserSchema.parse(body);

    // Normalize email
    const normalizedEmail = normalizeEmail(validated.email);

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Create user if they don't exist
    if (!user) {
      if (!validated.password) {
        return NextResponse.json(
          { error: "Password is required for new users" },
          { status: 400 }
        );
      }

      const hashedPassword = await bcrypt.hash(validated.password, 10);
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: validated.name,
          password: hashedPassword,
        },
      });
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
        { error: "User is already a member of this household" },
        { status: 400 }
      );
    }

    // Add user to household
    const member = await prisma.householdMember.create({
      data: {
        userId: user.id,
        householdId,
        role: validated.role,
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

    return NextResponse.json(
      {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        image: member.user.image,
        role: member.role,
        joinedAt: member.createdAt.toISOString(),
        createdAt: member.user.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Error adding user to household:", error);
    return NextResponse.json(
      { error: "Failed to add user to household" },
      { status: 500 }
    );
  }
}



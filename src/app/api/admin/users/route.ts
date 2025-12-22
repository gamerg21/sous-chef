import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAppAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { normalizeEmail } from "@/lib/auth-utils";

const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  isAppAdmin: z.boolean().default(false),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  isAppAdmin: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

// GET /api/admin/users - List all users in the app
export async function GET(request: NextRequest) {
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
        { error: "Forbidden: Only app administrators can view all users" },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const search = searchParams.get("search") || "";

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
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
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    const formattedUsers = users.map((user: {
      id: string;
      name: string | null;
      email: string;
      image: string | null;
      isAppAdmin: boolean;
      createdAt: Date;
      updatedAt: Date;
      households: Array<{ role: string; household: { id: string; name: string } }>;
    }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      isAppAdmin: user.isAppAdmin,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      households: user.households.map((h: { role: string; household: { id: string; name: string } }) => ({
        householdId: h.household.id,
        householdName: h.household.name,
        role: h.role,
      })),
    }));

    return NextResponse.json({
      users: formattedUsers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    return NextResponse.json(
      { error: "Failed to fetch users" },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Create a new user
export async function POST(request: NextRequest) {
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
        { error: "Forbidden: Only app administrators can create users" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validated = createUserSchema.parse(body);

    // Normalize email
    const normalizedEmail = normalizeEmail(validated.email);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validated.password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: validated.name,
        password: hashedPassword,
        isAppAdmin: validated.isAppAdmin,
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        isAppAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        isAppAdmin: user.isAppAdmin,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        households: [],
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
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}


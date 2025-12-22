import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

/**
 * POST /api/household/switch
 * Switch the current active household for the user
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const householdId = body.householdId || request.nextUrl.searchParams.get("householdId");

    if (!householdId || typeof householdId !== "string") {
      return NextResponse.json({ error: "Household ID required" }, { status: 400 });
    }

    // Verify user has access to this household
    const membership = await prisma.householdMember.findFirst({
      where: {
        userId,
        householdId,
      },
      include: {
        household: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Store household preference in a cookie
    const cookieStore = await cookies();
    cookieStore.set("householdId", householdId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    });

    return NextResponse.json({
      success: true,
      household: {
        id: membership.household.id,
        name: membership.household.name,
      },
    });
  } catch (error) {
    console.error("Error switching household:", error);
    return NextResponse.json(
      { error: "Failed to switch household" },
      { status: 500 }
    );
  }
}


import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCurrentUser } from "@/lib/user";
import { uploadFile, STORAGE_BUCKETS } from "@/lib/storage";

/**
 * POST /api/upload/inventory
 * Upload an inventory item photo
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user and verify household access
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get household ID from query params or body
    const searchParams = request.nextUrl.searchParams;
    const householdId = searchParams.get("householdId");

    if (!householdId) {
      return NextResponse.json(
        { error: "Household ID is required" },
        { status: 400 }
      );
    }

    // Verify user has access to this household
    const hasAccess = user.households.some(
      (m: { household: { id: string } }) => m.household.id === householdId
    );

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Access denied to household" },
        { status: 403 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Upload file
    const result = await uploadFile(file, {
      bucket: STORAGE_BUCKETS.INVENTORY_PHOTOS,
      userId: user.id,
      householdId,
      folder: "items",
    });

    return NextResponse.json({
      success: true,
      file: {
        url: result.url,
        path: result.path,
        size: result.size,
        mimeType: result.mimeType,
      },
    });
  } catch (error) {
    console.error("Error uploading inventory photo:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to upload file",
      },
      { status: 500 }
    );
  }
}


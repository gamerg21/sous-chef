import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSignedUrl, STORAGE_BUCKETS } from "@/lib/storage";

/**
 * GET /api/upload/signed-url
 * Get a signed URL for a private file
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const bucket = searchParams.get("bucket");
    const path = searchParams.get("path");
    const expiresIn = parseInt(searchParams.get("expiresIn") || "3600", 10);

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "Bucket and path are required" },
        { status: 400 }
      );
    }

    // Validate bucket name
    const validBuckets = Object.values(STORAGE_BUCKETS) as readonly string[];
    if (!validBuckets.includes(bucket)) {
      return NextResponse.json(
        { error: "Invalid bucket name" },
        { status: 400 }
      );
    }

    // Verify the file path belongs to the current user
    // This prevents users from accessing other users' files
    if (!path.includes(`user-${userId}`)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Validate expiresIn (between 1 second and 1 week)
    if (expiresIn < 1 || expiresIn > 604800) {
      return NextResponse.json(
        { error: "expiresIn must be between 1 and 604800 seconds" },
        { status: 400 }
      );
    }

    const signedUrl = await getSignedUrl(bucket as typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS], path, expiresIn);

    return NextResponse.json({
      url: signedUrl,
      expiresIn,
    });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate signed URL",
      },
      { status: 500 }
    );
  }
}


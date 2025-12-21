import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteFile, STORAGE_BUCKETS } from "@/lib/storage";

/**
 * DELETE /api/upload/delete
 * Delete a file from storage
 */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { bucket, path } = body;

    if (!bucket || !path) {
      return NextResponse.json(
        { error: "Bucket and path are required" },
        { status: 400 }
      );
    }

    // Validate bucket name
    const validBuckets = Object.values(STORAGE_BUCKETS);
    if (!validBuckets.includes(bucket)) {
      return NextResponse.json(
        { error: "Invalid bucket name" },
        { status: 400 }
      );
    }

    // Verify the file path belongs to the current user
    // This prevents users from deleting other users' files
    if (!path.includes(`user-${session.user.id}`)) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    await deleteFile(bucket, path);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete file",
      },
      { status: 500 }
    );
  }
}


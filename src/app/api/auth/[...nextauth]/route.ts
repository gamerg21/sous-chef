import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const handler = NextAuth(authOptions);

// Wrap handler with error handling to return JSON errors instead of HTML
async function wrappedHandler(
  req: NextRequest,
  context: { params: { nextauth: string[] } }
) {
  try {
    return await handler(req, context);
  } catch (error) {
    console.error("[NextAuth] Route handler error:", error);
    // Return JSON error response instead of letting Next.js return HTML error page
    return NextResponse.json(
      { 
        error: "Authentication error",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

export { wrappedHandler as GET, wrappedHandler as POST };


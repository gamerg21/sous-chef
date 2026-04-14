// Convex handles auth on the server side - no middleware needed for route protection.
// Client-side auth checks are handled by useConvexAuth() in DashboardLayout.
export default function middleware() {
  // no-op
}

export const config = {
  matcher: [],
};

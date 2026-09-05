import { redirect } from "next/navigation";

/**
 * The app has no marketing landing page — send visitors straight to the
 * dashboard. Unauthenticated users are bounced to /auth/signin by the
 * dashboard layout's auth gate.
 */
export default function Home() {
  redirect("/inventory");
}

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAppAdmin } from "@/lib/admin";
import AdminUsersClient from "./client";

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  
  if (!userId) {
    redirect("/auth/signin");
  }

  const hasPermission = await isAppAdmin();
  if (!hasPermission) {
    redirect("/inventory");
  }

  return <AdminUsersClient />;
}

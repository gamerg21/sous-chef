import { redirect } from "next/navigation";

/**
 * Household user management is currently the only settings surface; land
 * there instead of a placeholder index.
 */
export default function SettingsPage() {
  redirect("/settings/household-users");
}

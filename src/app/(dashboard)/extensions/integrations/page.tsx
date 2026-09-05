import { redirect } from "next/navigation";

/** AI provider settings moved under Settings; keep old bookmarks working. */
export default function LegacyIntegrationsPage() {
  redirect("/settings/ai");
}

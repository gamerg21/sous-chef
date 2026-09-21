import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Home() {
  redirect(process.env.SOUS_CHEF_DEMO === "true" ? "/demo" : "/inventory");
}

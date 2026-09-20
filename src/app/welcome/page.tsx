import type { Metadata } from "next";
import { LandingPage } from "@/components/marketing/LandingPage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sous Chef — A little help for your home kitchen",
  description:
    "Bring your pantry, recipes, cooking, and shopping list together. Sous Chef is a free, open-source kitchen assistant you can host at home.",
};

export default function WelcomePage() {
  return <LandingPage demoEnabled={process.env.SOUS_CHEF_DEMO === "true"} />;
}

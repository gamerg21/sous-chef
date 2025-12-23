import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/user";
import { getOrCreateUserPreferences } from "@/lib/preferences";
import AccountPageClient from "./AccountPageClient";

export default async function AccountPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/signin");
  }

  const preferences = await getOrCreateUserPreferences(user.id);

  return (
    <AccountPageClient
      initialUser={{
        id: user.id,
        name: user.name || "",
        email: user.email,
        image: user.image || null,
        emailVerified: user.emailVerified,
      }}
      initialPreferences={{
        measurementSystem: preferences.measurementSystem as "metric" | "imperial",
        defaultWeightUnit: preferences.defaultWeightUnit as "g" | "kg" | "oz" | "lb",
        defaultVolumeUnit: preferences.defaultVolumeUnit as "ml" | "l" | "cup" | "tbsp" | "tsp",
        timezone: preferences.timezone,
        dateFormat: preferences.dateFormat,
      }}
    />
  );
}



"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Settings, Save, Loader2 } from "lucide-react";

interface UserData {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: Date | null;
}

interface PreferencesData {
  measurementSystem: "metric" | "imperial";
  defaultWeightUnit: "g" | "kg" | "oz" | "lb";
  defaultVolumeUnit: "ml" | "l" | "cup" | "tbsp" | "tsp";
  timezone: string | null;
  dateFormat: string | null;
}

interface AccountPageClientProps {
  initialUser: UserData;
  initialPreferences: PreferencesData;
}

export default function AccountPageClient({
  initialUser,
  initialPreferences,
}: AccountPageClientProps) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [preferencesSuccess, setPreferencesSuccess] = useState(false);

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(false);

    try {
      const formData = new FormData(e.currentTarget);
      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.get("name"),
          email: formData.get("email"),
          image: formData.get("image") || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update profile");
      }

      const data = await response.json();
      setUser(data.user);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      router.refresh();
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Failed to update profile"
      );
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePreferencesSubmit = async (
    e: React.FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();
    setIsSavingPreferences(true);
    setPreferencesError(null);
    setPreferencesSuccess(false);

    try {
      const formData = new FormData(e.currentTarget);
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          measurementSystem: formData.get("measurementSystem"),
          defaultWeightUnit: formData.get("defaultWeightUnit"),
          defaultVolumeUnit: formData.get("defaultVolumeUnit"),
          timezone: formData.get("timezone") || null,
          dateFormat: formData.get("dateFormat") || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update preferences");
      }

      const data = await response.json();
      setPreferences(data.preferences);
      setPreferencesSuccess(true);
      setTimeout(() => setPreferencesSuccess(false), 3000);
    } catch (error) {
      setPreferencesError(
        error instanceof Error
          ? error.message
          : "Failed to update preferences"
      );
    } finally {
      setIsSavingPreferences(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <div className="px-4 py-5 sm:px-6 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl sm:text-3xl font-semibold text-stone-900 dark:text-stone-100">
                Account & Preferences
              </h1>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                Manage your profile information and application preferences.
              </p>
            </div>
          </div>

          {/* Profile Section */}
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-stone-500 dark:text-stone-400" />
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                Profile Information
              </h2>
            </div>

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                >
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  defaultValue={user.name}
                  required
                  className="w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  defaultValue={user.email}
                  required
                  className="w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                {!user.emailVerified && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Email not verified. Check your inbox for a verification link.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="image"
                  className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                >
                  Avatar URL (optional)
                </label>
                <input
                  type="url"
                  id="image"
                  name="image"
                  defaultValue={user.image || ""}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {profileError && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {profileError}
                  </p>
                </div>
              )}

              {profileSuccess && (
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    Profile updated successfully!
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingProfile}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingProfile ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Profile
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Preferences Section */}
          <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-stone-500 dark:text-stone-400" />
              <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
                Preferences
              </h2>
            </div>

            <form onSubmit={handlePreferencesSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="measurementSystem"
                  className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                >
                  Measurement System
                </label>
                <select
                  id="measurementSystem"
                  name="measurementSystem"
                  defaultValue={preferences.measurementSystem}
                  className="w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="metric">Metric</option>
                  <option value="imperial">Imperial</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="defaultWeightUnit"
                    className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                  >
                    Default Weight Unit
                  </label>
                  <select
                    id="defaultWeightUnit"
                    name="defaultWeightUnit"
                    defaultValue={preferences.defaultWeightUnit}
                    className="w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="g">Grams (g)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="oz">Ounces (oz)</option>
                    <option value="lb">Pounds (lb)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="defaultVolumeUnit"
                    className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                  >
                    Default Volume Unit
                  </label>
                  <select
                    id="defaultVolumeUnit"
                    name="defaultVolumeUnit"
                    defaultValue={preferences.defaultVolumeUnit}
                    className="w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="ml">Milliliters (ml)</option>
                    <option value="l">Liters (l)</option>
                    <option value="cup">Cups</option>
                    <option value="tbsp">Tablespoons (tbsp)</option>
                    <option value="tsp">Teaspoons (tsp)</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="timezone"
                  className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                >
                  Timezone (optional)
                </label>
                <input
                  type="text"
                  id="timezone"
                  name="timezone"
                  defaultValue={preferences.timezone || ""}
                  placeholder="America/New_York"
                  className="w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                  IANA timezone identifier (e.g., America/New_York, Europe/London)
                </p>
              </div>

              <div>
                <label
                  htmlFor="dateFormat"
                  className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1"
                >
                  Date Format (optional)
                </label>
                <select
                  id="dateFormat"
                  name="dateFormat"
                  defaultValue={preferences.dateFormat || "YYYY-MM-DD"}
                  className="w-full rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 px-3 py-2 text-sm text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD (default)</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="MM-DD-YYYY">MM-DD-YYYY</option>
                </select>
              </div>

              {preferencesError && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3">
                  <p className="text-sm text-red-800 dark:text-red-200">
                    {preferencesError}
                  </p>
                </div>
              )}

              {preferencesSuccess && (
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                  <p className="text-sm text-emerald-800 dark:text-emerald-200">
                    Preferences updated successfully!
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={isSavingPreferences}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSavingPreferences ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Preferences
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

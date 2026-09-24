"use client";

import { useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import { useRouter } from "next/navigation";
import {
  AtSign,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Droplet,
  Image as ImageIcon,
  Loader2,
  Ruler,
  Save,
  Scale,
} from "lucide-react";
import { Collapse } from "@/components/ui/collapse";
import { PageLoader } from "@/components/ui/page-loader";
import {
  IconBadge,
  PageHeader,
  Section,
  SegmentedControl,
  bareInputClassName,
  buttonClassName,
  cardClassName,
  cx,
  eyebrowClassName,
  headingFont,
  heroCardClassName,
  heroInputClassName,
  optionClassName,
  rowsClassName,
} from "@/components/ui/kit";

type Preferences = {
  measurementSystem: string;
  defaultWeightUnit: string;
  defaultVolumeUnit: string;
  timezone: string;
  dateFormat: string;
};

const WEIGHT_UNITS = [
  { value: "g", label: "g", name: "Grams (g)" },
  { value: "kg", label: "kg", name: "Kilograms (kg)" },
  { value: "oz", label: "oz", name: "Ounces (oz)" },
  { value: "lb", label: "lb", name: "Pounds (lb)" },
];

const VOLUME_UNITS = [
  { value: "ml", label: "Milliliters (ml)" },
  { value: "l", label: "Liters (l)" },
  { value: "cup", label: "Cups" },
  { value: "tbsp", label: "Tablespoons (tbsp)" },
  { value: "tsp", label: "Teaspoons (tsp)" },
];

const DATE_FORMATS = [
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "MM-DD-YYYY", label: "MM-DD-YYYY" },
];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function FormNotice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "animate-fade-in rounded-xl px-3 py-2 text-sm",
        tone === "error"
          ? "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
          : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      )}
    >
      {children}
    </p>
  );
}

/** Settings row: badge, label and description on the left, control on the right (stacked on phones). */
function SettingRow({
  icon,
  label,
  labelId,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: ReactNode;
  labelId?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <IconBadge icon={icon} tone="neutral" />
        <div className="min-w-0">
          <p id={labelId} className="text-sm font-medium text-stone-900 dark:text-stone-100">
            {label}
          </p>
          {description && <p className="text-xs text-stone-500 dark:text-stone-400">{description}</p>}
        </div>
      </div>
      <div className="sm:shrink-0">{children}</div>
    </div>
  );
}

function SaveButton({ saving, label }: { saving: boolean; label: string }) {
  return (
    <button type="submit" disabled={saving} className={buttonClassName("primary")}>
      {saving ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Saving...
        </>
      ) : (
        <>
          <Save className="h-4 w-4" />
          {label}
        </>
      )}
    </button>
  );
}

export default function AccountPageClient() {
  const router = useRouter();

  const profileData = useQuery(api.users.getProfile, {});
  const preferencesData = useQuery(api.preferences.get, {});
  const updateProfile = useMutation(api.users.updateProfile);
  const updatePreferences = useMutation(api.preferences.update);

  const [profileError, setProfileError] = useState<string | null>(null);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [preferencesSuccess, setPreferencesSuccess] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);

  if (!profileData || !preferencesData) {
    return <PageLoader rows={4} />;
  }

  const profile = profileData.user;
  const preferences: Preferences = {
    measurementSystem: preferencesData.preferences?.measurementSystem || "metric",
    defaultWeightUnit: preferencesData.preferences?.defaultWeightUnit || "g",
    defaultVolumeUnit: preferencesData.preferences?.defaultVolumeUnit || "ml",
    timezone: preferencesData.preferences?.timezone || "",
    dateFormat: preferencesData.preferences?.dateFormat || "YYYY-MM-DD",
  };

  const profileFormKey = `${profile.id}:${profile.name ?? ""}:${profile.email}:${profile.image ?? ""}:${profile.emailVerified ?? ""}`;
  const preferencesFormKey = `${preferences.measurementSystem}:${preferences.defaultWeightUnit}:${preferences.defaultVolumeUnit}:${preferences.timezone}:${preferences.dateFormat}`;

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);
    setProfileSaving(true);

    const formData = new FormData(e.currentTarget);
    try {
      await updateProfile({
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        image: String(formData.get("image") || "") || undefined,
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      router.refresh();
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : "Failed to update profile"
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePreferencesSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPreferencesError(null);
    setPreferencesSuccess(false);
    setPreferencesSaving(true);

    const formData = new FormData(e.currentTarget);
    try {
      await updatePreferences({
        measurementSystem: String(formData.get("measurementSystem") || "metric"),
        defaultWeightUnit: String(formData.get("defaultWeightUnit") || "g"),
        defaultVolumeUnit: String(formData.get("defaultVolumeUnit") || "ml"),
        timezone: String(formData.get("timezone") || "") || null,
        dateFormat: String(formData.get("dateFormat") || "") || null,
      });
      setPreferencesSuccess(true);
      setTimeout(() => setPreferencesSuccess(false), 3000);
    } catch (error) {
      setPreferencesError(
        error instanceof Error ? error.message : "Failed to update preferences"
      );
    } finally {
      setPreferencesSaving(false);
    }
  };

  const displayName = profile.name || profile.email;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Account & Preferences"
        description="Manage your profile information and application preferences."
      />

      <Section title="Profile Information">
        <form key={profileFormKey} onSubmit={handleProfileSubmit} className="space-y-3">
          <div className={heroCardClassName}>
            <div className="flex items-center gap-4 p-4">
              <span
                aria-hidden="true"
                className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-100 text-lg font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                style={headingFont}
              >
                {profile.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied avatar URL
                  <img src={profile.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials(displayName) || "?"
                )}
              </span>
              <div className="min-w-0 flex-1">
                <label htmlFor="name" className={eyebrowClassName}>
                  Name
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  defaultValue={profile.name || ""}
                  required
                  placeholder="Your name"
                  className={cx(heroInputClassName, "mt-0.5")}
                  style={headingFont}
                />
              </div>
            </div>

            <div className={cx(rowsClassName, "border-t border-stone-200 dark:border-stone-800")}>
              <div className="flex items-start gap-3 p-4">
                <IconBadge icon={AtSign} tone="neutral" size="sm" />
                <div className="min-w-0 flex-1">
                  <label htmlFor="email" className={eyebrowClassName}>
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    defaultValue={profile.email}
                    required
                    className={cx(bareInputClassName, "mt-1")}
                  />
                  {!profile.emailVerified && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Email not verified. Check your inbox for a verification link.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 p-4">
                <IconBadge icon={ImageIcon} tone="neutral" size="sm" />
                <div className="min-w-0 flex-1">
                  <label htmlFor="image" className={eyebrowClassName}>
                    Avatar URL (optional)
                  </label>
                  <input
                    type="url"
                    id="image"
                    name="image"
                    defaultValue={profile.image || ""}
                    placeholder="https://example.com/avatar.jpg"
                    className={cx(bareInputClassName, "mt-1")}
                  />
                </div>
              </div>
            </div>
          </div>

          {profileError && <FormNotice tone="error">{profileError}</FormNotice>}
          {profileSuccess && <FormNotice tone="success">Profile updated successfully!</FormNotice>}

          <div className="flex justify-end">
            <SaveButton saving={profileSaving} label="Save Profile" />
          </div>
        </form>
      </Section>

      <Section title="Preferences">
        <PreferencesForm
          key={preferencesFormKey}
          preferences={preferences}
          onSubmit={handlePreferencesSubmit}
          saving={preferencesSaving}
          error={preferencesError}
          success={preferencesSuccess}
        />
      </Section>
    </div>
  );
}

/**
 * Choices are controlled locally and mirrored into hidden inputs, so the parent
 * still reads every value from FormData on submit.
 */
function PreferencesForm({
  preferences,
  onSubmit,
  saving,
  error,
  success,
}: {
  preferences: Preferences;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
  error: string | null;
  success: boolean;
}) {
  const [measurementSystem, setMeasurementSystem] = useState(preferences.measurementSystem);
  const [weightUnit, setWeightUnit] = useState(preferences.defaultWeightUnit);
  const [volumeUnit, setVolumeUnit] = useState(preferences.defaultVolumeUnit);
  const [dateFormat, setDateFormat] = useState(preferences.dateFormat);
  const [volumeOpen, setVolumeOpen] = useState(false);

  const volumeLabel = VOLUME_UNITS.find((unit) => unit.value === volumeUnit)?.label ?? volumeUnit;
  const weightName = WEIGHT_UNITS.find((unit) => unit.value === weightUnit)?.name;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="measurementSystem" value={measurementSystem} />
      <input type="hidden" name="defaultWeightUnit" value={weightUnit} />
      <input type="hidden" name="defaultVolumeUnit" value={volumeUnit} />
      <input type="hidden" name="dateFormat" value={dateFormat} />

      <div className={cx(cardClassName, rowsClassName)}>
        <SettingRow icon={Ruler} label="Measurement System" description="Used when scaling and converting recipes">
          <SegmentedControl
            label="Measurement System"
            value={measurementSystem}
            onChange={setMeasurementSystem}
            options={[
              { value: "metric", label: "Metric" },
              { value: "imperial", label: "Imperial" },
            ]}
          />
        </SettingRow>

        <SettingRow icon={Scale} label="Default Weight Unit" description={weightName}>
          <SegmentedControl
            label="Default Weight Unit"
            value={weightUnit}
            onChange={setWeightUnit}
            options={WEIGHT_UNITS.map(({ value, label }) => ({ value, label }))}
          />
        </SettingRow>

        <div>
          <button
            type="button"
            aria-expanded={volumeOpen}
            aria-controls="volume-unit-options"
            onClick={() => setVolumeOpen((open) => !open)}
            className="flex min-h-16 w-full items-center gap-3 p-4 text-left hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-stone-900/40"
          >
            <IconBadge icon={Droplet} tone="neutral" />
            <span id="volume-unit-label" className="min-w-0 flex-1 text-sm font-medium text-stone-900 dark:text-stone-100">
              Default Volume Unit
            </span>
            <span className="truncate text-sm text-stone-600 dark:text-stone-300">{volumeLabel}</span>
            <ChevronDown
              className={cx("h-4 w-4 shrink-0 text-stone-400 transition-transform duration-300", volumeOpen && "rotate-180")}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          <Collapse open={volumeOpen}>
            <div
              id="volume-unit-options"
              role="radiogroup"
              aria-labelledby="volume-unit-label"
              className="grid gap-1 border-t border-stone-200 p-2 sm:grid-cols-2 dark:border-stone-800"
            >
              {VOLUME_UNITS.map((unit) => {
                const selected = unit.value === volumeUnit;
                return (
                  <button
                    key={unit.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setVolumeUnit(unit.value);
                      setVolumeOpen(false);
                    }}
                    className={optionClassName(selected)}
                  >
                    <span className="flex-1">{unit.label}</span>
                    {selected && <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </Collapse>
        </div>

        <div className="flex items-start gap-3 p-4">
          <IconBadge icon={Clock} tone="neutral" />
          <div className="min-w-0 flex-1">
            <label htmlFor="timezone" className="text-sm font-medium text-stone-900 dark:text-stone-100">
              Timezone (optional)
            </label>
            <input
              type="text"
              id="timezone"
              name="timezone"
              defaultValue={preferences.timezone}
              placeholder="America/New_York"
              aria-describedby="timezone-help"
              className={cx(bareInputClassName, "mt-1")}
            />
            <p id="timezone-help" className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              IANA timezone identifier (e.g., America/New_York, Europe/London)
            </p>
          </div>
        </div>

        <SettingRow icon={CalendarDays} label="Date Format (optional)" description={dateFormat === "YYYY-MM-DD" ? "YYYY-MM-DD (default)" : undefined}>
          <SegmentedControl
            label="Date Format"
            value={dateFormat}
            onChange={setDateFormat}
            options={DATE_FORMATS}
            className="max-w-full overflow-x-auto"
          />
        </SettingRow>
      </div>

      {error && <FormNotice tone="error">{error}</FormNotice>}
      {success && <FormNotice tone="success">Preferences updated successfully!</FormNotice>}

      <div className="flex justify-end">
        <SaveButton saving={saving} label="Save Preferences" />
      </div>
    </form>
  );
}

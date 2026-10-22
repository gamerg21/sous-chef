"use client";

import { Minus, Plus } from "lucide-react";
import { unitLabel } from "@/lib/units";
import { packageChoices, productBadges, tidy, type ProductFacts } from "@/lib/food-product";

interface ProductPackageCardProps {
  facts: ProductFacts;
  quantity: number;
  unit: string;
  /** New items can pick how to count the package; edits only show it. */
  editable: boolean;
  onChange: (quantity: number, unit: string) => void;
}

const amount = (quantity: number, unit: string) => `${tidy(quantity)} ${unitLabel(unit, quantity)}`;

/** "12 cans · 12 fl oz each" or the size as printed. */
export function packageSummary(facts: ProductFacts): string | undefined {
  const pack = facts.packaging;
  if (!pack) return undefined;
  if (pack.count && pack.count > 1 && pack.container) {
    const each = pack.eachAmount && pack.eachUnit ? ` · ${amount(pack.eachAmount, pack.eachUnit)} each` : "";
    return `${amount(pack.count, pack.container)}${each}`;
  }
  return pack.text ?? (pack.amount && pack.unit ? amount(pack.amount, pack.unit) : undefined);
}

/** "About 13 servings of 39 g". */
export function servingSummary(facts: ProductFacts): string | undefined {
  const serving = facts.serving;
  if (!serving) return undefined;
  const size = serving.amount && serving.unit ? `${tidy(serving.amount)} ${serving.unit}` : serving.text;
  if (serving.perPackage && serving.perPackage >= 2 && size) return `About ${tidy(serving.perPackage)} servings of ${size}`;
  return size ? `Serving: ${serving.text ?? size}` : undefined;
}

/**
 * What the package says, with one tap to count it as cans, by weight or as
 * one box, and a stepper for how many packages are going in.
 */
export function ProductPackageCard({ facts, quantity, unit, editable, onChange }: ProductPackageCardProps) {
  const choices = packageChoices(facts.packaging);
  const selected = choices.find((choice) => choice.unit === unit);
  const packages = selected ? quantity / selected.quantity : undefined;
  const wholePackages = packages && Number.isInteger(Math.round(packages * 1000) / 1000) ? Math.round(packages) : undefined;
  const image = facts.imageFrontSmallUrl ?? facts.imageFrontUrl;
  const summary = packageSummary(facts);
  const servings = servingSummary(facts);
  const badges = productBadges(facts);
  if (!summary && !servings && !badges.length) return null;

  return (
    <section aria-label="From the package" className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
      <div className="flex items-start gap-3">
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- remote product photo, shown at thumbnail size
          <img src={image} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-white object-contain p-1 ring-1 ring-stone-200 dark:ring-stone-800" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">From the package</p>
          {summary && <p className="mt-0.5 text-base font-medium text-stone-900 dark:text-stone-100">{summary}</p>}
          {servings && <p className="text-sm text-stone-500 dark:text-stone-400">{servings}</p>}
        </div>
      </div>

      {editable && choices.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Count it as" className="flex flex-wrap gap-1.5">
            {choices.map((choice) => {
              const checked = choice === selected;
              return (
                <button
                  key={choice.unit}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => onChange(choice.quantity * (wholePackages ?? 1), choice.unit)}
                  className={`min-h-9 rounded-full border px-3 text-sm ${
                    checked
                      ? "border-emerald-600 bg-emerald-600 font-medium text-white"
                      : "border-stone-200 text-stone-700 hover:border-emerald-300 hover:bg-emerald-50 dark:border-stone-700 dark:text-stone-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40"
                  }`}
                >
                  {amount(choice.quantity, choice.unit)}
                </button>
              );
            })}
          </div>
          {selected && wholePackages !== undefined && (
            <div className="flex items-center gap-1" role="group" aria-label="Packages">
              <button
                type="button"
                aria-label="One fewer package"
                disabled={wholePackages <= 1}
                onClick={() => onChange(selected.quantity * (wholePackages - 1), selected.unit)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Minus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
              <span className="min-w-20 text-center text-sm tabular-nums text-stone-700 dark:text-stone-300" aria-live="polite">
                {wholePackages} {wholePackages === 1 ? "package" : "packages"}
              </span>
              <button
                type="button"
                aria-label="One more package"
                onClick={() => onChange(selected.quantity * (wholePackages + 1), selected.unit)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}

      {badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span key={badge} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              {badge}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

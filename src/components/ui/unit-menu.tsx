"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { useMutation, useQuery } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { cx } from "../cooking/utils";

type UnitOption = {
  id: Id<"units">;
  slug: string;
  name: string;
  abbr?: string;
  unitType: string;
  label: string;
};

export interface UnitMenuProps {
  value: string;
  onChange: (unit: string) => void;
  /** Called after a unit is picked so the host can close the menu. */
  onDone?: () => void;
  ingredientName?: string;
  /** Skip loading the catalog while the menu is hidden. */
  active: boolean;
}

/**
 * Inline, searchable unit list: suggestions for the ingredient first, then the
 * whole catalog by group. Typing searches names and aliases; anything unmatched
 * can still be used as free text.
 */
export function UnitMenu({ value, onChange, onDone, ingredientName, active }: UnitMenuProps) {
  const [query, setQuery] = useState("");
  const term = query.trim();
  const suggestions = useQuery(api.units.suggest, active && !term ? { ingredientName } : "skip") as UnitOption[] | undefined;
  const grouped = useQuery(api.units.listGrouped, active && !term ? {} : "skip");
  const results = useQuery(api.units.search, active && term ? { query: term } : "skip") as UnitOption[] | undefined;
  const trackUsage = useMutation(api.units.trackUsage);

  const pick = (unit: string, id?: Id<"units">) => {
    onChange(unit);
    setQuery("");
    onDone?.();
    // Habit tracking improves suggestions; never block the UI on it.
    if (id) trackUsage({ unitId: id, ingredientName }).catch(() => {});
  };

  const chip = (selected: boolean) =>
    cx(
      "min-h-9 rounded-full border px-3 text-sm",
      selected
        ? "border-emerald-600 bg-emerald-600 font-medium text-white"
        : "border-stone-200 text-stone-700 hover:border-emerald-300 hover:bg-emerald-50 dark:border-stone-700 dark:text-stone-300 dark:hover:border-emerald-800 dark:hover:bg-emerald-950/40",
    );

  return (
    <div>
      <div className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter takes the top match (or the typed text) instead of submitting the form.
              if (event.key !== "Enter" || !term) return;
              event.preventDefault();
              const top = results?.[0];
              if (top) pick(top.label, top.id);
              else pick(term);
            }}
            placeholder="Search units"
            aria-label="Search units"
            className="h-10 w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto overscroll-contain border-t border-stone-200 dark:border-stone-800">
        {term ? (
          <div role="listbox" aria-label="Matching units" className="px-2 py-1">
            {results === undefined ? (
              <p className="px-3 py-3 text-sm text-stone-500">Searching…</p>
            ) : (
              <>
                {results.map((unit) => {
                  const selected = unit.label === value;
                  return (
                    <button
                      key={unit.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(unit.label, unit.id)}
                      className={cx(
                        "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm",
                        selected
                          ? "bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                          : "text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60",
                      )}
                    >
                      <span className="truncate">
                        {unit.label}
                        {unit.abbr && unit.name !== unit.label && (
                          <span className="ml-2 text-xs text-stone-400">{unit.name}</span>
                        )}
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden="true" />}
                    </button>
                  );
                })}
                {!results.some((unit) => unit.label.toLowerCase() === term.toLowerCase()) && (
                  <button
                    type="button"
                    onClick={() => pick(term)}
                    className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                  >
                    Use “{term}”
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 p-3">
            {!!suggestions?.length && (
              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
                  Suggested
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((unit) => (
                    <button key={unit.id} type="button" aria-pressed={unit.label === value} onClick={() => pick(unit.label, unit.id)} className={chip(unit.label === value)}>
                      {unit.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {grouped === undefined ? (
              <div className="space-y-2" aria-hidden="true">
                <div className="skeleton h-4 w-24" />
                <div className="skeleton h-9 w-full" />
              </div>
            ) : (
              grouped.map((group) => (
                <section key={group.name}>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">
                    {group.name}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {group.units.map((unit) => (
                      <button
                        key={unit.id}
                        type="button"
                        aria-pressed={unit.label === value}
                        title={unit.name}
                        onClick={() => pick(unit.label, unit.id as Id<"units">)}
                        className={chip(unit.label === value)}
                      >
                        {unit.label}
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

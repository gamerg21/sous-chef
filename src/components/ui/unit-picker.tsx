"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { Modal } from "./modal";
import { cx } from "../cooking/utils";

export interface UnitPickerProps {
  id?: string;
  value?: string;
  onChange: (unit: string) => void;
  ingredientName?: string;
  placeholder?: string;
  className?: string;
  /** Called with the selected unit's type ("qualitative", "volume", …) so
   * callers can relax numeric-amount validation where appropriate. */
  onUnitTypeChange?: (unitType: string | null) => void;
}

type UnitOption = {
  id: Id<"units">;
  slug: string;
  name: string;
  abbr?: string;
  unitType: string;
  system: string;
  label: string;
};

/**
 * Fallback shown only when the units catalog has not been seeded yet
 * (npx convex run units:seed). Kept minimal on purpose — the canonical
 * catalog lives in the units/unitAliases tables per the unit-picker spec.
 */
const UNSEEDED_FALLBACK = [
  "each",
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "cup",
  "tbsp",
  "tsp",
];

export function UnitPicker({
  id,
  value = "",
  onChange,
  ingredientName,
  placeholder = "Unit",
  className,
  onUnitTypeChange,
}: UnitPickerProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoringFocus = useRef(false);

  const [isOpen, setIsOpen] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSearch, setMoreSearch] = useState("");

  const trimmedQuery = queryText.trim();
  const suggestions = useQuery(
    api.units.suggest,
    isOpen && !trimmedQuery ? { ingredientName } : "skip",
  );
  const searchResults = useQuery(
    api.units.search,
    isOpen && trimmedQuery ? { query: trimmedQuery } : "skip",
  );
  const grouped = useQuery(api.units.listGrouped, moreOpen ? {} : "skip");
  const trackUsage = useMutation(api.units.trackUsage);

  const options: UnitOption[] = useMemo(() => {
    const fromServer = trimmedQuery ? searchResults : suggestions;
    return (fromServer ?? []) as UnitOption[];
  }, [trimmedQuery, searchResults, suggestions]);

  const catalogEmpty =
    !trimmedQuery && suggestions !== undefined && suggestions.length === 0;

  // Close when clicking outside the combobox.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQueryText("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  const selectUnit = useCallback(
    (option: UnitOption) => {
      onChange(option.label);
      onUnitTypeChange?.(option.unitType);
      setIsOpen(false);
      setMoreOpen(false);
      setQueryText("");
      restoringFocus.current = true;
      inputRef.current?.focus();
      restoringFocus.current = false;
      // Fire-and-forget habit tracking; never block the UI on it.
      trackUsage({ unitId: option.id, ingredientName }).catch(() => {});
    },
    [onChange, onUnitTypeChange, trackUsage, ingredientName],
  );

  const selectFreeText = useCallback(
    (text: string) => {
      onChange(text);
      onUnitTypeChange?.(null);
      setIsOpen(false);
      setQueryText("");
    },
    [onChange, onUnitTypeChange],
  );

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      setIsOpen(true);
      return;
    }
    if (!isOpen) return;
    // The virtual list is: options, then "use free text" (if typed), then More units…
    const extraFreeText = trimmedQuery && options.length === 0 ? 1 : 0;
    const total = options.length + extraFreeText + 1;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlighted((h) => (h + 1) % total);
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlighted((h) => (h - 1 + total) % total);
        break;
      case "Enter":
        event.preventDefault();
        if (highlighted < options.length) {
          selectUnit(options[highlighted]);
        } else if (extraFreeText && highlighted === options.length) {
          selectFreeText(trimmedQuery);
        } else {
          setMoreOpen(true);
          setIsOpen(false);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        setQueryText("");
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  const displayValue = isOpen ? queryText : value;

  const optionClasses = (active: boolean) =>
    cx(
      "px-3 py-2 text-sm cursor-pointer flex items-baseline justify-between gap-2",
      active
        ? "bg-orange-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100"
        : "text-stone-700 dark:text-stone-300",
    );

  return (
    <div ref={containerRef} className={cx("relative", className)}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            isOpen ? `${listboxId}-opt-${highlighted}` : undefined
          }
          aria-label={
            ingredientName ? `Unit for ${ingredientName}` : "Pick unit"
          }
          aria-autocomplete="list"
          value={displayValue}
          placeholder={placeholder}
          onFocus={() => {
            if (restoringFocus.current) return;
            setHighlighted(0);
            setIsOpen(true);
          }}
          onChange={(event) => {
            setQueryText(event.target.value);
            setHighlighted(0);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="w-full h-10 pl-3 pr-8 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={isOpen ? "Close unit list" : "Open unit list"}
          onClick={() => {
            setIsOpen((open) => !open);
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-stone-400"
        >
          <ChevronDown className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      {isOpen && (
        <ul
          id={listboxId}
          role="listbox"
          onPointerDown={event => event.preventDefault()}
          className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shadow-lg py-1"
        >
          {catalogEmpty && !trimmedQuery
            ? UNSEEDED_FALLBACK.map((label, index) => (
                <li
                  key={label}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  aria-selected={highlighted === index}
                  className={optionClasses(highlighted === index)}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => selectFreeText(label)}
                >
                  <span>{label}</span>
                </li>
              ))
            : options.map((option, index) => (
                <li
                  key={option.id}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  aria-selected={highlighted === index}
                  className={optionClasses(highlighted === index)}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => selectUnit(option)}
                >
                  <span>{option.label}</span>
                  {option.abbr && option.abbr !== option.name && (
                    <span className="text-xs text-stone-400">
                      {option.name}
                    </span>
                  )}
                </li>
              ))}

          {trimmedQuery && options.length === 0 && !catalogEmpty && (
            <li
              id={`${listboxId}-opt-${options.length}`}
              role="option"
              aria-selected={highlighted === options.length}
              className={optionClasses(highlighted === options.length)}
              onMouseEnter={() => setHighlighted(options.length)}
              onClick={() => selectFreeText(trimmedQuery)}
            >
              <span>
                Use “{trimmedQuery}”
              </span>
            </li>
          )}

          <li
            id={`${listboxId}-opt-${
              options.length + (trimmedQuery && options.length === 0 ? 1 : 0)
            }`}
            role="option"
            aria-selected={
              highlighted ===
              options.length + (trimmedQuery && options.length === 0 ? 1 : 0)
            }
            className={cx(
              optionClasses(
                highlighted ===
                  options.length +
                    (trimmedQuery && options.length === 0 ? 1 : 0),
              ),
              "border-t border-stone-100 dark:border-stone-900 text-orange-700 dark:text-orange-400 font-medium",
            )}
            onMouseEnter={() =>
              setHighlighted(
                options.length +
                  (trimmedQuery && options.length === 0 ? 1 : 0),
              )
            }
            onClick={() => {
              setMoreOpen(true);
              setIsOpen(false);
            }}
          >
            More units…
          </li>
        </ul>
      )}

      <Modal
        isOpen={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="All units"
        className="max-w-lg"
      >
        <div className="space-y-4">
          <input
            type="text"
            value={moreSearch}
            onChange={(event) => setMoreSearch(event.target.value)}
            placeholder="Search units…"
            autoFocus
            className="w-full h-10 px-3 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 text-sm"
          />
          <div className="max-h-[50vh] overflow-auto space-y-4 pr-1">
            {(grouped ?? []).map((group) => {
              const term = moreSearch.trim().toLowerCase();
              const units = term
                ? group.units.filter(
                    (u) =>
                      u.name.toLowerCase().includes(term) ||
                      u.abbr?.toLowerCase().includes(term) ||
                      u.slug.includes(term),
                  )
                : group.units;
              if (units.length === 0) return null;
              return (
                <div key={group.name}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 mb-1.5">
                    {group.name}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {units.map((unit) => (
                      <button
                        key={unit.id}
                        type="button"
                        onClick={() => selectUnit(unit as UnitOption)}
                        className="px-2.5 py-1.5 rounded-md border border-stone-200 dark:border-stone-800 text-sm text-stone-700 dark:text-stone-300 hover:border-orange-300 hover:bg-orange-50 dark:hover:bg-stone-800 transition-colors"
                      >
                        {unit.label}
                        {unit.abbr && unit.abbr !== unit.name && (
                          <span className="ml-1.5 text-xs text-stone-400">
                            {unit.name}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {grouped !== undefined && grouped.length === 0 && (
              <p className="text-sm text-stone-500">
                The unit catalog is empty. Run{" "}
                <code className="text-xs">npx convex run units:seed</code> to
                load it.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

export interface UnitPickerProps {
  value?: string;
  onChange: (unit: string) => void;
  ingredientName?: string;
  placeholder?: string;
  className?: string;
}

const COMMON_UNITS = [
  "count",
  "g",
  "kg",
  "oz",
  "lb",
  "ml",
  "l",
  "cup",
  "tbsp",
  "tsp",
  "fl oz",
  "can",
  "jar",
  "package",
  "slice",
  "piece",
  "clove",
];

export function UnitPicker({
  value = "",
  onChange,
  ingredientName,
  placeholder = "Select unit",
  className,
}: UnitPickerProps) {
  const [customUnit, setCustomUnit] = useState("");

  const normalizedValue = value.trim();
  const selectedValue = COMMON_UNITS.includes(normalizedValue)
    ? normalizedValue
    : normalizedValue
    ? "__custom__"
    : "";

  const hint = useMemo(() => {
    if (!ingredientName) return "";
    return `Unit for ${ingredientName}`;
  }, [ingredientName]);

  return (
    <div className={className}>
      <select
        value={selectedValue}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "__custom__") {
            if (normalizedValue && !COMMON_UNITS.includes(normalizedValue)) {
              setCustomUnit(normalizedValue);
            }
            return;
          }
          onChange(next);
        }}
        className="w-full h-10 px-3 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
        aria-label={hint || "Pick unit"}
      >
        <option value="">{placeholder}</option>
        {COMMON_UNITS.map((unit) => (
          <option key={unit} value={unit}>
            {unit}
          </option>
        ))}
        <option value="__custom__">Custom...</option>
      </select>

      {selectedValue === "__custom__" && (
        <input
          type="text"
          value={customUnit || normalizedValue}
          onChange={(event) => {
            const next = event.target.value;
            setCustomUnit(next);
            onChange(next);
          }}
          placeholder="Enter custom unit"
          className="mt-2 w-full h-10 px-3 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
        />
      )}
    </div>
  );
}

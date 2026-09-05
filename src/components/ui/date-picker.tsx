"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cx } from "../cooking/utils";

export interface DatePickerProps {
  /** ISO date string (yyyy-mm-dd) or empty. */
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Allow clearing the value (shows an ✕ when set). Defaults to true. */
  clearable?: boolean;
  id?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toISO(year: number, month: number, day: number): string {
  return `${year}-${`${month + 1}`.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
}

function parseISO(value: string): { year: number; month: number; day: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

function formatDisplay(value: string): string {
  const parsed = parseISO(value);
  if (!parsed) return value;
  return `${MONTHS[parsed.month].slice(0, 3)} ${parsed.day}, ${parsed.year}`;
}

export function DatePicker({
  value = "",
  onChange,
  placeholder = "Pick a date",
  className,
  clearable = true,
  id,
}: DatePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const today = useMemo(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
    };
  }, []);

  const selected = value ? parseISO(value) : null;
  const [viewYear, setViewYear] = useState(selected?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState(selected?.month ?? today.month);

  // When opening, focus the view on the selected date (or today).
  const openCalendar = () => {
    const target = value ? parseISO(value) : null;
    setViewYear(target?.year ?? today.year);
    setViewMonth(target?.month ?? today.month);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  return (
    <div ref={containerRef} className={cx("relative", className)}>
      <button
        type="button"
        id={id}
        onClick={() => (isOpen ? setIsOpen(false) : openCalendar())}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="w-full h-10 px-3 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-left flex items-center gap-2"
      >
        <Calendar className="w-4 h-4 text-stone-400 shrink-0" strokeWidth={1.75} />
        <span
          className={cx(
            "flex-1 truncate",
            value
              ? "text-stone-900 dark:text-stone-100"
              : "text-stone-400",
          )}
        >
          {value ? formatDisplay(value) : placeholder}
        </span>
        {clearable && value && (
          <span
            role="button"
            aria-label="Clear date"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onChange("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.stopPropagation();
                onChange("");
              }
            }}
            className="p-0.5 rounded text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute z-30 mt-1 w-64 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shadow-lg p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"
            >
              <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <div className="text-sm font-medium text-stone-900 dark:text-stone-100">
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="p-1 rounded hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-500"
            >
              <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-[11px] font-medium text-stone-400 py-1"
              >
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} />;
              }
              const iso = toISO(viewYear, viewMonth, day);
              const isSelected = value === iso;
              const isToday =
                viewYear === today.year &&
                viewMonth === today.month &&
                day === today.day;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    onChange(iso);
                    setIsOpen(false);
                  }}
                  className={cx(
                    "h-8 rounded text-sm transition-colors",
                    isSelected
                      ? "bg-emerald-600 text-white font-medium"
                      : isToday
                        ? "border border-emerald-500 text-emerald-700 dark:text-emerald-400"
                        : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800",
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="flex justify-between mt-2 pt-2 border-t border-stone-100 dark:border-stone-900">
            <button
              type="button"
              onClick={() => {
                onChange(toISO(today.year, today.month, today.day));
                setIsOpen(false);
              }}
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              Today
            </button>
            {clearable && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setIsOpen(false);
                }}
                className="text-xs text-stone-500 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

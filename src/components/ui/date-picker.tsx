"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
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

export function todayISO(): string {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth(), now.getDate());
}

/** yyyy-mm-dd for the date `days` from today. */
export function daysFromTodayISO(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toISO(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatDisplay(value: string): string {
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

  const openCalendar = () => setIsOpen(true);

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
        <CalendarIcon className="w-4 h-4 text-stone-400 shrink-0" strokeWidth={1.75} />
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
          className="animate-pop-in origin-top-left absolute z-30 mt-1 w-64 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shadow-lg p-3"
        >
          <Calendar
            value={value}
            onSelect={(iso) => {
              onChange(iso);
              setIsOpen(false);
            }}
          />

          <div className="flex justify-between mt-2 pt-2 border-t border-stone-100 dark:border-stone-900">
            <button
              type="button"
              onClick={() => {
                onChange(todayISO());
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

export interface CalendarProps {
  value?: string;
  onSelect: (value: string) => void;
  /** "comfortable" uses larger, round day cells for inline layouts. */
  size?: "compact" | "comfortable";
}

/** A month grid; opens on the selected date, or today. */
export function Calendar({ value = "", onSelect, size = "compact" }: CalendarProps) {
  const [today] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  });
  const selected = value ? parseISO(value) : null;
  const [viewYear, setViewYear] = useState(selected?.year ?? today.year);
  const [viewMonth, setViewMonth] = useState(selected?.month ?? today.month);
  const comfortable = size === "comfortable";

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

  const navButton = cx(
    "rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800",
    comfortable ? "p-2 text-emerald-600 dark:text-emerald-400" : "p-1",
  );

  return (
    <div>
      <div className={cx("flex items-center justify-between", comfortable ? "mb-3" : "mb-2")}>
        <div
          aria-live="polite"
          className={cx(
            "font-medium text-stone-900 dark:text-stone-100",
            comfortable ? "pl-1 text-base" : "order-2 text-sm",
          )}
        >
          {MONTHS[viewMonth]} {viewYear}
        </div>
        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className={cx(navButton, comfortable ? "ml-auto" : "order-1")}>
          <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />
        </button>
        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className={cx(navButton, "order-3")}>
          <ChevronRight className="w-4 h-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className={cx(
              "font-medium text-stone-400 py-1",
              comfortable ? "text-[11px] uppercase tracking-wide" : "text-[11px]",
            )}
          >
            {day}
          </div>
        ))}
      </div>
      {/* Keyed by month so a new month fades in rather than snapping. */}
      <div key={`${viewYear}-${viewMonth}`} className={cx("animate-fade-in grid grid-cols-7", comfortable ? "gap-y-1" : "gap-0.5")}>
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
              aria-pressed={isSelected}
              aria-label={formatDisplay(iso)}
              onClick={() => onSelect(iso)}
              className={cx(
                "text-sm transition-colors",
                comfortable ? "mx-auto h-10 w-10 rounded-full" : "h-8 rounded",
                isSelected
                  ? "bg-emerald-600 text-white font-medium"
                  : isToday
                    ? comfortable
                      ? "bg-emerald-100 text-emerald-800 font-medium dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "border border-emerald-500 text-emerald-700 dark:text-emerald-400"
                    : "text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, Search } from "lucide-react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export interface SearchableSelectOption {
  value: string;
  label: string;
  searchText?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  panelClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found",
  className,
  panelClassName,
  ariaLabel,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedLabel = useMemo(() => {
    return options.find((option) => option.value === value)?.label || "";
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) => {
      const hay = `${option.label} ${option.searchText ?? ""}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [options, query]);

  const closeDropdown = () => {
    setOpen(false);
    setQuery("");
  };

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      closeDropdown();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDropdown();
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      setPosition({
        top: rect.bottom + scrollY + 8,
        left: rect.left + scrollX,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          if (open) closeDropdown();
          else {
            setQuery("");
            setOpen(true);
          }
        }}
        className={cx(
          "h-10 w-full px-3 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30",
          disabled && "opacity-60 cursor-not-allowed",
          className
        )}
      >
        <span className="truncate text-left">
          {selectedLabel || (
            <span className="text-stone-400 dark:text-stone-500">
              {placeholder}
            </span>
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-stone-400" />
      </button>

      {open &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            className={cx(
              "fixed z-[10000] rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shadow-lg",
              panelClassName
            )}
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${Math.max(position.width, 220)}px`,
            }}
          >
            <div className="p-2 border-b border-stone-200 dark:border-stone-800">
              <div className="relative">
                <Search className="w-4 h-4 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full pl-8 pr-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-auto p-1">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-stone-500 dark:text-stone-400">
                  {emptyMessage}
                </div>
              ) : (
                filteredOptions.map((option) => {
                  const selected = option.value === value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        onChange(option.value);
                        closeDropdown();
                      }}
                      className={cx(
                        "w-full px-3 py-2 rounded-md text-left text-sm flex items-center gap-2",
                        selected
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100"
                          : "text-stone-800 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-900"
                      )}
                    >
                      <Check
                        className={cx(
                          "h-4 w-4 shrink-0",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="truncate">{option.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

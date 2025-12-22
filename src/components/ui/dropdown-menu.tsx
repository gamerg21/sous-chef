"use client";

import * as React from "react";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

interface DropdownMenuProps {
  children: React.ReactNode;
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block text-left">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

interface DropdownMenuTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

export function DropdownMenuTrigger({ asChild, children }: DropdownMenuTriggerProps) {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenuTrigger must be used within DropdownMenu");

  const handleClick = () => {
    context.setOpen(!context.open);
  };

  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as { onClick?: (e: React.MouseEvent) => void };
    return React.cloneElement(children, {
      onClick: (e: React.MouseEvent) => {
        handleClick();
        childProps.onClick?.(e);
      },
    } as React.HTMLAttributes<HTMLElement>);
  }

  return (
    <button type="button" onClick={handleClick}>
      {children}
    </button>
  );
}

interface DropdownMenuContentProps {
  align?: "start" | "end" | "center";
  children: React.ReactNode;
}

export function DropdownMenuContent({ align = "start", children }: DropdownMenuContentProps) {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenuContent must be used within DropdownMenu");

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".dropdown-menu-content")) {
        context.setOpen(false);
      }
    };

    if (context.open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [context.open, context]);

  if (!context.open) return null;

  const alignClasses = {
    start: "left-0",
    end: "right-0",
    center: "left-1/2 -translate-x-1/2",
  };

  return (
    <div
      className={`dropdown-menu-content absolute z-50 mt-2 min-w-[8rem] rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shadow-lg ${alignClasses[align]}`}
    >
      {children}
    </div>
  );
}

interface DropdownMenuItemProps {
  variant?: "default" | "destructive";
  onClick?: () => void;
  children: React.ReactNode;
}

export function DropdownMenuItem({
  variant = "default",
  onClick,
  children,
}: DropdownMenuItemProps) {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenuItem must be used within DropdownMenu");

  const handleClick = () => {
    onClick?.();
    context.setOpen(false);
  };

  const variantClasses = {
    default: "text-stone-900 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-900",
    destructive: "text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20",
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${variantClasses[variant]}`}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="h-px bg-stone-200 dark:bg-stone-800 my-1" />;
}


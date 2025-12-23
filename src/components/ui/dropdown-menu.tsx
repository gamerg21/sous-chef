"use client";

import * as React from "react";
import { createPortal } from "react-dom";

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

interface DropdownMenuProps {
  children: React.ReactNode;
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLElement>(null);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
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
    const childProps = children.props as { onClick?: (e: React.MouseEvent) => void; ref?: React.Ref<HTMLElement> };
    const originalRef = (children as any).ref;
    // Extract ref object to avoid direct context mutation
    const triggerRef = context.triggerRef;
    
    return React.cloneElement(children, {
      ref: (node: HTMLElement | null) => {
        triggerRef.current = node;
        // Preserve any existing ref
        if (typeof originalRef === 'function') {
          originalRef(node);
        } else if (originalRef && typeof originalRef === 'object' && 'current' in originalRef) {
          // eslint-disable-next-line react-hooks/immutability
          (originalRef as React.MutableRefObject<HTMLElement | null>).current = node;
        }
      },
      onClick: (e: React.MouseEvent) => {
        handleClick();
        childProps.onClick?.(e);
      },
    } as React.HTMLAttributes<HTMLElement>);
  }

  return (
    <button type="button" ref={context.triggerRef as React.RefObject<HTMLButtonElement>} onClick={handleClick}>
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
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest(".dropdown-menu-content") && !context.triggerRef.current?.contains(target)) {
        context.setOpen(false);
      }
    };

    if (context.open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [context.open, context]);

  React.useEffect(() => {
    if (context.open && context.triggerRef.current) {
      const updatePosition = () => {
        const trigger = context.triggerRef.current;
        if (!trigger) return;

        const rect = trigger.getBoundingClientRect();
        const contentWidth = contentRef.current?.offsetWidth || 128;
        const contentHeight = contentRef.current?.offsetHeight || 0;
        const scrollY = window.scrollY;
        const scrollX = window.scrollX;

        let left = rect.left + scrollX;
        let top = rect.bottom + scrollY + 8; // mt-2 = 8px

        if (align === "end") {
          left = rect.right + scrollX - contentWidth;
        } else if (align === "center") {
          left = rect.left + scrollX + rect.width / 2 - contentWidth / 2;
        }

        // Adjust if menu would go off-screen
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        if (left + contentWidth > viewportWidth + scrollX) {
          left = viewportWidth + scrollX - contentWidth - 8;
        }
        if (left < scrollX) {
          left = scrollX + 8;
        }
        
        // If menu would go below viewport, show above instead
        if (top + contentHeight > scrollY + viewportHeight) {
          top = rect.top + scrollY - contentHeight - 8;
        }

        setPosition({ top, left });
      };

      updatePosition();
      window.addEventListener("resize", updatePosition);
      window.addEventListener("scroll", updatePosition, true);

      return () => {
        window.removeEventListener("resize", updatePosition);
        window.removeEventListener("scroll", updatePosition, true);
      };
    }
  }, [context.open, align, context]);

  if (!context.open) return null;

  const content = (
    <div
      ref={contentRef}
      className="dropdown-menu-content fixed z-[9999] min-w-[8rem] rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 shadow-lg"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      {children}
    </div>
  );

  // Use portal to render outside the normal DOM hierarchy
  if (typeof window !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
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


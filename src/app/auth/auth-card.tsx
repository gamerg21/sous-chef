import type { ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { buttonClassName, cx, fieldClassName, headingFont } from "@/components/ui/kit";

/** Shared look for the signed-out screens: logo, heading-font title, one rounded card. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-50 px-4 py-10 font-sans dark:bg-stone-950">
      <div className="w-full max-w-md animate-fade-in">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm shadow-stone-900/5 sm:p-8 dark:border-stone-800 dark:bg-stone-900/60">
          <div className="flex flex-col items-center text-center">
            <BrandLogo size={56} />
            <h1
              className="mt-5 text-2xl font-semibold leading-tight tracking-tight text-stone-900 sm:text-3xl dark:text-stone-50"
              style={headingFont}
            >
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-sm text-sm text-stone-600 dark:text-stone-400">{description}</p>
            )}
          </div>
          <div className="mt-8">{children}</div>
        </div>
        {footer && (
          <div className="mt-6 space-y-2 text-center text-sm text-stone-600 dark:text-stone-400">{footer}</div>
        )}
      </div>
    </main>
  );
}

export const authInputClassName = cx(fieldClassName, "mt-1.5");

export const authSubmitClassName = cx(buttonClassName("primary"), "min-h-11 w-full");

/** Primary text link (e.g. "Sign up"). */
export const authLinkClassName =
  "font-medium text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300";

/** Quiet secondary link (e.g. "Back to sign in"). */
export const authQuietLinkClassName =
  "inline-flex min-h-11 items-center text-stone-600 underline-offset-4 hover:text-stone-900 hover:underline dark:text-stone-400 dark:hover:text-stone-100";

/** Inline result message. Messages starting with or containing "Error" render as errors. */
export function AuthMessage({ message, role }: { message: string; role?: "status" | "alert" }) {
  if (!message) return null;
  const isError = message.includes("Error");
  return (
    <div
      role={role}
      className={cx(
        "animate-fade-in rounded-xl px-3 py-2.5 text-sm",
        isError
          ? "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
          : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      )}
    >
      {message}
    </div>
  );
}

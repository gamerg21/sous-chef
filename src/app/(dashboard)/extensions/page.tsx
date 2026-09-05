"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import { useRouter } from "next/navigation";
import { ExtensionCard } from "@/components/community";
import type { ExtensionListing } from "@/components/community/types";

export default function ExtensionsPage() {
  const router = useRouter();
  const extensionsData = useQuery(api.extensions.list, {});

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | "all">("all");

  const extensions = useMemo(
    () => extensionsData?.extensions || [],
    [extensionsData?.extensions]
  );

  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    extensions.forEach((extension) => categorySet.add(extension.category));
    return Array.from(categorySet).sort();
  }, [extensions]);

  const handleOpenExtension = useCallback(
    (id: string) => {
      router.push(`/extensions/${id}`);
    },
    [router]
  );

  const filteredExtensions = useMemo(() => {
    return extensions.filter((extension) => {
      if (category !== "all" && extension.category !== category) return false;
      if (!query.trim()) return true;
      const searchText = `${extension.name} ${extension.description} ${extension.category} ${(extension.tags ?? []).join(" ")} ${extension.author.name}`.toLowerCase();
      return searchText.includes(query.toLowerCase());
    });
  }, [category, extensions, query]);

  if (extensionsData === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 dark:text-stone-100">Extension catalog</h1>
          <p className="mt-2 text-stone-600 dark:text-stone-400">
            A preview of add-ons planned for Sous Chef. None can be installed yet, and nothing in your kitchen
            depends on them. Working features live in{" "}
            <Link href="/settings/ai" className="text-emerald-700 underline dark:text-emerald-300">
              AI settings
            </Link>
            .
          </p>
        </div>

        {extensions.length > 0 ? (
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="extension-search" className="sr-only">
                Search the catalog
              </label>
              <input
                id="extension-search"
                type="search"
                placeholder="Search the catalog…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full min-h-11 px-4 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setCategory("all")}
                className={`min-h-11 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                  category === "all"
                    ? "bg-emerald-600 text-white"
                    : "bg-stone-100 dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800"
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`min-h-11 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    category === cat
                      ? "bg-emerald-600 text-white"
                      : "bg-stone-100 dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {filteredExtensions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExtensions.map((extension) => (
              <ExtensionCard
                key={extension.id}
                extension={extension as ExtensionListing}
                onOpen={handleOpenExtension}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-stone-300 dark:border-stone-700 p-8 text-center">
            <p className="text-stone-700 dark:text-stone-300">
              {query || category !== "all"
                ? "No listings match your filters."
                : "No extensions are listed on this instance."}
            </p>
            <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
              Third-party grocery, calendar, and device integrations are future work.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

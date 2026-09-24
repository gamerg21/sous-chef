"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@/lib/kitchen/client";
import Link from "next/link";
import { api } from "@/lib/kitchen/api";
import { useRouter } from "next/navigation";
import { ExtensionCard } from "@/components/community";
import type { ExtensionListing } from "@/components/community/types";
import { PageLoader } from "@/components/ui/page-loader";
import { cardClassName, chipClassName, cx, EmptyState, fieldClassName, PageContainer, PageHeader, rowsClassName, Section } from "@/components/ui/kit";
import { Puzzle, Search, SearchX } from "lucide-react";

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
    return <PageLoader />;
  }

  const hasFilters = Boolean(query) || category !== "all";

  return (
    <PageContainer width="4xl">
      <PageHeader
        eyebrow="Extensions"
        title="Extension catalog"
        description={
          <>
            A preview of add-ons planned for Sous Chef. None can be installed yet, and nothing in your kitchen
            depends on them. Working features live in{" "}
            <Link href="/settings/integrations" className="text-emerald-700 underline dark:text-emerald-300">
              Integrations
            </Link>
            .
          </>
        }
      />

      {extensions.length > 0 ? (
        <div className="space-y-3">
          <div className="relative">
            <label htmlFor="extension-search" className="sr-only">
              Search the catalog
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" strokeWidth={1.75} aria-hidden="true" />
            <input
              id="extension-search"
              type="search"
              placeholder="Search the catalog…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className={cx(fieldClassName, "pl-10")}
            />
          </div>
          <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 py-1">
            <button
              type="button"
              aria-pressed={category === "all"}
              onClick={() => setCategory("all")}
              className={cx(chipClassName(category === "all"), "shrink-0")}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                aria-pressed={category === cat}
                onClick={() => setCategory(cat)}
                className={cx(chipClassName(category === cat), "shrink-0")}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Section title="Listings" aside={extensions.length > 0 ? `${filteredExtensions.length} of ${extensions.length}` : undefined}>
        <div className={cx(cardClassName, "overflow-hidden")}>
          {filteredExtensions.length > 0 ? (
            <div className={cx("stagger", rowsClassName)}>
              {filteredExtensions.map((extension) => (
                <ExtensionCard
                  key={extension.id}
                  extension={extension as ExtensionListing}
                  onOpen={handleOpenExtension}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={hasFilters ? SearchX : Puzzle}
              title={hasFilters ? "No listings match your filters." : "No extensions are listed on this instance."}
              description="Third-party grocery, calendar, and device integrations are future work."
            />
          )}
        </div>
      </Section>
    </PageContainer>
  );
}

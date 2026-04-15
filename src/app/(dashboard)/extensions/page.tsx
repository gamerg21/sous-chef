"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import { ExtensionCard } from "@/components/community";
import type { ExtensionListing, InstalledExtension } from "@/components/community/types";
import { AlertModal } from "@/components/ui/alert-modal";

export default function ExtensionsPage() {
  const router = useRouter();
  const extensionsData = useQuery(api.extensions.list, {});
  const installExtension = useMutation(api.extensions.install);
  const toggleExtension = useMutation(api.extensions.toggle);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | "all">("all");
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const extensions = useMemo(
    () => extensionsData?.extensions || [],
    [extensionsData?.extensions]
  );

  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    extensions.forEach((extension) => categorySet.add(extension.category));
    return Array.from(categorySet).sort();
  }, [extensions]);

  const installedExtensions = useMemo<InstalledExtension[]>(
    () =>
      extensions
        .filter((extension) => (extension as ExtensionListing & { isInstalled?: boolean }).isInstalled)
        .map((extension) => {
          const typed = extension as ExtensionListing & {
            installedExtension?: { enabled: boolean; needsConfiguration?: boolean };
          };
          return {
            extensionId: extension.id,
            enabled: typed.installedExtension?.enabled || false,
            needsConfiguration: typed.installedExtension?.needsConfiguration || false,
          };
        }),
    [extensions]
  );

  const handleOpenExtension = useCallback(
    (id: string) => {
      router.push(`/extensions/${id}`);
    },
    [router]
  );

  const handleInstallExtension = useCallback(
    async (id: string) => {
      try {
        await installExtension({ extensionId: id as Id<"extensionListings"> });
        setAlertModal({ isOpen: true, message: "Extension installed!", variant: "success" });
      } catch (error) {
        console.error("Error installing extension:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to install extension. Please try again.",
          variant: "error",
        });
      }
    },
    [installExtension]
  );

  const handleToggleExtensionEnabled = useCallback(
    async (id: string) => {
      try {
        const installed = installedExtensions.find((extension) => extension.extensionId === id);
        await toggleExtension({ extensionId: id as Id<"extensionListings"> });
      } catch (error) {
        console.error("Error toggling extension:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to toggle extension. Please try again.",
          variant: "error",
        });
      }
    },
    [installedExtensions, toggleExtension]
  );

  const handleGoToSettings = useCallback(() => {
    router.push("/extensions/integrations");
  }, [router]);

  const filteredExtensions = useMemo(() => {
    return extensions.filter((extension) => {
      if (category !== "all" && extension.category !== category) return false;
      if (!query.trim()) return true;
      const searchText = `${extension.name} ${extension.description} ${extension.category} ${(extension.tags ?? []).join(" ")} ${extension.author.name}`.toLowerCase();
      return searchText.includes(query.toLowerCase());
    });
  }, [category, extensions, query]);

  const installedMap = useMemo(() => {
    const map = new Map<string, InstalledExtension>();
    installedExtensions.forEach((installed) => {
      map.set(installed.extensionId, installed);
    });
    return map;
  }, [installedExtensions]);

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
          <h1 className="text-3xl font-semibold text-stone-900 dark:text-stone-100">Extensions</h1>
          <p className="mt-2 text-stone-600 dark:text-stone-400">
            Discover and install add-ons to extend Sous Chef functionality.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search extensions..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full px-4 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setCategory("all")}
              className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
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
                onClick={() => setCategory(cat)}
                className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
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

        {filteredExtensions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExtensions.map((extension) => {
              const installed = installedMap.get(extension.id);
              return (
                <ExtensionCard
                  key={extension.id}
                  extension={extension as ExtensionListing}
                  installed={!!installed}
                  enabled={installed?.enabled}
                  needsConfiguration={installed?.needsConfiguration}
                  onOpen={handleOpenExtension}
                  onInstall={handleInstallExtension}
                  onToggleEnabled={handleToggleExtensionEnabled}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-stone-600 dark:text-stone-400">
              {query || category !== "all"
                ? "No extensions found matching your filters."
                : "No extensions available yet."}
            </p>
          </div>
        )}

        {installedExtensions.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
              Installed Extensions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {installedExtensions.map((installed) => {
                const extension = extensions.find((candidate) => candidate.id === installed.extensionId);
                if (!extension) return null;
                return (
                  <ExtensionCard
                    key={extension.id}
                    extension={extension as ExtensionListing}
                    installed={true}
                    enabled={installed.enabled}
                    needsConfiguration={installed.needsConfiguration}
                    onOpen={handleOpenExtension}
                    onInstall={handleInstallExtension}
                    onToggleEnabled={handleToggleExtensionEnabled}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 pt-8 border-t border-stone-200 dark:border-stone-800">
          <button
            onClick={handleGoToSettings}
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium"
          >
            Manage Integrations & AI Settings →
          </button>
        </div>
      </div>
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() =>
          setAlertModal({ isOpen: false, message: "", variant: "error" })
        }
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
}

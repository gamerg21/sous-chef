"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ExtensionCard } from "@/components/community";
import type {
  ExtensionListing,
  InstalledExtension,
} from "@/components/community/types";

export default function ExtensionsPage() {
  const router = useRouter();
  const [extensions, setExtensions] = useState<ExtensionListing[]>([]);
  const [installedExtensions, setInstalledExtensions] = useState<InstalledExtension[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | "all">("all");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch extensions
      const extensionsResponse = await fetch("/api/extensions");
      if (extensionsResponse.ok) {
        const extensionsData = await extensionsResponse.json();
        setExtensions(extensionsData.extensions || []);
        
        // Extract categories
        const cats = new Set<string>();
        extensionsData.extensions?.forEach((ext: ExtensionListing) => {
          cats.add(ext.category);
        });
        setCategories(Array.from(cats).sort());
        
        // Extract installed extensions
        const installed = extensionsData.extensions
          ?.filter((ext: any) => ext.isInstalled)
          .map((ext: any) => ({
            extensionId: ext.id,
            enabled: ext.installedExtension?.enabled || false,
            needsConfiguration: ext.installedExtension?.needsConfiguration || false,
          })) || [];
        setInstalledExtensions(installed);
      }
    } catch (error) {
      console.error("Error fetching extensions:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenExtension = useCallback((id: string) => {
    router.push(`/extensions/${id}`);
  }, [router]);

  const handleInstallExtension = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/extensions/${id}/install`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to install extension");
      await fetchData();
      alert("Extension installed!");
    } catch (error) {
      console.error("Error installing extension:", error);
      alert("Failed to install extension. Please try again.");
    }
  }, [fetchData]);

  const handleToggleExtensionEnabled = useCallback(async (id: string) => {
    try {
      const installed = installedExtensions.find((e) => e.extensionId === id);
      const response = await fetch(`/api/extensions/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !installed?.enabled }),
      });
      if (!response.ok) throw new Error("Failed to toggle extension");
      await fetchData();
    } catch (error) {
      console.error("Error toggling extension:", error);
      alert("Failed to toggle extension. Please try again.");
    }
  }, [installedExtensions, fetchData]);

  const handleGoToSettings = useCallback(() => {
    router.push("/extensions/integrations");
  }, [router]);

  const filteredExtensions = extensions.filter((ext) => {
    if (category !== "all" && ext.category !== category) return false;
    if (!query.trim()) return true;
    const searchText = `${ext.name} ${ext.description} ${ext.category} ${(ext.tags ?? []).join(" ")} ${ext.author.name}`.toLowerCase();
    return searchText.includes(query.toLowerCase());
  });

  const installedMap = new Map<string, InstalledExtension>();
  installedExtensions.forEach((installed) => {
    installedMap.set(installed.extensionId, installed);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
            Extensions
          </h1>
          <p className="mt-2 text-stone-600 dark:text-stone-400">
            Discover and install add-ons to extend Sous Chef functionality.
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search extensions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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

        {/* Extensions Grid */}
        {filteredExtensions.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredExtensions.map((extension) => {
              const installed = installedMap.get(extension.id);
              return (
                <ExtensionCard
                  key={extension.id}
                  extension={extension}
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

        {/* Installed Extensions Section */}
        {installedExtensions.length > 0 && (
          <div className="mt-12 space-y-4">
            <h2 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
              Installed Extensions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {installedExtensions.map((installed) => {
                const extension = extensions.find((e) => e.id === installed.extensionId);
                if (!extension) return null;
                return (
                  <ExtensionCard
                    key={extension.id}
                    extension={extension}
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

        {/* Settings Link */}
        <div className="mt-8 pt-8 border-t border-stone-200 dark:border-stone-800">
          <button
            onClick={handleGoToSettings}
            className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-medium"
          >
            Manage Integrations & AI Settings →
          </button>
        </div>
      </div>
    </div>
  );
}


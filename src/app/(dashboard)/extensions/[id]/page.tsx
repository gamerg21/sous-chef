"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ExtensionDetailView } from "@/components/community";
import type { ExtensionListing } from "@/components/community/types";

export default function ExtensionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [extension, setExtension] = useState<ExtensionListing | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchExtension = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/extensions/${id}`);
      if (!response.ok) throw new Error("Failed to fetch extension");
      const data = await response.json();
      setExtension(data);
    } catch (error) {
      console.error("Error fetching extension:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchExtension();
    }
  }, [id, fetchExtension]);

  const handleInstall = useCallback(async () => {
    if (!extension) return;
    try {
      const response = await fetch(`/api/extensions/${extension.id}/install`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to install extension");
      await fetchExtension();
      alert("Extension installed!");
    } catch (error) {
      console.error("Error installing extension:", error);
      alert("Failed to install extension. Please try again.");
    }
  }, [extension, fetchExtension]);

  const handleUninstall = useCallback(async () => {
    if (!extension) return;
    if (!confirm("Are you sure you want to uninstall this extension?")) return;
    try {
      const response = await fetch(`/api/extensions/${extension.id}/uninstall`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to uninstall extension");
      await fetchExtension();
      alert("Extension uninstalled!");
    } catch (error) {
      console.error("Error uninstalling extension:", error);
      alert("Failed to uninstall extension. Please try again.");
    }
  }, [extension, fetchExtension]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  if (!extension) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Extension not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <ExtensionDetailView
        extension={extension}
        isInstalled={extension.isInstalled || false}
        installedExtension={extension.installedExtension}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        onBack={() => router.back()}
      />
    </div>
  );
}


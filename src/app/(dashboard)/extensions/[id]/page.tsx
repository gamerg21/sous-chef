"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useRouter, useParams } from "next/navigation";
import { ExtensionDetailView } from "@/components/community";
import type { ExtensionListing, InstalledExtension } from "@/components/community/types";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";

export default function ExtensionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as Id<"extensionListings">;

  const extension = useQuery(api.extensions.getById, id ? { id } : "skip");
  const installExtension = useMutation(api.extensions.install);
  const uninstallExtension = useMutation(api.extensions.uninstall);

  const extensionData = useMemo(() => extension || null, [extension]);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });
  const [showUninstallConfirm, setShowUninstallConfirm] = useState(false);

  const handleInstall = useCallback(
    async (extensionId: string) => {
      try {
        await installExtension({ extensionId: extensionId as Id<"extensionListings"> });
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

  const handleConfirmUninstall = useCallback(async () => {
    if (!extensionData) return;

    try {
      await uninstallExtension({ extensionId: extensionData.id });
      setAlertModal({ isOpen: true, message: "Extension uninstalled!", variant: "success" });
      setShowUninstallConfirm(false);
    } catch (error) {
      console.error("Error uninstalling extension:", error);
      setAlertModal({
        isOpen: true,
        message: "Failed to uninstall extension. Please try again.",
        variant: "error",
      });
      setShowUninstallConfirm(false);
    }
  }, [extensionData, uninstallExtension]);

  if (extension === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  if (!extensionData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Extension not found</p>
      </div>
    );
  }

  const installed: InstalledExtension | null = extensionData.installedExtension
    ? {
        extensionId: extensionData.id,
        enabled: extensionData.installedExtension.enabled,
        needsConfiguration: extensionData.installedExtension.needsConfiguration,
      }
    : null;

  return (
    <div className="container mx-auto px-4 py-8">
      <ExtensionDetailView
        extension={extensionData as ExtensionListing}
        installed={installed}
        onInstall={handleInstall}
        onBack={() => router.back()}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() =>
          setAlertModal({ isOpen: false, message: "", variant: "error" })
        }
        message={alertModal.message}
        variant={alertModal.variant}
      />
      <ConfirmModal
        isOpen={showUninstallConfirm}
        onClose={() => setShowUninstallConfirm(false)}
        onConfirm={handleConfirmUninstall}
        title="Uninstall extension"
        message="Are you sure you want to uninstall this extension?"
        confirmText="Uninstall"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </div>
  );
}

"use client";

import { useCallback, useState } from "react";
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
  const uninstallExtension = useMutation(api.extensions.uninstall);

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleConfirmRemove = useCallback(async () => {
    if (!extension) return;
    try {
      await uninstallExtension({ extensionId: extension.id });
      setAlertModal({ isOpen: true, message: "Listing removed from this kitchen.", variant: "success" });
    } catch (error) {
      console.error("Error removing extension listing:", error);
      setAlertModal({
        isOpen: true,
        message: "Couldn’t remove the listing. Please try again.",
        variant: "error",
      });
    } finally {
      setShowRemoveConfirm(false);
    }
  }, [extension, uninstallExtension]);

  if (extension === undefined) {
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

  const installed: InstalledExtension | null = extension.installedExtension
    ? {
        extensionId: extension.id,
        enabled: extension.installedExtension.enabled,
        needsConfiguration: extension.installedExtension.needsConfiguration,
      }
    : null;

  return (
    <div className="container mx-auto px-4 py-8">
      <ExtensionDetailView
        extension={extension as ExtensionListing}
        installed={installed}
        onBack={() => router.push("/extensions")}
        onRemove={() => setShowRemoveConfirm(true)}
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
        isOpen={showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={handleConfirmRemove}
        title="Remove listing"
        message="Remove this listing's record from your kitchen? Nothing else changes, because the extension was never active."
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </div>
  );
}

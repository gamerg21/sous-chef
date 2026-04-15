"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { IntegrationsSettingsView } from "@/components/community";
import type { AiSettings, Integration } from "@/components/community/types";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function IntegrationsPage() {
  const integrationsData = useQuery(api.integrations.list, {});
  const aiSettingsData = useQuery(api.aiProviders.list, {});
  const connectIntegration = useMutation(api.integrations.connect);
  const disconnectIntegration = useMutation(api.integrations.disconnect);
  const configureAiProvider = useMutation(api.aiProviders.configure);

  const integrations = useMemo<Integration[]>(
    () => (integrationsData?.integrations || []) as Integration[],
    [integrationsData?.integrations]
  );
  const aiSettings = (aiSettingsData || null) as AiSettings | null;

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });
  const [integrationToDisconnect, setIntegrationToDisconnect] = useState<Id<"integrations"> | null>(null);

  const handleConnectIntegration = useCallback(
    async (id: string) => {
      try {
        await connectIntegration({ integrationId: id as Id<"integrations"> });
        setAlertModal({ isOpen: true, message: "Integration connected!", variant: "success" });
      } catch (error) {
        console.error("Error connecting integration:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to connect integration. Please try again.",
          variant: "error",
        });
      }
    },
    [integrations, connectIntegration]
  );

  const handleDisconnectIntegration = useCallback((id: string) => {
    setIntegrationToDisconnect(id as Id<"integrations">);
  }, []);

  const handleConfirmDisconnect = useCallback(async () => {
    const id = integrationToDisconnect;
    if (!id) return;

    try {
      await disconnectIntegration({ integrationId: id });
      setAlertModal({ isOpen: true, message: "Integration disconnected!", variant: "success" });
      setIntegrationToDisconnect(null);
    } catch (error) {
      console.error("Error disconnecting integration:", error);
      setAlertModal({
        isOpen: true,
        message: "Failed to disconnect integration. Please try again.",
        variant: "error",
      });
      setIntegrationToDisconnect(null);
    }
  }, [integrationToDisconnect, disconnectIntegration]);

  const handleSelectActiveProvider = useCallback(
    async (providerId: string) => {
      try {
        await configureAiProvider({ providerId, isActive: true });
      } catch (error) {
        console.error("Error setting active provider:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to set active provider. Please try again.",
          variant: "error",
        });
      }
    },
    [configureAiProvider]
  );

  const handleSaveApiKey = useCallback(
    async (providerId: string, key: string) => {
      try {
        await configureAiProvider({ providerId, apiKey: key });
        setAlertModal({ isOpen: true, message: "API key saved!", variant: "success" });
      } catch (error) {
        console.error("Error saving API key:", error);
        setAlertModal({
          isOpen: true,
          message: "Failed to save API key. Please try again.",
          variant: "error",
        });
      }
    },
    [configureAiProvider]
  );

  const handleTestAiConnection = useCallback(async () => {
    if (!aiSettings?.activeProviderId) {
      setAlertModal({ isOpen: true, message: "Please select an active provider first.", variant: "warning" });
      return;
    }

    try {
      const data = await fetchJSON<{ success: boolean; error?: string }>(
        `/api/ai/providers/${aiSettings.activeProviderId}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey: "test" }),
        }
      );

      if (data.success) {
        setAlertModal({ isOpen: true, message: "Connection test successful!", variant: "success" });
      } else {
        setAlertModal({
          isOpen: true,
          message: `Connection test failed: ${data.error || "Unknown error"}`,
          variant: "error",
        });
      }
    } catch (error) {
      console.error("Error testing AI connection:", error);
      setAlertModal({
        isOpen: true,
        message: "Failed to test AI connection. Please try again.",
        variant: "error",
      });
    }
  }, [aiSettings]);

  if (integrationsData === undefined || aiSettingsData === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <IntegrationsSettingsView
        integrations={integrations}
        ai={aiSettings || { keyMode: "bring-your-own", providers: [], activeProviderId: undefined }}
        onConnectIntegration={handleConnectIntegration}
        onDisconnectIntegration={handleDisconnectIntegration}
        onSelectActiveProvider={handleSelectActiveProvider}
        onSaveApiKey={handleSaveApiKey}
        onTestAiConnection={handleTestAiConnection}
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
        isOpen={integrationToDisconnect !== null}
        onClose={() => setIntegrationToDisconnect(null)}
        onConfirm={handleConfirmDisconnect}
        title="Disconnect integration"
        message="Are you sure you want to disconnect this integration?"
        confirmText="Disconnect"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { IntegrationsSettingsView } from "@/components/community";
import type { Integration, AiSettings } from "@/components/community/types";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; variant?: 'success' | 'error' | 'info' | 'warning' }>({ isOpen: false, message: '', variant: 'error' });
  const [integrationToDisconnect, setIntegrationToDisconnect] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch integrations
      const integrationsResponse = await fetch("/api/integrations");
      if (integrationsResponse.ok) {
        const data = await integrationsResponse.json();
        setIntegrations(data.integrations || []);
      }

      // Fetch AI settings
      const aiResponse = await fetch("/api/ai/providers");
      if (aiResponse.ok) {
        const data = await aiResponse.json();
        setAiSettings(data);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConnectIntegration = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/integrations/${id}/connect`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to connect integration");
      await fetchData();
      setAlertModal({ isOpen: true, message: "Integration connected!", variant: 'success' });
    } catch (error) {
      console.error("Error connecting integration:", error);
      setAlertModal({ isOpen: true, message: "Failed to connect integration. Please try again.", variant: 'error' });
    }
  }, [fetchData]);

  const handleDisconnectIntegration = useCallback((id: string) => {
    setIntegrationToDisconnect(id);
  }, []);

  const handleConfirmDisconnect = useCallback(async () => {
    const id = integrationToDisconnect;
    if (!id) return;

    try {
      const response = await fetch(`/api/integrations/${id}/disconnect`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to disconnect integration");
      await fetchData();
      setAlertModal({ isOpen: true, message: "Integration disconnected!", variant: 'success' });
      setIntegrationToDisconnect(null);
    } catch (error) {
      console.error("Error disconnecting integration:", error);
      setAlertModal({ isOpen: true, message: "Failed to disconnect integration. Please try again.", variant: 'error' });
      setIntegrationToDisconnect(null);
    }
  }, [integrationToDisconnect, fetchData]);

  const handleSelectActiveProvider = useCallback(async (providerId: string) => {
    try {
      const response = await fetch(`/api/ai/providers/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      if (!response.ok) throw new Error("Failed to set active provider");
      await fetchData();
    } catch (error) {
      console.error("Error setting active provider:", error);
      setAlertModal({ isOpen: true, message: "Failed to set active provider. Please try again.", variant: 'error' });
    }
  }, [fetchData]);

  const handleSaveApiKey = useCallback(async (providerId: string, key: string) => {
    try {
      const response = await fetch(`/api/ai/providers/${providerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: key }),
      });
      if (!response.ok) throw new Error("Failed to save API key");
      await fetchData();
      setAlertModal({ isOpen: true, message: "API key saved!", variant: 'success' });
    } catch (error) {
      console.error("Error saving API key:", error);
      setAlertModal({ isOpen: true, message: "Failed to save API key. Please try again.", variant: 'error' });
    }
  }, [fetchData]);

  const handleTestAiConnection = useCallback(async () => {
    if (!aiSettings?.activeProviderId) {
      setAlertModal({ isOpen: true, message: "Please select an active provider first.", variant: 'warning' });
      return;
    }
    try {
      const response = await fetch(`/api/ai/providers/${aiSettings.activeProviderId}/test`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to test AI connection");
      const data = await response.json();
      if (data.success) {
        setAlertModal({ isOpen: true, message: "Connection test successful!", variant: 'success' });
      } else {
        setAlertModal({ isOpen: true, message: `Connection test failed: ${data.error || "Unknown error"}`, variant: 'error' });
      }
    } catch (error) {
      console.error("Error testing AI connection:", error);
      setAlertModal({ isOpen: true, message: "Failed to test AI connection. Please try again.", variant: 'error' });
    }
  }, [aiSettings]);

  if (loading) {
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
        onDisconnectIntegration={handleDisconnectIntegration}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, message: '', variant: 'error' })}
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


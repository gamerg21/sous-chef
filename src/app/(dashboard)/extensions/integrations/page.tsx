"use client";

import { useEffect, useState, useCallback } from "react";
import { IntegrationsSettingsView } from "@/components/community";
import type { Integration, AiSettings } from "@/components/community/types";

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(true);

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
      alert("Integration connected!");
    } catch (error) {
      console.error("Error connecting integration:", error);
      alert("Failed to connect integration. Please try again.");
    }
  }, [fetchData]);

  const handleDisconnectIntegration = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to disconnect this integration?")) return;
    try {
      const response = await fetch(`/api/integrations/${id}/disconnect`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to disconnect integration");
      await fetchData();
      alert("Integration disconnected!");
    } catch (error) {
      console.error("Error disconnecting integration:", error);
      alert("Failed to disconnect integration. Please try again.");
    }
  }, [fetchData]);

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
      alert("Failed to set active provider. Please try again.");
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
      alert("API key saved!");
    } catch (error) {
      console.error("Error saving API key:", error);
      alert("Failed to save API key. Please try again.");
    }
  }, [fetchData]);

  const handleTestAiConnection = useCallback(async () => {
    if (!aiSettings?.activeProviderId) {
      alert("Please select an active provider first.");
      return;
    }
    try {
      const response = await fetch(`/api/ai/providers/${aiSettings.activeProviderId}/test`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to test AI connection");
      const data = await response.json();
      if (data.success) {
        alert("Connection test successful!");
      } else {
        alert(`Connection test failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error testing AI connection:", error);
      alert("Failed to test AI connection. Please try again.");
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
      />
    </div>
  );
}


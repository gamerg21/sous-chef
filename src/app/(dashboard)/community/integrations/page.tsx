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

  const handleConnectIntegration = useCallback(async (provider: string, data: any) => {
    try {
      const response = await fetch(`/api/integrations/${provider}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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

  const handleConfigureAiProvider = useCallback(async (providerId: string, config: any) => {
    try {
      const response = await fetch(`/api/ai/providers/${providerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error("Failed to configure AI provider");
      await fetchData();
      alert("AI provider configured!");
    } catch (error) {
      console.error("Error configuring AI provider:", error);
      alert("Failed to configure AI provider. Please try again.");
    }
  }, [fetchData]);

  const handleTestAiProvider = useCallback(async (providerId: string, apiKey: string) => {
    try {
      const response = await fetch(`/api/ai/providers/${providerId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!response.ok) throw new Error("Failed to test AI provider");
      const data = await response.json();
      if (data.success) {
        alert("Connection test successful!");
      } else {
        alert(`Connection test failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error testing AI provider:", error);
      alert("Failed to test AI provider. Please try again.");
    }
  }, []);

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
        aiSettings={aiSettings || { keyMode: "bring-your-own", providers: [] }}
        onConnectIntegration={handleConnectIntegration}
        onDisconnectIntegration={handleDisconnectIntegration}
        onConfigureAiProvider={handleConfigureAiProvider}
        onTestAiProvider={handleTestAiProvider}
      />
    </div>
  );
}


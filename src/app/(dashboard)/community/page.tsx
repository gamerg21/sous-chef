"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CommunityHubView } from "@/components/community";
import type {
  CommunityRecipeListing,
} from "@/components/community/types";
import { AlertModal } from "@/components/ui/alert-modal";

export default function CommunityPage() {
  const router = useRouter();
  const [featuredRecipes, setFeaturedRecipes] = useState<CommunityRecipeListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; variant?: 'success' | 'error' | 'info' | 'warning' }>({ isOpen: false, message: '', variant: 'error' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch featured recipes (public recipes, sorted by saves)
      const recipesResponse = await fetch("/api/community/recipes?limit=6&sort=popular");
      if (recipesResponse.ok) {
        const recipesData = await recipesResponse.json();
        const transformed = recipesData.recipes.map((r: {
          id: string;
          title: string;
          author: { name: string };
          description?: string;
          tags?: string[];
          totalTimeMinutes?: number;
          savedCount?: number;
        }) => ({
          id: r.id,
          title: r.title,
          authorName: r.author.name,
          description: r.description,
          tags: r.tags,
          totalTimeMinutes: r.totalTimeMinutes,
          saves: r.savedCount || 0,
        }));
        setFeaturedRecipes(transformed);
      }
    } catch (error) {
      console.error("Error fetching community data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleOpenRecipe = useCallback((id: string) => {
    router.push(`/community/recipes/${id}`);
  }, [router]);

  const handleSaveRecipe = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/community/recipes/${id}/save`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to save recipe");
      setAlertModal({ isOpen: true, message: "Recipe saved to your library!", variant: 'success' });
    } catch (error) {
      console.error("Error saving recipe:", error);
      setAlertModal({ isOpen: true, message: "Failed to save recipe. Please try again.", variant: 'error' });
    }
  }, []);

  const handlePublishRecipe = useCallback(() => {
    router.push("/community/publish");
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-stone-600 dark:text-stone-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <CommunityHubView
        title="Community"
        description="Discover and share recipes with the community."
        showFeaturedRecipes={true}
        showMarketplace={false}
        categories={[]}
        featuredRecipes={featuredRecipes}
        extensions={[]}
        installedExtensions={[]}
        onOpenRecipe={handleOpenRecipe}
        onSaveRecipe={handleSaveRecipe}
        onPublishRecipe={handlePublishRecipe}
      />
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, message: '', variant: 'error' })}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
}

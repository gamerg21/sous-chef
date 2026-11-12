import { CommunityRecipeDetailView } from "@/components/community/CommunityRecipeDetailView";

export default async function CommunityRecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CommunityRecipeDetailView id={id} />;
}

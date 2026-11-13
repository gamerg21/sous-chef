import { CookProfileView } from "@/components/community/CookProfileView";

export default async function CommunityCookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CookProfileView id={id} />;
}

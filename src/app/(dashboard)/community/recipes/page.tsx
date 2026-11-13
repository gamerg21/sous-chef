import { Suspense } from "react";
import { CommunityRecipeFeedView } from "@/components/community/CommunityRecipeFeedView";
import { PageLoader } from "@/components/ui/page-loader";

export default function CommunityRecipesPage() {
  // The feed keeps its filters in the URL, which it reads on the client.
  return (
    <Suspense fallback={<PageLoader />}>
      <CommunityRecipeFeedView />
    </Suspense>
  );
}

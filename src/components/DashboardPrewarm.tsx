"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueries, type RequestForQueries } from "convex/react";
import { api } from "../../convex/_generated/api";

const STAGE_ONE_DELAY_MS = 900;
const STAGE_TWO_DELAY_MS = 2200;

function scheduleIdle(callback: () => void, timeout: number): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const idleWindow = window as Window &
    typeof globalThis & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

  if (
    typeof idleWindow.requestIdleCallback === "function" &&
    typeof idleWindow.cancelIdleCallback === "function"
  ) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, timeout);
  return () => window.clearTimeout(handle);
}

export function DashboardPrewarm({
  enabled,
  routes,
}: {
  enabled: boolean;
  routes: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [routeWarmupReady, setRouteWarmupReady] = useState(false);
  const [dataWarmupStage, setDataWarmupStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const cancelRouteWarmup = scheduleIdle(() => {
      setRouteWarmupReady(true);
    }, 250);

    const cancelStageOne = scheduleIdle(() => {
      setDataWarmupStage(1);
    }, STAGE_ONE_DELAY_MS);

    const cancelStageTwo = scheduleIdle(() => {
      setDataWarmupStage(2);
    }, STAGE_TWO_DELAY_MS);

    return () => {
      cancelRouteWarmup();
      cancelStageOne();
      cancelStageTwo();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !routeWarmupReady) {
      return;
    }

    const targets = routes.filter(
      (href) => pathname !== href && !pathname.startsWith(`${href}/`),
    );

    if (targets.length === 0) {
      return;
    }

    let cancelled = false;
    let cancelPending = () => {};
    let index = 0;

    const prefetchNext = () => {
      if (cancelled || index >= targets.length) {
        return;
      }

      router.prefetch(targets[index]);
      index += 1;

      if (index < targets.length) {
        cancelPending = scheduleIdle(prefetchNext, 1200);
      }
    };

    prefetchNext();

    return () => {
      cancelled = true;
      cancelPending();
    };
  }, [enabled, pathname, routeWarmupReady, router, routes]);

  const prewarmQueries = useMemo<RequestForQueries>(() => {
    if (!enabled || dataWarmupStage === 0) {
      return {};
    }

    const queries: RequestForQueries = {};
    const onInventoryPage = pathname === "/inventory";
    const onRecipesPage = pathname === "/recipes" || pathname.startsWith("/recipes/");
    const onCookingPage = pathname === "/cooking";
    const onShoppingListPage = pathname === "/shopping-list";
    const onCommunityPage = pathname === "/community" || pathname.startsWith("/community/");
    const onExtensionsPage = pathname === "/extensions" || pathname.startsWith("/extensions/");

    if (!onInventoryPage) {
      queries.inventory = { query: api.inventory.list, args: {} };
      queries.preferences = { query: api.preferences.get, args: {} };
    }

    if (!onRecipesPage) {
      queries.recipes = { query: api.recipes.list, args: {} };
    }

    if (!onCookingPage) {
      queries.cooking = { query: api.cooking.whatCanICook, args: {} };
    }

    if (!onShoppingListPage) {
      queries.shoppingList = { query: api.shoppingList.get, args: {} };
    }

    if (dataWarmupStage >= 2) {
      if (!onCommunityPage) {
        queries.community = {
          query: api.community.listRecipes,
          args: { limit: 6, sort: "popular" },
        };
      }

      if (!onExtensionsPage) {
        queries.extensions = { query: api.extensions.list, args: {} };
      }
    }

    return queries;
  }, [enabled, dataWarmupStage, pathname]);

  useQueries(prewarmQueries);

  return null;
}

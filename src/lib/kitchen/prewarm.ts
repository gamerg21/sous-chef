'use client';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Ref } from '../../server/kitchen/_generated/server';
import { api } from './api';
import { request, useKitchenAuth } from './client';

// The first queries each main page renders. Keys must match the page's useQuery
// arguments exactly so the page mounts with data already in the cache. Community
// is left out: it depends on an optional remote service whose errors would be cached.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const routeQueries: Record<string, Array<[Ref<any, any>, unknown]>> = {
  '/inventory': [[api.inventory.list, {}], [api.preferences.get, {}]],
  '/recipes': [[api.recipes.list, {}], [api.inventory.list, {}]],
  '/cooking': [[api.cooking.whatCanICook, {}], [api.shoppingList.get, {}]],
  '/shopping-list': [[api.shoppingList.get, {}], [api.shoppingList.storageLocations, {}]],
};

/** Returns a function that loads a route's data into the cache ahead of navigation. */
export function usePrewarmRoute() {
  const client = useQueryClient();
  const { isAuthenticated } = useKitchenAuth();
  return useCallback((href: string) => {
    if (!isAuthenticated) return;
    const queries = routeQueries[href.split(/[?#]/)[0]];
    for (const [ref, args] of queries ?? []) {
      void client.prefetchQuery({ queryKey: ['kitchen', ref.path, args], queryFn: () => request(ref, args), staleTime: 15_000 });
    }
  }, [client, isAuthenticated]);
}

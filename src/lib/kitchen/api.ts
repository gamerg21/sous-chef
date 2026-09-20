import type { Endpoint, Ref } from '../../server/kitchen/_generated/server';
import type { modules } from '../../server/kitchen/registry';
type References<M> = { [K in keyof M as M[K] extends Endpoint<any, any, 'public'> ? K : never]: M[K] extends Endpoint<infer A, infer R> ? Ref<A, R> : never };
export type KitchenApi = { [K in keyof typeof modules]: References<typeof modules[K]> };
function references(): unknown { return new Proxy({}, {get: (_, module: string) => new Proxy({}, {get: (_, name: string) => ({path: `${module}:${name}`})})}); }
export const api = references() as KitchenApi;
export const internal = references() as { [K in keyof typeof modules]: { [F in keyof typeof modules[K]]: typeof modules[K][F] extends Endpoint<infer A, infer R> ? Ref<A, R> : never } };

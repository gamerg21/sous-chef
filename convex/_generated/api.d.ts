/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as aiProviders from "../aiProviders.js";
import type * as auth from "../auth.js";
import type * as authRepair from "../authRepair.js";
import type * as community from "../community.js";
import type * as cooking from "../cooking.js";
import type * as extensions from "../extensions.js";
import type * as helpers from "../helpers.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as inventory from "../inventory.js";
import type * as preferences from "../preferences.js";
import type * as recipes from "../recipes.js";
import type * as shoppingList from "../shoppingList.js";
import type * as storage from "../storage.js";
import type * as units from "../units.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  aiProviders: typeof aiProviders;
  auth: typeof auth;
  authRepair: typeof authRepair;
  community: typeof community;
  cooking: typeof cooking;
  extensions: typeof extensions;
  helpers: typeof helpers;
  households: typeof households;
  http: typeof http;
  integrations: typeof integrations;
  inventory: typeof inventory;
  preferences: typeof preferences;
  recipes: typeof recipes;
  shoppingList: typeof shoppingList;
  storage: typeof storage;
  units: typeof units;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

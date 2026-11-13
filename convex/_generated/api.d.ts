/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apple from "../apple.js";
import type * as appleAuth from "../appleAuth.js";
import type * as appleHttp from "../appleHttp.js";
import type * as auth from "../auth.js";
import type * as community from "../community.js";
import type * as communityHttp from "../communityHttp.js";
import type * as crons from "../crons.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as httpUtil from "../httpUtil.js";
import type * as hub from "../hub.js";
import type * as hubHttp from "../hubHttp.js";
import type * as hubLib from "../hubLib.js";
import type * as migrations from "../migrations.js";
import type * as moderation from "../moderation.js";
import type * as rateLimit from "../rateLimit.js";
import type * as reports from "../reports.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apple: typeof apple;
  appleAuth: typeof appleAuth;
  appleHttp: typeof appleHttp;
  auth: typeof auth;
  community: typeof community;
  communityHttp: typeof communityHttp;
  crons: typeof crons;
  helpers: typeof helpers;
  http: typeof http;
  httpUtil: typeof httpUtil;
  hub: typeof hub;
  hubHttp: typeof hubHttp;
  hubLib: typeof hubLib;
  migrations: typeof migrations;
  moderation: typeof moderation;
  rateLimit: typeof rateLimit;
  reports: typeof reports;
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

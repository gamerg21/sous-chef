import { kitchenTest } from "./harness";
import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { api } from "../../src/lib/kitchen/api";




function newTest() {
  return kitchenTest();
}

async function createUserWithHousehold(t: ReturnType<typeof newTest>, name: string) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name,
      email: `${name.toLowerCase()}@example.com`,
    });
    const householdId = await ctx.db.insert("households", { name: `${name}'s Kitchen` });
    await ctx.db.insert("householdMembers", { userId, householdId, role: "owner" });
    return { userId, householdId };
  });
  return { ...ids, asUser: t.withIdentity({ subject: `${ids.userId}|test-session` }) };
}

async function createListing(t: ReturnType<typeof newTest>) {
  return await t.run(async (ctx) =>
    ctx.db.insert("extensionListings", {
      name: "Grocery Sync",
      description: "Planned grocery delivery connection",
      category: "Grocery",
      authorName: "Sous Chef",
      pricing: "free",
      installs: 0,
      enabled: true,
      permissions: ["Read shopping list"],
    }),
  );
}

describe("extension catalog preview", () => {
  test("listings are readable but cannot be installed", async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, "Alice");
    const listingId = await createListing(t);

    const listed = await alice.asUser.query(api.extensions.list, {});
    expect(listed.extensions.map((e) => e.id)).toEqual([listingId]);

    await expect(
      alice.asUser.mutation(api.extensions.install, { extensionId: listingId }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ConvexError && /cannot be installed yet/i.test(String(error.data)),
    );

    const detail = await alice.asUser.query(api.extensions.getById, { id: listingId });
    expect(detail.isInstalled).toBe(false);
    const installs = await t.run(async (ctx) => (await ctx.db.get(listingId))?.installs);
    expect(installs).toBe(0);
  });

  test("a listing recorded earlier can be removed from the kitchen", async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, "Alice");
    const mallory = await createUserWithHousehold(t, "Mallory");
    const listingId = await createListing(t);
    await t.run(async (ctx) => {
      await ctx.db.insert("installedExtensions", {
        extensionId: listingId,
        householdId: alice.householdId,
        enabled: true,
        needsConfiguration: false,
      });
    });

    await expect(
      mallory.asUser.mutation(api.extensions.uninstall, { extensionId: listingId }),
    ).rejects.toThrow(/not installed/i);

    const before = await alice.asUser.query(api.extensions.getById, { id: listingId });
    expect(before.isInstalled).toBe(true);
    await alice.asUser.mutation(api.extensions.uninstall, { extensionId: listingId });
    const after = await alice.asUser.query(api.extensions.getById, { id: listingId });
    expect(after.isInstalled).toBe(false);
  });
});

describe("third-party integrations", () => {
  test("connect is rejected while no provider adapter exists", async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, "Alice");
    const integrationId = await t.run(async (ctx) =>
      ctx.db.insert("integrations", {
        householdId: alice.householdId,
        provider: "grocery-demo",
        name: "Grocery Demo",
        description: "Placeholder row",
        status: "disconnected",
      }),
    );

    await expect(
      alice.asUser.action(api.integrations.connect, {
        integrationId,
        accessToken: "should-not-be-stored",
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof ConvexError && /not available yet/i.test(String(error.data)),
    );

    const row = await t.run(async (ctx) => ctx.db.get(integrationId));
    expect(row?.status).toBe("disconnected");
    expect(row?.accessToken).toBeUndefined();

    const listed = await alice.asUser.query(api.integrations.list, {});
    expect(listed.integrations[0]?.status).toBe("disconnected");
  });
});

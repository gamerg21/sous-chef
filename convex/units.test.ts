import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function newTest() {
  return convexTest(schema, modules);
}

type Tester = ReturnType<typeof newTest>;

async function createUser(t: Tester, name = "Cook") {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name,
      email: `${name.toLowerCase()}@example.com`,
    }),
  );
  return {
    userId,
    asUser: t.withIdentity({ subject: `${userId}|test-session` }),
  };
}

describe("units", () => {
  let t: Tester;

  beforeEach(async () => {
    t = newTest();
    await t.mutation(internal.units.seed, {});
  });

  test("seed is idempotent", async () => {
    const before = await t.run(async (ctx) => ({
      units: (await ctx.db.query("units").collect()).length,
      aliases: (await ctx.db.query("unitAliases").collect()).length,
    }));
    await t.mutation(internal.units.seed, {});
    const after = await t.run(async (ctx) => ({
      units: (await ctx.db.query("units").collect()).length,
      aliases: (await ctx.db.query("unitAliases").collect()).length,
    }));
    expect(after).toEqual(before);
  });

  test("search: 'tbsp' returns tablespoon first", async () => {
    const { asUser } = await createUser(t);
    const results = await asUser.query(api.units.search, { query: "tbsp" });
    expect(results[0]?.slug).toEqual("tablespoon");
  });

  test("search matches aliases case-insensitively", async () => {
    const { asUser } = await createUser(t);
    const ml = await asUser.query(api.units.search, { query: "ML" });
    expect(ml[0]?.slug).toEqual("milliliter");
    const lbs = await asUser.query(api.units.search, { query: "lbs" });
    expect(lbs[0]?.slug).toEqual("pound");
    const ea = await asUser.query(api.units.search, { query: "ea" });
    expect(ea[0]?.slug).toEqual("each");
  });

  test("suggest: ingredient profile drives suggestions (salt → tsp first)", async () => {
    const { asUser } = await createUser(t);
    const results = await asUser.query(api.units.suggest, {
      ingredientName: "salt",
    });
    expect(results[0]?.slug).toEqual("teaspoon");
    const slugs = results.map((r) => r.slug);
    expect(slugs).toContain("to-taste");
  });

  test("suggest: token matching ('red onion' → each first)", async () => {
    const { asUser } = await createUser(t);
    const results = await asUser.query(api.units.suggest, {
      ingredientName: "red onion",
    });
    expect(results[0]?.slug).toEqual("each");
  });

  test("suggest: falls back to global commons and de-dupes", async () => {
    const { asUser } = await createUser(t);
    const results = await asUser.query(api.units.suggest, {});
    expect(results.length).toBeGreaterThanOrEqual(5);
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toEqual(ids.length);
    expect(results.every((r) => r.label)).toBe(true);
  });

  test("trackUsage re-ranks future suggestions", async () => {
    const { asUser } = await createUser(t);
    const gallon = await t.run(async (ctx) =>
      ctx.db
        .query("units")
        .withIndex("by_slug", (q) => q.eq("slug", "gallon"))
        .unique(),
    );
    // "gallon" is not common, so it should not appear by default…
    const before = await asUser.query(api.units.suggest, {});
    expect(before.map((r) => r.slug)).not.toContain("gallon");

    await asUser.mutation(api.units.trackUsage, {
      unitId: gallon!._id as Id<"units">,
      ingredientName: "milk",
    });

    // …but it should after the user picks it once.
    const after = await asUser.query(api.units.suggest, {});
    expect(after.map((r) => r.slug)).toContain("gallon");

    // And it becomes the top pick for the same ingredient.
    const forMilk = await asUser.query(api.units.suggest, {
      ingredientName: "milk",
    });
    expect(forMilk[0]?.slug).toEqual("gallon");
  });

  test("listGrouped groups per spec headings", async () => {
    const { asUser } = await createUser(t);
    const groups = await asUser.query(api.units.listGrouped, {});
    const names = groups.map((g) => g.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "Countables",
        "Volume (US)",
        "Volume (Metric)",
        "Weight (US)",
        "Weight (Metric)",
        "Packages",
        "Qualitative",
      ]),
    );
    const qualitative = groups.find((g) => g.name === "Qualitative");
    expect(qualitative?.units.map((u) => u.name)).toContain("to taste");
  });
});

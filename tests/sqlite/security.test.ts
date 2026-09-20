import { kitchenTest } from "./harness";
import { describe, expect, test } from "vitest";
import { api, internal } from "../../src/lib/kitchen/api";
import { Id } from "../../src/server/kitchen/_generated/dataModel";




function newTest() {
  return kitchenTest();
}

type Tester = ReturnType<typeof newTest>;

/** Create a user with their own household and return ids + an identity. */
async function createUserWithHousehold(
  t: Tester,
  name: string,
  role: "owner" | "admin" | "member" = "owner",
) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name,
      email: `${name.toLowerCase()}@example.com`,
    });
    const householdId = await ctx.db.insert("households", {
      name: `${name}'s Kitchen`,
    });
    await ctx.db.insert("householdMembers", { userId, householdId, role });
    await ctx.db.insert("shoppingLists", { householdId });
    return { userId, householdId };
  });
  return {
    ...ids,
    asUser: t.withIdentity({ subject: `${ids.userId}|test-session` }),
  };
}

async function createRecipe(
  t: Tester,
  householdId: Id<"households">,
  visibility: string,
  title = "Test Recipe",
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("recipes", {
      householdId,
      title,
      visibility,
      favorited: false,
    }),
  );
}

describe("household data isolation", () => {
  test("inventory.list rejects a household the caller does not belong to", async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, "Alice");
    const mallory = await createUserWithHousehold(t, "Mallory");

    await expect(
      mallory.asUser.query(api.inventory.list, {
        householdId: alice.householdId,
      }),
    ).rejects.toThrow("Permission denied");
  });

  test("recipes.list rejects a household the caller does not belong to", async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, "Alice");
    const mallory = await createUserWithHousehold(t, "Mallory");

    await expect(
      mallory.asUser.query(api.recipes.list, {
        householdId: alice.householdId,
      }),
    ).rejects.toThrow("Permission denied");
  });

  test("shoppingList.get rejects a household the caller does not belong to", async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, "Alice");
    const mallory = await createUserWithHousehold(t, "Mallory");

    await expect(
      mallory.asUser.query(api.shoppingList.get, {
        householdId: alice.householdId,
      }),
    ).rejects.toThrow("Permission denied");
  });

  test("members can still list their own household explicitly", async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, "Alice");
    const result = await alice.asUser.query(api.inventory.list, {
      householdId: alice.householdId,
    });
    expect(result).toMatchObject({ items: [] });
  });
});

describe("storage authorization", () => {
  test("saveStorageId refuses to attach to a recipe in another household", async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, "Alice");
    const mallory = await createUserWithHousehold(t, "Mallory");
    const recipe = await createRecipe(t, alice.householdId, "private");

    const storageId = crypto.randomUUID() as Id<"_storage">;

    await expect(
      mallory.asUser.mutation(api.storage.saveStorageId, {
        storageId,
        recipeId: recipe,
      }),
    ).rejects.toThrow("Permission denied");
  });

  test("getUrl requires authentication", async () => {
    const t = newTest();
    const storageId = crypto.randomUUID() as Id<"_storage">;
    await expect(
      t.query(api.storage.getUrl, { storageId }),
    ).rejects.toThrow("Not authenticated");
  });
});

describe("household member roles", () => {
  test("an admin cannot demote the owner", async () => {
    const t = newTest();
    const owner = await createUserWithHousehold(t, "Owner");
    const admin = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Admin",
        email: "admin@example.com",
      });
      await ctx.db.insert("householdMembers", {
        userId,
        householdId: owner.householdId,
        role: "admin",
      });
      return userId;
    });
    const asAdmin = t.withIdentity({ subject: `${admin}|test-session` });

    await expect(
      asAdmin.mutation(api.households.updateMember, {
        householdId: owner.householdId,
        memberId: owner.userId,
        role: "member",
      }),
    ).rejects.toThrow("Transfer ownership");
  });

  test("ownership transfer demotes the previous owner to admin", async () => {
    const t = newTest();
    const owner = await createUserWithHousehold(t, "Owner");
    const member = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        name: "Member",
        email: "member@example.com",
      });
      await ctx.db.insert("householdMembers", {
        userId,
        householdId: owner.householdId,
        role: "member",
      });
      return userId;
    });

    await owner.asUser.mutation(api.households.updateMember, {
      householdId: owner.householdId,
      memberId: member,
      role: "owner",
    });

    const members = await t.run(async (ctx) =>
      ctx.db
        .query("householdMembers")
        .withIndex("by_householdId", (q) =>
          q.eq("householdId", owner.householdId),
        )
        .collect(),
    );
    const roles = new Map(members.map((m) => [m.userId, m.role]));
    expect(roles.get(member)).toEqual("owner");
    expect(roles.get(owner.userId)).toEqual("admin");
  });
});

describe("app admin guardrails", () => {
  test("the last admin cannot be removed", async () => {
    const t = newTest();
    const admin = await createUserWithHousehold(t, "Admin");
    await t.run(async (ctx) => {
      await ctx.db.insert("appAdmins", { userId: admin.userId });
    });

    await expect(
      admin.asUser.mutation(api.admin.updateUser, {
        userId: admin.userId,
        isAppAdmin: false,
      }),
    ).rejects.toThrow("Cannot remove the last admin");
  });

  test("deleteUser cleans up community likes, saves, and unit data", async () => {
    const t = newTest();
    const admin = await createUserWithHousehold(t, "Admin");
    const victim = await createUserWithHousehold(t, "Victim");
    const recipe = await createRecipe(t, admin.householdId, "public");

    await t.run(async (ctx) => {
      await ctx.db.insert("appAdmins", { userId: admin.userId });
      await ctx.db.insert("communityRecipeLikes", {
        recipeId: recipe,
        userId: victim.userId,
      });
      await ctx.db.insert("communityRecipeSaves", {
        recipeId: recipe,
        userId: victim.userId,
      });
    });

    await admin.asUser.mutation(api.admin.deleteUser, {
      userId: victim.userId,
    });

    const leftovers = await t.run(async (ctx) => {
      const likes = await ctx.db
        .query("communityRecipeLikes")
        .withIndex("by_userId", (q) => q.eq("userId", victim.userId))
        .collect();
      const saves = await ctx.db
        .query("communityRecipeSaves")
        .withIndex("by_userId", (q) => q.eq("userId", victim.userId))
        .collect();
      const user = await ctx.db.get(victim.userId);
      return { likes, saves, user };
    });
    expect(leftovers.user).toBeNull();
    expect(leftovers.likes).toHaveLength(0);
    expect(leftovers.saves).toHaveLength(0);
  });
});

describe("auth rate limiting", () => {
  test("checkAndRecord blocks after the window budget is spent", async () => {
    const t = newTest();
    const opts = {
      scope: "test-scope",
      subject: "user@example.com",
      windowMs: 60_000,
      max: 3,
    };
    for (let i = 0; i < 3; i++) {
      const { allowed } = await t.mutation(
        internal.rateLimit.checkAndRecord,
        opts,
      );
      expect(allowed).toBe(true);
    }
    const { allowed } = await t.mutation(
      internal.rateLimit.checkAndRecord,
      opts,
    );
    expect(allowed).toBe(false);
  });

  test("different subjects do not share a budget", async () => {
    const t = newTest();
    const base = { scope: "test-scope", windowMs: 60_000, max: 1 };
    await t.mutation(internal.rateLimit.checkAndRecord, {
      ...base,
      subject: "a@example.com",
    });
    const { allowed } = await t.mutation(internal.rateLimit.checkAndRecord, {
      ...base,
      subject: "b@example.com",
    });
    expect(allowed).toBe(true);
  });
});

describe('active household selection', () => {
  test('switches default data scope and rejects non-members', async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, 'Alice');
    const bob = await createUserWithHousehold(t, 'Bob');
    await t.run(async ctx => {
      await ctx.db.insert('householdMembers', { userId: alice.userId, householdId: bob.householdId, role: 'member' });
    });
    await bob.asUser.mutation(api.shoppingList.addItem, { name: 'Bob kitchen rice', quantity: 1 });
    expect((await alice.asUser.query(api.shoppingList.get, {})).items).toHaveLength(0);
    await alice.asUser.mutation(api.households.select, { householdId: bob.householdId });
    expect((await alice.asUser.query(api.shoppingList.get, {})).items[0].name).toBe('Bob kitchen rice');
    expect((await alice.asUser.query(api.households.list, {})).find(h => h.isCurrent)?.id).toBe(bob.householdId);
    await expect(bob.asUser.mutation(api.households.select, { householdId: alice.householdId })).rejects.toThrow('Permission denied');
    // Revoked membership must not keep granting access via a saved preference.
    await t.run(async ctx => {
      const member = await ctx.db.query('householdMembers').withIndex('by_userId_and_householdId', q => q.eq('userId', alice.userId).eq('householdId', bob.householdId)).unique();
      await ctx.db.delete(member!._id);
    });
    expect((await alice.asUser.query(api.shoppingList.get, {})).items).toHaveLength(0);
  });
  test('first-run kitchen bootstrap is repeatable and creates the essentials once', async () => {
    const t = newTest();
    const id = await t.run(ctx => ctx.db.insert('users', { name: 'New chef' }));
    const user = t.withIdentity({ subject: `${id}|test-session` });
    const first = await user.mutation(api.households.ensureHousehold, {});
    expect(await user.mutation(api.households.ensureHousehold, {})).toBe(first);
    expect(await user.query(api.households.list, {})).toHaveLength(1);
    expect((await user.query(api.inventory.list, {})).locations.map(l => l.name).sort()).toEqual(['Freezer', 'Fridge', 'Pantry']);
    await expect(user.mutation(api.shoppingList.addItem, { name: 'First grocery' })).resolves.toHaveProperty('id');
  });
});

describe('shopping edits and clearing', () => {
  test('rejects invalid quantities and supports clearing optional fields', async () => {
    const t = newTest();
    const chef = await createUserWithHousehold(t, 'Chef');
    await expect(chef.asUser.mutation(api.shoppingList.addItem, { name: ' ', quantity: 1 })).rejects.toThrow('Item name');
    await expect(chef.asUser.mutation(api.shoppingList.addItem, { name: 'Rice', quantity: -1 })).rejects.toThrow('Quantity');
    const item = await chef.asUser.mutation(api.shoppingList.addItem, { name: ' Rice ', quantity: 2, unit: 'kg' });
    await chef.asUser.mutation(api.shoppingList.updateItem, { id: item.id, quantity: null, unit: null });
    const saved = (await chef.asUser.query(api.shoppingList.get, {})).items[0];
    expect(saved.name).toBe('Rice');
    expect(saved.quantity).toBeUndefined();
    expect(saved.unit).toBeUndefined();
  });
  test('clear is atomic, membership scoped, and respects unchecked items', async () => {
    const t = newTest();
    const alice = await createUserWithHousehold(t, 'Alice');
    const bob = await createUserWithHousehold(t, 'Bob');
    const a = await alice.asUser.mutation(api.shoppingList.addItem, { name: 'Rice' });
    const keep = await alice.asUser.mutation(api.shoppingList.addItem, { name: 'Keep' });
    const b = await bob.asUser.mutation(api.shoppingList.addItem, { name: 'Private' });
    await alice.asUser.mutation(api.shoppingList.updateItem, { id: a.id, checked: true });
    await bob.asUser.mutation(api.shoppingList.updateItem, { id: b.id, checked: true });
    await expect(alice.asUser.mutation(api.shoppingList.clearChecked, { ids: [a.id, b.id] })).rejects.toThrow('Permission denied');
    expect((await alice.asUser.query(api.shoppingList.get, {})).items).toHaveLength(2);
    expect(await alice.asUser.mutation(api.shoppingList.clearChecked, { ids: [a.id, keep.id] })).toEqual({ removed: 1 });
    expect(await alice.asUser.mutation(api.shoppingList.clearChecked, { ids: [a.id] })).toEqual({ removed: 0 });
    expect((await alice.asUser.query(api.shoppingList.get, {})).items[0].name).toBe('Keep');
  });
});

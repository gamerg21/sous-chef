import { query } from "./_generated/server";
import { getAuthUserId } from "./helpers";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx); // Auth check
    const units = await ctx.db.query("units").collect();
    return units.map((u) => ({
      id: u._id,
      slug: u.slug,
      name: u.name,
      abbr: u.abbr,
      unitType: u.unitType,
      system: u.system,
      isCommon: u.isCommon,
      isEnabled: u.isEnabled,
      toBaseFactor: u.toBaseFactor,
    }));
  },
});

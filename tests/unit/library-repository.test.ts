import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { SupabaseLibraryRepository } from "../../lib/library/repository";

class OverviewQuery {
  readonly orders: Array<{
    column: string;
    options: { ascending?: boolean; nullsFirst?: boolean };
  }> = [];

  select() {
    return this;
  }

  eq() {
    return this;
  }

  order(
    column: string,
    options: { ascending?: boolean; nullsFirst?: boolean } = {},
  ) {
    this.orders.push({ column, options });
    return this;
  }

  async limit() {
    return { data: [], error: null, count: 0 };
  }
}

describe("SupabaseLibraryRepository", () => {
  it("shows the most recently active PSN titles before import-order ties", async () => {
    const query = new OverviewQuery();
    const client = { from: () => query } as unknown as SupabaseClient;
    const repository = new SupabaseLibraryRepository(client);

    const overview = await repository.getOverview("account-1", 12);

    expect(overview).toEqual({ totalCount: 0, games: [] });
    expect(query.orders).toEqual([
      {
        column: "psn_last_updated_at",
        options: { ascending: false, nullsFirst: false },
      },
      {
        column: "last_seen_at",
        options: { ascending: false },
      },
    ]);
  });
});

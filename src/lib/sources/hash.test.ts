import { describe, expect, it } from "vitest";

import { stableHash } from "@/lib/sources/hash";

describe("stableHash", () => {
  it("returns stable sha256 fingerprints", () => {
    expect(stableHash(["fred", "cpi", "2026-06-09"])).toBe(stableHash(["fred", "cpi", "2026-06-09"]));
    expect(stableHash(["fred", "cpi", "2026-06-09"])).toHaveLength(64);
    expect(stableHash(["fred", "cpi", "2026-06-09"])).not.toBe(stableHash(["fred", "jobs", "2026-06-09"]));
  });
});

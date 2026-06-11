import { describe, expect, it } from "vitest";

import { initialMigrationSql } from "@/db/migrations/initialSql";
import { splitSqlStatements } from "@/db/sql";

describe("splitSqlStatements", () => {
  it("extracts non-empty SQL statements from the initial migration", () => {
    const statements = splitSqlStatements(initialMigrationSql);

    expect(statements.length).toBeGreaterThan(10);
    expect(statements[0]).toContain("CREATE EXTENSION");
    expect(statements.some((statement) => statement.includes("CREATE TABLE IF NOT EXISTS watchlist_items"))).toBe(true);
  });
});

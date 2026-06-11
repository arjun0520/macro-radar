import "server-only";

import { neon } from "@neondatabase/serverless";

import { initialMigrationSql } from "@/db/migrations/initialSql";
import { splitSqlStatements } from "@/db/sql";

export async function runDatabaseMigrations() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = neon(databaseUrl);
  const statements = splitSqlStatements(initialMigrationSql);

  for (const statement of statements) {
    await client.query(statement);
  }

  return {
    statementCount: statements.length,
    migratedAt: new Date().toISOString()
  };
}

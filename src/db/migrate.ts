import "server-only";

import { neon } from "@neondatabase/serverless";

import { initialMigrationSql } from "@/db/migrations/initialSql";
import { splitSqlStatements } from "@/db/sql";

let migrationPromise: Promise<Awaited<ReturnType<typeof runDatabaseMigrations>>> | null = null;

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

export async function ensureDatabaseMigrated() {
  if (process.env.AUTO_RUN_MIGRATIONS === "false") return null;

  migrationPromise ??= runDatabaseMigrations().catch((error) => {
    migrationPromise = null;
    throw error;
  });

  return migrationPromise;
}

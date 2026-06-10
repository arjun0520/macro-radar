import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { neon } from "@neondatabase/serverless";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sql = await readFile(join(root, "src/db/migrations/0000_initial.sql"), "utf-8");
const client = neon(process.env.DATABASE_URL);
await client(sql);
console.log("Macro Radar database schema is up to date.");

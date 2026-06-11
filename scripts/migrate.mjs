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
const statements = splitSqlStatements(sql);

for (const statement of statements) {
  await client.query(statement);
}

console.log(`Macro Radar database schema is up to date. Executed ${statements.length} statements.`);

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = "";
  let dollarQuote = null;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const rest = sqlText.slice(index);
    const dollarMatch = rest.match(/^\$[A-Za-z0-9_]*\$/);

    if (dollarMatch) {
      const tag = dollarMatch[0];
      current += tag;
      index += tag.length - 1;
      dollarQuote = dollarQuote === tag ? null : dollarQuote ?? tag;
      continue;
    }

    if (char === ";" && dollarQuote === null) {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      continue;
    }

    current += char;
  }

  const finalStatement = current.trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let dollarQuote: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const rest = sql.slice(index);
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

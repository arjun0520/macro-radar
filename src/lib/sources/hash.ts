import { createHash } from "node:crypto";

export function stableHash(parts: Array<string | null | undefined>): string {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "").join("\n"))
    .digest("hex");
}

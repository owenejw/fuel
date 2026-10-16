import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The habits section is separate and data flows one way: habits may read nutrition tables, but nutrition code
 * never reads habit tables, and habits code never writes nutrition tables. ESLint guards the imports; this
 * guards the SQL.
 */
const SRC = path.join(__dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const isHabits = (p: string) => p.split(path.sep).includes("habits");
const all = files(SRC);

describe("habits boundary", () => {
  it("keeps habit tables out of nutrition code", () => {
    const sqlish = /(from|into|update|join)\s+(habits|habit_\w+)\b/i;
    for (const f of all.filter((p) => !isHabits(p))) {
      const text = readFileSync(f, "utf8");
      expect(sqlish.test(text), `${path.relative(SRC, f)} queries a habits table`).toBe(false);
    }
  });

  it("only writes habit tables from habits code", () => {
    const write = /\b(insert\s+into|update|delete\s+from)\s+(\w+)/gi;
    for (const f of all.filter((p) => isHabits(p) && p.includes(`${path.sep}server${path.sep}`))) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(write)) {
        // "update … set" and "on conflict … do update set" both match; only table names matter.
        const table = m[2].toLowerCase();
        if (table === "set") continue;
        expect(table.startsWith("habit"), `${path.relative(SRC, f)} writes ${table}`).toBe(true);
      }
    }
  });

  it("has nutrition pages that never mention the habits section's code", () => {
    for (const f of all.filter((p) => p.includes(`${path.sep}(app)${path.sep}`))) {
      const text = readFileSync(f, "utf8");
      expect(/from ["'][^"']*habits/.test(text), path.relative(SRC, f)).toBe(false);
    }
  });
});

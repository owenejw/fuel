/**
 * Database food names are written for completeness, not reading: "Banana, cavendish, peeled, raw",
 * "Cereals ready-to-eat, GENERAL MILLS, CHEERIOS". `prettyName` gives a short title plus the rest as detail;
 * the full original is still shown smaller underneath.
 */

// Words that describe preparation or state rather than what the food is.
const PREP =
  /^(raw|cooked|boiled|baked|grilled|fried|deep[- ]fried|pan[- ]fried|roasted|steamed|microwaved|poached|stewed|braised|scrambled|toasted|dried|fresh|frozen|canned|drained|undrained|peeled|unpeeled|skin on|skin off|without skin|with skin|lean|fat trimmed|untrimmed|separable lean|commercial|homemade|home made|prepared|unprepared|ready[- ]to[- ]eat|plain|regular|with added .+|no added .+|added .+|from .+|all varieties|not further defined|nfs|purchased .+|flesh|whole|edible portion)$/i;

const SMALL = new Set(["and", "or", "with", "in", "of", "on", "a", "the", "to", "for"]);

function tidyCase(s: string) {
  // ALL CAPS chunks (common in USDA/branded data) become Title Case; mixed case is left alone.
  if (s !== s.toUpperCase() || !/[A-Z]{3}/.test(s)) return s;
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const capitalise = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function prettyName(raw: string, brand?: string | null): { title: string; detail: string | null; full: string } {
  const full = raw.trim();
  // "Name (Brand)" as we store branded foods: keep the brand as detail.
  const brandMatch = /^(.*)\s\(([^()]+)\)$/.exec(full);
  const base = brandMatch ? brandMatch[1] : full;
  const brandText = brand ?? (brandMatch ? brandMatch[2] : null);

  const parts = base
    .split(/,\s*/)
    .map((p) => tidyCase(p.trim()))
    .filter(Boolean);
  if (parts.length <= 1) {
    const title = capitalise(parts[0] ?? full);
    return { title, detail: brandText, full };
  }

  // USDA: "Cereals ready-to-eat, General Mills, Cheerios" → the last part is the product.
  const allCapsTail = /^[A-Z0-9 '&.-]{4,}$/.test(base.split(/,\s*/).at(-1)!.trim());
  if (allCapsTail && parts.length >= 3) {
    const title = parts.at(-1)!;
    return { title, detail: [brandText ?? parts.at(-2), parts[0]].filter(Boolean).join(" · "), full };
  }

  const [head, ...rest] = parts;
  const variety = rest.find((p) => !PREP.test(p));
  const title = capitalise(variety && rest.indexOf(variety) === 0 ? `${head} (${variety.toLowerCase()})` : head);
  const remaining = rest.filter((p) => !(variety && rest.indexOf(variety) === 0 && p === variety));
  const detail = [remaining.join(", ").toLowerCase(), brandText].filter(Boolean).join(" · ") || null;
  return { title, detail: detail ? capitalise(detail) : null, full };
}

import { prettyName } from "@/lib/food-names";
import { cx } from "./ui";

/** A food's readable name, with the detail (or the full database name) small underneath. */
export function FoodName({ name, brand, full, className }: { name: string; brand?: string | null; full?: boolean; className?: string }) {
  const p = prettyName(name, brand);
  const sub = full ? (p.full !== p.title ? p.full : p.detail) : p.detail;
  return (
    <span className={cx("block min-w-0", className)}>
      <span className="block truncate">{p.title}</span>
      {sub && <span className="text-muted block truncate text-xs font-normal">{sub}</span>}
    </span>
  );
}

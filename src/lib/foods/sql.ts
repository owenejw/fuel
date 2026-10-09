import { NUTRIENT_KEYS } from "../nutrients";

const COLS = ["source", "source_id", "barcode", "name", "brand", "serve_size_g", "serve_label", ...NUTRIENT_KEYS];

/** Upsert public-source rows ($1 = jsonb array) into reference_foods. Shared by the app and the AFCD seed script. */
export const UPSERT_REFERENCE_FOODS = `
  insert into reference_foods (${COLS.join(", ")}, fetched_at)
  select ${COLS.map((c) => `x.${c}`).join(", ")}, now()
  from jsonb_populate_recordset(null::reference_foods, $1::jsonb) as x
  on conflict (source, source_id) do update set
    ${COLS.filter((c) => c !== "source" && c !== "source_id")
      .map((c) => `${c} = excluded.${c}`)
      .join(", ")},
    fetched_at = now()
  returning *`;

/** Word-by-word match on name/brand; works for reference_foods and custom_foods. */
export function wordMatch(alias: string, param: string) {
  return `(select bool_and(${alias}.name ilike '%' || w || '%' or coalesce(${alias}.brand, '') ilike '%' || w || '%')
           from unnest(regexp_split_to_array(trim(${param}), '\\s+')) as w where w <> '')`;
}

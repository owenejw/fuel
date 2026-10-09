/**
 * postgres.js type overrides, shared by the app and scripts so real Postgres
 * behaves like local PGlite:
 * - dates/times/timestamps stay plain strings
 * - numeric comes back as a number
 * - JSON parameters we've already serialised (via `json()`) are sent as-is
 *   instead of being JSON-encoded a second time
 */
const DATE_OIDS = [1082, 1083, 1114, 1184];
const NUMERIC_OID = 1700;

export const POSTGRES_TYPES = {
  dates: { to: 1082, from: DATE_OIDS, serialize: (x: string) => x, parse: (x: string) => x },
  numeric: { to: 0, from: [NUMERIC_OID], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
  json: {
    to: 114,
    from: [114, 3802],
    serialize: (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)),
    parse: (x: string) => JSON.parse(x),
  },
};

export const PGLITE_PARSERS = {
  ...Object.fromEntries(DATE_OIDS.map((o) => [o, (x: string) => x])),
  [NUMERIC_OID]: (x: string) => Number(x),
};

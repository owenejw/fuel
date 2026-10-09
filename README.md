# Fuel: a household nutrition tracker

Fuel is a mobile-first PWA for logging food, kilojoules, macros and micronutrients, with training-aware targets and workout fuelling. It's built for a few people sharing one household (Jez, Levi and Owen to start) and set up for Australia: kJ by default, AFCD data and Australian NRVs.

There is **no sign-in**. Each device picks a profile once ("Who's this?"), and a long-lived cookie remembers it. Anyone can switch profile from Settings. Data isn't private between household members. An optional household passcode can keep strangers who find the URL out.

**Stack:** Next.js 16 (App Router, server actions) · TypeScript · Tailwind v4 · Postgres (Neon in production, embedded PGlite locally) · Recharts · `@zxing/browser` · Claude API · Vercel.

## Features

| Area | What's there |
| --- | --- |
| **Logging** | Search (household foods and recipes → AFCD/cache → USDA fallback); camera barcode scan (→ Open Food Facts → USDA, with "create food" on a miss); log by grams or serves; meal slots; quick add; copy yesterday or a previous meal; saved meals; recipes (nutrition per serve); edit, delete, undo. Re-logging a frequent food takes 2 taps. |
| **Targets** | Mifflin-St Jeor BMR × activity factor; cut/maintain/recomp/bulk presets; protein 2.0 g/kg (1.6–2.2 slider); training-day vs rest-day targets (carbs flex, protein constant, weekly average on goal). Day type comes from the workouts table, with a manual override on Today. |
| **Trends** | Daily kJ and macro bars against each day's target, plus weekly averages. A micronutrient dashboard compares today and the 7-day average with NHMRC NRVs for your sex and age, and flags anything under 70 % all week. Weight logging with an EWMA trend (α = 0.1). Adaptive TDEE after 14+ days, shown next to the formula estimate, with "update my targets from this". Water tracking and a weekly summary. |
| **Plan** | Manual workouts, plus Google Calendar sync via the calendar's secret iCal address (keyword matching, recurring events). A fuelling timeline per workout: meal 2–3 h before, fast carbs 30–60 min before (hard sessions or > 60 min), carbs during sessions > 90 min, and protein + carbs within 2 h after. Race carb loading at 8 g/kg for the 2 days before. Grocery list. |
| **Suggestions** | A rule-based engine over your own last 60 days of foods and saved meals (see below). It also suggests 1–2 never-logged AFCD foods that close a flagged micronutrient gap. |
| **AI (optional, per profile)** | Claude suggestions, photo-of-plate logging (itemised estimate you edit before saving) and nutrition-panel reading for custom foods. Runs only on the server, and only when the profile turns it on. |
| **Other** | PWA: installable, offline copy of recent days and frequent foods. Web-push reminders for logging and pre-workout fuelling. CSV export of logs, weights and workouts. Dark mode. |

Unknown nutrients are stored as absent, shown as **"no data"**, and never counted as zero. Totals that include foods missing a value show `*` and a note.

---

## Working on it

Jez, Levi and Owen all contribute through pull requests. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup and the workflow. In short:

```bash
npm run setup     # install + load the AFCD food database into a local database
npm run dev       # http://localhost:3000
```

With no `DATABASE_URL`, the app uses an embedded Postgres (PGlite) stored in `.data/pglite`, and migrations run automatically. Stop `npm run dev` before running scripts that write to it (`seed:afcd`, `db:migrate`), because PGlite allows one process at a time.

### Environment variables

Locally, these go in `.env.local`, copied from `.env.example`. In production they go in Vercel → Project → Settings → Environment Variables.

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | Production and previews. Set automatically by the Neon integration. |
| `APP_PASSCODE` | Optional household passcode, asked once per device. **Recommended in production.** |
| `ALLOW_PREVIEW_MIGRATIONS` | Set to `1` for Preview only, once previews get their own Neon branch. |
| `USDA_API_KEY` | USDA fallback search. Free key: <https://fdc.nal.usda.gov/api-key-signup> |
| `OFF_USER_AGENT` | Open Food Facts asks for an identifying User-Agent, e.g. `Fuel/0.1 (you@example.com)`. |
| `ANTHROPIC_API_KEY` | AI features (server-side only). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push reminders. Generate keys with `npx web-push generate-vapid-keys`. |
| `CRON_SECRET` | Protects `/api/cron/reminders`. |
| `APP_TIMEZONE` | Defaults to `Australia/Sydney`. |

## Hosting and deploys (all free)

| Piece | Service | Notes |
| --- | --- | --- |
| Code, reviews, CI | GitHub (public repo) | `main` is protected. Each PR needs passing CI and one approval. |
| App | Vercel Hobby | Every PR gets a preview URL; merging to `main` deploys production. |
| Database | Neon free Postgres (via the Vercel Marketplace) | 0.5 GB. Sleeps when idle and wakes in about a second. Preview deployments can get their own database branch. |

On every Vercel build, `vercel.json` runs `npm run db:migrate:deploy` before `next build`:
- **Production** builds apply any new migration to the production database.
- **Preview** builds skip migrations unless `ALLOW_PREVIEW_MIGRATIONS=1` is set for the Preview environment. Only set it once previews use their own Neon branch, or a pull request could change the live database.

After the first production deploy, load the food database once:

```bash
DATABASE_URL="<Neon production connection string>" npm run seed:afcd
```

**Access model.** The browser never talks to the database. Pages call Next.js server actions, which read the device's `fuel_profile` cookie and query Postgres directly. Every table also has RLS enabled with no policies, and privileges are revoked from Supabase's `anon` and `authenticated` roles where those exist. That keeps the schema locked down if it's ever hosted on Supabase.

**Sharing.** Custom foods and recipes are shared by the household; they record who created them. Logs, weights, workouts, goals, water, saved meals, grocery lists and push subscriptions belong to one profile. Deleting a profile removes those rows, and shared foods stay.

## Food data

| Lookup | Order |
| --- | --- |
| Text search (debounced 300 ms) | Household custom foods and recipes → `reference_foods` cache (AFCD first) → **USDA FoodData Central** when fewer than 8 cached matches. USDA results are cached, so the next search is instant. |
| Barcode | Household custom foods → cache → **Open Food Facts v2** → USDA branded (GTIN) → offer "Create food" pre-filled with the barcode. |

The AFCD import reads the **All solids & liquids per 100 g** sheet of the Release 3 *Nutrient profiles* workbook and matches columns by name. Saturated fat comes from the grams column, not the "% of total fatty acids" column. If FSANZ changes the layout, the import stops with a clear error.

## How suggestions work

1. **Candidates:** foods and saved meals you logged in the last 60 days, with your last serving size and frequency.
2. **Score:** for each candidate, how much of a meal-sized share of each remaining protein, carb and fat gap one serve closes. Weights are the square of each gap's share of its target, so the proportionally largest gap dominates. Overshooting remaining kJ costs heavily; macro overshoot costs a little; frequency only breaks ties.
3. **Protein mode:** when protein is the largest gap and kJ are tight (< 25 % of the target or < 1,500 kJ left), candidates rank by **protein per 100 kJ**.
4. **Time of day:** a food is only suggested if at least 20 % of its history is in meal slots that fit the time. So no dinner foods at 7 am.
5. **Fuelling windows:** before a session, carbs get extra weight, and fat, fibre and low-carb foods are penalised. After a session, protein and carbs are favoured.
6. The top 5 are shown with what would be left if you ate them. 1–2 never-logged AFCD foods are added when a micronutrient is flagged for the week.

## Reminders (web push)

On iPhone, add Fuel to the Home Screen first (iOS 16.4+), then turn reminders on in Settings. A scheduler must call `GET /api/cron/reminders` with `Authorization: Bearer $CRON_SECRET` about every 15 minutes. Vercel Hobby crons run only once a day, so either use Vercel Pro (`crons` in `vercel.ts`) or a free external scheduler such as cron-job.org or a GitHub Actions schedule.

## Tests

```bash
npm test          # everything (no external services needed)
npm run test:db   # schema + access tests on an in-process Postgres
```

* `tests/db` applies the real migrations to PGlite with Supabase's `anon` and `authenticated` roles. It checks that those roles can't read or delete anything in any table, that RLS is on everywhere, that profile data is scoped and cascades on delete while shared foods survive, and that migrations re-run cleanly.
* `tests/unit` covers TDEE, macro targets, carb loading, the EWMA weight trend, adaptive TDEE, recommendation scoring, the fuelling timeline, calendar event classification, NRVs and micronutrient flags, the OFF, USDA and AFCD parsers, and nutrient arithmetic.

## Layout

```
src/
  app/
    (app)/            Today, Log (+ new-food, recipe, photo), Trends, Plan, Settings
    profiles/         "Who's this?" picker
    onboarding/       profile details
    unlock/           optional passcode
    api/              foods/search, foods/barcode/[code], export, cron/reminders
  components/         UI, sheets, scanner, charts, cards
  lib/                pure logic: nutrients, tdee, weight, nrv, recommend, fuelling, calendar, parsers
  server/             db (Postgres/PGlite), session cookie, repo, suggestions, calendar sync, reminders
    actions/          server actions called from the UI
  proxy.ts            passcode gate + profile redirect
supabase/migrations/  schema
scripts/              db:migrate, seed:afcd, icons
tests/                unit + db
```

**Later: Capacitor + HealthKit.** The UI is client-rendered and all data flows through server actions. A Capacitor shell can wrap the deployed site and feed HealthKit workouts and weights through the existing `workouts.source = 'healthkit'` and `weights` tables.

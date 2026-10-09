# Fuel: a private nutrition tracker

A mobile-first PWA for logging food, kilojoules, macros and micronutrients. It is built for Australia: kJ by default, AFCD data and Australian NRVs. It supports any number of invite-only accounts. Each account's data is private and enforced by Postgres Row Level Security.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase (auth, Postgres, RLS) · Vercel · `@zxing/browser` for barcodes · Recharts (from Phase 3).

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Auth and invites, profile, food search (custom → cache → USDA), barcode scan (→ Open Food Facts), log by grams or serves, daily log by meal slot, quick add, copy yesterday or a previous meal, saved meals, edit/delete, PWA shell | ✅ |
| 2 | TDEE (Mifflin-St Jeor), goal presets, training and rest-day targets | — |
| 3 | Weekly trends, micronutrient dashboard vs NRVs, weight trend (EWMA), adaptive TDEE, water | — |
| 4 | Recommendation engine, workouts, fuelling timeline, Google Calendar sync | — |
| 5 | Claude API layer, photo logging, panel OCR, grocery list, weekly summary, push, CSV export | — |

---

## Local setup

Requirements: Node 22+ and a Supabase project. The free tier is fine; pick the Sydney region (`ap-southeast-2`).

```bash
npm install
cp .env.example .env.local   # then fill it in (see below)
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Where it's used | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | The publishable key (or the legacy `anon` key via `NEXT_PUBLIC_SUPABASE_ANON_KEY`) |
| `SUPABASE_SECRET_KEY` | **server only** | The secret / `service_role` key. Used only to write the shared reference cache, manage invites and delete accounts. |
| `ADMIN_EMAILS` | server | Comma-separated emails that can open `/admin` to create invite codes |
| `USDA_API_KEY` | server | Free key from <https://fdc.nal.usda.gov/api-key-signup>. Without it, the USDA fallback is skipped. |
| `OFF_USER_AGENT` | server | Open Food Facts asks for an identifying User-Agent, e.g. `Fuel/0.1 (you@example.com)` |
| `ANTHROPIC_API_KEY` | server | Optional, Phase 5. |

### Supabase configuration

1. **Create the schema.** Open the SQL Editor, paste [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and run it. If you use the Supabase CLI, run `supabase link` and then `supabase db push`.
2. **Turn off public sign-ups.** Go to Authentication → Sign In / Providers. Keep **Email** enabled and turn off **Allow new users to sign up**. Accounts are then created only by the invite flow, which uses the server-side admin API.
3. **URLs.** Go to Authentication → URL Configuration and set the **Site URL** to your production URL. Add these **Redirect URLs**: `http://localhost:3000/**` and `https://<your-app>.vercel.app/**`.
4. **Email template.** Go to Authentication → Emails → **Magic Link** and replace the body so it contains both a code and a link:

   ```html
   <h2>Sign in to Fuel</h2>
   <p>Your sign-in code is <strong style="font-size:20px">{{ .Token }}</strong></p>
   <p>Or <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">tap here to sign in</a>.</p>
   ```

   **Why the code matters:** an app installed on the iOS home screen has its own cookie jar. A link tapped in Mail opens Safari, not the app, so the link alone can't sign the app in. Typing the code into the app always works. The link is for desktop or browser use, and the `/auth/confirm` route verifies the `token_hash` without needing a PKCE verifier.
5. **Email delivery.** Supabase's built-in mailer is heavily rate-limited. For more than one or two users, set up custom SMTP under Project Settings → Auth (for example Resend or Postmark).
6. **Create your own account.** Sign-ups need an invite, and invites need an admin. To bootstrap, go to Authentication → Users → **Add user** → *Create new user* and tick *Auto confirm*. Use the email you put in `ADMIN_EMAILS`, then sign in at `/login` with the emailed code.

### Import the AFCD (Australian Food Composition Database)

```bash
npm run seed:afcd                              # downloads AFCD Release 3 "Nutrient profiles" from FSANZ
npm run seed:afcd -- ./AFCD-Nutrient-profiles.xlsx   # or use a local copy
npm run seed:afcd -- --dry-run                 # parse and print a sample, no writes
```

The script reads the **All solids & liquids per 100 g** sheet (about 1,588 foods) and upserts it into `reference_foods` with `source = 'afcd'`, so re-running it is safe. Column headers are matched by name, and the script stops with a clear error if FSANZ changes the layout. Saturated fat comes from the grams column, not the "% of total fatty acids" column. Download page: <https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd/data-files>.

---

## How food lookup works

| Lookup | Order |
| --- | --- |
| **Text search** (`/api/foods/search`, debounced 300 ms) | 1. Your private custom foods → 2. the shared `reference_foods` cache (AFCD ranks first) → 3. **USDA FoodData Central** if the cache has fewer than 8 matches. USDA results are written into the cache so the next search is instant. |
| **Barcode** (`/api/foods/barcode/:code`) | 1. Your custom foods with that barcode → 2. the cache → 3. **Open Food Facts v2** → 4. USDA branded foods by GTIN → on a miss, offer "Create food" pre-filled with the barcode. |

All nutrients are nullable. A missing value is shown as **"no data"** and never as 0. Daily, meal and slot totals show a `*` and a note when some items lack data for a nutrient. Each log entry stores a snapshot of the nutrients for the amount eaten. History therefore stays stable if a custom food is edited or a cached source record is refreshed.

## Privacy model

* **Every user-owned table** (`profiles`, `custom_foods`, `recipes`, `meals_saved`, `log_entries`, `weights`, `workouts`, `goals`, `water_logs`) has RLS enabled with four policies for the `authenticated` role:

  ```sql
  for select using ((select auth.uid()) = user_id)
  for insert with check ((select auth.uid()) = user_id)
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)
  for delete using ((select auth.uid()) = user_id)
  ```

  The `anon` role has no table privileges at all.
* **Cross-user references are impossible.** `log_entries` references `custom_foods` and `recipes` through a composite `(id, user_id)` foreign key. You can't log, or probe for, another user's food.
* **`reference_foods`** holds only data copied from Open Food Facts, AFCD and USDA. It has **no user columns** and doesn't record who looked anything up. Any signed-in user can read it. Only the service role (server routes and the seed script) can write to it.
* **`invites`** has RLS with no policies, so only the service role can use it. Codes are claimed atomically by `claim_invite()`. The admin page doesn't show who redeemed a code.
* **Frequent foods, history and (later) recommendations** are computed only from the current user's own rows. RLS enforces this regardless of the client code.
* **Account deletion** (Settings → Delete account) calls `auth.admin.deleteUser`. Every user table has `ON DELETE CASCADE` to `auth.users`, so all of that user's rows go with it. The local offline cache is wiped too.
* The browser talks to Supabase directly with the user's JWT. Server routes use the secret key only for the reference cache, invites and account deletion.

## Offline / PWA

* `src/app/manifest.ts` plus icons in `public/icons` make the app installable: on iOS, use Share → Add to Home Screen.
* `public/sw.js` serves pages network-first with a cached fallback, and caches hashed build assets cache-first. It never caches API or Supabase responses.
* Today's log, recent days, frequent foods, targets and the profile are cached per user in `localStorage` under keys scoped to the user ID. The cache is cleared on sign-out. When offline, Today shows the saved copy. Logging new food needs a connection.
* The service worker registers only in production builds (`npm run build && npm start`).

## Tests

```bash
npm test                 # unit tests + RLS tests (no external services needed)
npm run test:rls         # just the RLS suite
npm run test:rls:live    # RLS against your real Supabase dev project (creates and deletes 2 temp users)
```

* `tests/db/rls.test.ts` applies the real migration to an in-process Postgres ([PGlite](https://pglite.dev)) with a small Supabase shim (`auth.uid()`, the `anon`, `authenticated` and `service_role` roles, default grants). For every user-owned table it checks that user B **cannot read, update, delete, reassign or forge** user A's rows, and that anonymous access is denied. It also checks cross-user foreign keys, `reference_foods` read-only access, invite secrecy and cascade deletion. It also fails if a new public table is added without RLS.
* `tests/integration/rls.supabase.test.ts` runs the same checks over the network against a live project. Use a dev project; it needs email + password sign-in enabled for the temporary users.
* `tests/unit/*` covers nutrient math (unknowns stay unknown), kJ/kcal conversion, the OFF, USDA and AFCD parsers, and frequent-food ranking. The TDEE, adaptive TDEE, macro target and recommendation scoring tests arrive with Phases 2–4.

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel. The framework preset is Next.js and needs no build settings.
2. Add the environment variables from the table above to Production and Preview. Don't prefix `SUPABASE_SECRET_KEY` with `NEXT_PUBLIC_`.
3. Deploy. Then set the Supabase **Site URL** to the production domain and add `https://<domain>/**` to the Redirect URLs.
4. Open the site on your phone, sign in, and use Share → **Add to Home Screen**.

## Project layout

```
src/
  app/
    (app)/            tabbed app: Today, Log (+ new-food), Trends, Plan, Settings, Admin
    (auth)/           login, signup (invite)
    api/              foods/search, foods/barcode/[code], signup, invites, account, me
    auth/confirm/     magic-link landing
    onboarding/       first-run profile
  components/         UI primitives, sheets, scanner, nutrition displays
  lib/
    foods/            parsers (OFF/USDA/AFCD), server lookup + caching
    supabase/         browser, server and admin clients
    data.ts           client data access (RLS-scoped)
    nutrients.ts      nutrient definitions and null-aware math
  proxy.ts            session refresh + auth gate (Next 16 "proxy", formerly middleware)
supabase/migrations/  schema + RLS
scripts/              AFCD import, icon generation
tests/                unit, PGlite RLS, live RLS
```

**Later: Capacitor.** All data access goes through `src/lib/data.ts` and the `/api` routes, and the UI is client-rendered. That lets the app be wrapped with Capacitor, with HealthKit added as a new workout/weight `source`, without restructuring.

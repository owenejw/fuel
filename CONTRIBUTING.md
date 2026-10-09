# Working on Fuel

This is the guide for Jez, Levi and Owen.

## One-time setup

1. Install [Node.js 24](https://nodejs.org) (or run `nvm use` in the repo), [Git](https://git-scm.com) and the [GitHub CLI](https://cli.github.com). Run `gh auth login` once.
2. Accept the repo invite in your GitHub email or notifications.
3. Get the code and a local database (no accounts or keys needed):

   ```bash
   gh repo clone owenejw/fuel
   cd fuel
   npm run setup      # installs packages + loads the Australian food database locally
   npm run dev        # http://localhost:3000
   ```

   Your local app uses its own database in `.data/` and never touches the real one. Delete `.data/` and run `npm run seed:afcd` to start fresh.

4. Optional: copy `.env.example` to `.env.local` and add a `USDA_API_KEY` (free) for wider food search, or an `ANTHROPIC_API_KEY` to try the AI features.

## Making a change

```bash
git switch main && git pull                 # start from the latest
git switch -c feature/short-description     # one branch per change
# …edit, then check it:
npm run dev                                 # try it
npm test                                    # run the tests
git add -A && git commit -m "Add …"
gh pr create --fill                         # open a pull request
```

When you open a pull request:

- **CI runs automatically** (formatting, lint, types, tests, build). Fix anything red; `npm run format` fixes formatting.
- **Vercel posts a preview link.** Open it on your phone to try the change.
- **Someone else approves it**, then it's merged with **Squash and merge**.
- **Merging to `main` deploys to production** within a couple of minutes. Database migrations run first.

Keep pull requests small. Several small ones are easier to review than one big one.

## Ground rules

- **Never commit secrets.** `.env*` files are git-ignored for a reason, and the repo is public. Keys live in Vercel's project settings.
- **Database changes go in a new migration file**, e.g. `supabase/migrations/0002_add_sleep.sql`. Never edit a migration that has already been merged, because production has already run it.
- **Unknown nutrients stay unknown.** Use `null`/absent, never `0`, and show "no data" in the UI.
- **Pure logic goes in `src/lib`** with a unit test in `tests/unit`. Database access goes in `src/server`.
- Tools that edit code for you (Claude Code, Copilot) are fine. Read the diff before you push.

## Where things are

See the "Layout" section of the [README](README.md). The usual starting points:

| I want to… | Look in |
| --- | --- |
| Change a screen | `src/app/(app)/…` and `src/components` |
| Change a calculation (targets, suggestions, fuelling) | `src/lib/tdee.ts`, `recommend.ts`, `fuelling.ts` + `tests/unit` |
| Read or write data | `src/server/actions/*` (called from the UI) and `src/server/repo.ts` |
| Add a table or column | a new file in `supabase/migrations/` |

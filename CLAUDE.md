# CLAUDE.md

**`SPEC.md` is the single source of truth.** Read the relevant parts before any work. `product.md` is the frozen founding brief. Don't edit it.

## Task-by-task protocol (see SPEC.md Part D0)

1. Work on **one task at a time**, in the order of SPEC.md §D1. Check the status column before starting.
2. Before coding, restate the task's scope and plan briefly. Implement only what that task lists.
3. Run the task's tests and report the real output. List any manual checks for the user.
4. Set the task to `AWAITING CONFIRMATION`. **Don't start the next task until the user confirms.** Then mark it `DONE` and add a line to the Part F change log.
5. If the spec turns out to be wrong, stop and propose a SPEC.md change (bump its version) before continuing.

## Stack (fixed; changes need a SPEC.md update)

Turborepo + pnpm monorepo · Nuxt 4 / Vue 3 / TS / Nuxt UI + Tailwind · Nitro API · **TypeORM (EntitySchema, no decorators) + PostgreSQL**. Never Prisma or Drizzle. · Python 3.12 FastAPI AI service (uv) · Vitest, fast-check, Playwright, pytest.

## Non-negotiables

The product rules in SPEC.md §A6, especially: no capture before a user action; never delete or overwrite takes; no fake word-level highlighting; segmentation never changes wording; LLMs only propose; stale results are dropped; no content-capturing analytics or cloud upload without opt-in.

## Code rules (SPEC.md §B10). Every task must pass these before asking for confirmation.

1. **No TypeScript errors.** Strict mode; `pnpm typecheck` = 0 errors. No `any`, no `@ts-ignore`, no non-null `!`.
2. **No lint errors or warnings.** `pnpm lint --max-warnings=0` clean; for Python, `ruff` + `pyright` strict clean.
3. **No comparisons against raw string literals.** Fixed value sets live as `const` objects in `packages/contracts` (`SessionState.Paused`, not `'paused'`). This covers `===`/`!==`, `switch` cases, and Vue templates. `typeof x === 'string'` is fine. Python uses `StrEnum`.
4. **Record lookups instead of nested ternaries.** No nested ternaries. Map key-dependent values and behaviors with `Record<Union, T>` so a missing key is a compile error. Replace `if/else if` chains with more than two branches on the same key with a record.

5. **An API route doesn't exist until it's documented.** Every route has OpenAPI docs to the SPEC.md §B5.1 standard: one registered tag, operationId, summary, description, schemas with descriptions and examples, and `ApiError` error responses. Swagger UI: web `/api/docs`, AI service `/docs`. The completeness tests enforce this.
6. **No hard-coded UI text.** R1 is English only, but every string goes through `t()` with a key in `apps/web/i18n/locales/en.json` (SPEC.md §B11), so languages can be added later. Keys are nested and every segment is snake_case (`studio.status.your_turn`); the locale test enforces this.

## Boundaries

- `packages/session-engine` imports nothing from vue/nuxt/DOM/typeorm/AI SDKs.
- `packages/db` is imported only from `apps/web/server/**`.
- Add a dependency only after it's listed in SPEC.md §B8, justified by the current task.
- Never use the placeholder product name in identifiers.

## Commands

On this machine, Homebrew's `node@20` shadows nvm. Run commands with Node 22 first on PATH:
`export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$HOME/.local/bin:$PATH` (uv lives in `~/.local/bin`).

```
pnpm install
pnpm dev          # turbo: web + ai
pnpm typecheck
pnpm lint
pnpm test         # unit + property + contract
pnpm test:int     # DB + API integration (DATABASE_URL = Neon dev; DATABASE_URL_TEST = Supabase test project; schema dropped after each run)
pnpm test:e2e     # Playwright
pnpm build
pnpm db:migrate
```

Tests cite what they prove, e.g. `it('T5-AC3: …')`.

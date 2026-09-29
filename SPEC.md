# SPEC — Filming Assistant

> Single source of truth for this project. Version **0.21.1** · Last updated 2026-09-28
> Input brief: `product.md` (frozen). Repo rules for Claude Code: `CLAUDE.md`.
> "Filming Assistant" is a placeholder name. Never use it in package names, identifiers, or branding.

**Contents:** Part A What & Why · Part B How (architecture, stack, contracts, code standards, i18n) · Part C Testing · Part D Task Plan (gated) · Part E Assumptions & open decisions · Part F Change log

---

# PART A — WHAT WE ARE BUILDING AND WHY

## A1. Why (the problem)

A creator filming scripted video often has another person read the script aloud in short pieces, then repeats each piece to camera. This takes up another person's time and adds editing work. Teleprompters suit some creators; others deliver better when they **hear** a line and repeat it while looking into the lens.

## A2. What (the product)

A browser-first, mobile-responsive **recording companion** that:

1. Accepts a script (paste/edit first; TXT/DOCX/PDF later) and separates spoken text from headings, notes, and scene cues.
2. Splits spoken text into natural chunks the user can adjust, **without ever changing the wording**.
3. Reads each chunk aloud in a chosen synthetic voice and highlights it honestly: word-level only when real timing data exists, otherwise the whole chunk.
4. Waits for the creator to repeat the chunk, detects when it's delivered, and advances automatically when confident or asks when unsure.
5. Records takes per chunk, keeps **every** take until the creator chooses one, and exports a reviewable result.
6. Offers a separate **follow-my-voice teleprompter** mode, with an autoscroll fallback.

**Primary outcome:** a creator can finish a scripted recording without a second person, with few unnecessary touches and a clear path to a usable export.

## A3. Who

| Persona | Description | Priority |
|---|---|---|
| P1 Repeat-after creator | Films Reels/Shorts/lessons; prefers hearing then repeating lines. One device, often no headset. | Primary |
| P2 Teleprompter reader | Reads on screen and wants the text to follow their voice. | Secondary |
| P3 Two-device creator | Films on a separate camera; the app is the reader and session tracker. | Secondary |

## A4. Modes

| Mode | Summary | Release |
|---|---|---|
| Listen & Repeat, auto | Assistant reads, creator repeats, auto-advance when confident | R1 |
| Listen & Repeat, manual | Advance only on "Next" (voice/tap/key) | R1 |
| Practice | Listen & Repeat without video capture | R1 |
| Teleprompter, follow voice | Creator reads; position follows speech; manual correction | R1.1 |
| Teleprompter, autoscroll | Speed-controlled scroll fallback | R1.1 |
| Scene cues | Optional spoken cues, excluded from the take | R1.1 |

## A5. Audio/device arrangements (each is a separate, testable contract)

| ID | Arrangement | Playback | Capture | Commands during assistant speech | Default settle |
|---|---|---|---|---|---|
| A1 | One device, speaker (primary) | Device speaker | Device mic (+camera) | **Off** (touch only) | From echo test, min 300 ms (default 600) |
| A2 | One device, headset/earbud | Headset, if the OS routes it | Selected mic | On (grammar-gated) | 150 ms (to validate) |
| A3 | Two devices, speaker | Companion speaker | Companion mic for commands only | Off | As A1 |
| A4 | Two devices, headset | Companion headset | Companion mic | On (gated) | As A2 |
| A5 | Teleprompter only | None | Optional mic for follow-voice | n/a | n/a |

Honesty rules: never claim control over Bluetooth routing; "system default output" is a **supported** fallback; never promise complete removal of assistant voice from takes.

## A6. Non-negotiable product rules

1. No recording before an explicit user action. No listening after stop, navigating away, or permission revocation. A visible capture indicator (icon + text) whenever the mic or camera is live.
2. Retakes, commands, or bugs **never delete a take**. Voice can't trigger an irreversible deletion. Destructive actions need confirmation.
3. An uncertain match never silently skips content.
4. Assistant (TTS) highlighting and creator-speech highlighting are **two separate systems with separate clocks**. No fake word-level precision and no words-per-minute timers.
5. Segmentation never paraphrases or drops words; original text and offsets are kept.
6. Language-model output only **proposes**; deterministic code decides. Model output never directly changes UI, assets, or navigation.
7. Stale async results (wrong `sessionId`/`chunkId`/`seq`) are discarded.
8. No cloud upload of scripts or audio without opt-in. No analytics that capture scripts or audio. **Cloud speech (OpenAI, §B12) is off until the user explicitly opts in** (a consent step naming what is sent: chunk text for TTS, take audio for STT). Without consent, or offline, the local fallback is used.
9. Color is never the only indicator of recording state.
10. No claims beyond the tested device/browser matrix.

## A7. Success metrics (provisional; revised after the baseline in Task 19)

| Metric | Provisional R1 target |
|---|---|
| M1 Interventions per 10 chunks (auto mode) | ≤ 3 |
| M2 Time-to-finish vs. human-reader baseline | ≤ baseline + 20% |
| M3 False advances | 0 on the 60-s script; ≤ 1 per 50 chunks |
| M4 Missed commands | ≤ 10% |
| M5 Assistant voice leaking into takes (A1) | Measured; no target until baseline |
| M6 Lost takes | **0 (hard)** |
| M7 Export failures on the supported matrix | **0 (hard)** |

## A8. Out of scope for R1

Voice cloning, AI avatars, a non-linear editor, social posting, Notion/Google Docs OAuth, browser extension, native mobile/background listening, billing, hosted AI other than OpenAI speech (§B12), cloud storage, OCR for image-only PDFs, barge-in during speaker playback, **languages other than English** (UI and voice). R1 is English only; §B11 keeps the UI ready for more languages, which will be rolled out later with their own spec change if R1 works. **Login/auth** is also out of R1: the `User` model exists (Task 1), but R1 runs as a single local user.

---

# PART B — HOW WE ARE BUILDING IT

## B1. Monorepo layout (Turborepo + pnpm workspaces)

```
.
├── apps/
│   ├── web/                 Nuxt 4 app: UI (client-only studio) + Nitro server API
│   └── ai/                  Python FastAPI service (STT, VAD, TTS); package.json wraps uv for turbo
├── packages/
│   ├── contracts/           Shared TS types + JSON Schemas + fixtures (TS & Python both test against them)
│   │   ├── src/schemas/     Schemas typed against the TS types (objectSchema<T>); validation in src/validation.ts
│   │   ├── schemas/         Emitted <Type>.json files (JSON Schema 2020-12), read by the Python tests
│   │   └── fixtures/        contracts/<Type>.json (valid/invalid), text/utf16-offsets.json, grammar/en.json
│   ├── db/                  TypeORM DataSource, entities (EntitySchema), migrations, repositories
│   ├── session-engine/      Framework-free TS state machine (events in → effects out)
│   ├── script-model/        Parsing, segmentation, offsets, text-preservation invariant
│   ├── media-adapters/      Browser media adapters behind interfaces (mic, camera, output, recorder)
│   ├── ui/                  Design tokens + shared Vue components (Nuxt layer)
│   └── config/              Shared tsconfig, eslint, vitest presets
├── tests/
│   ├── e2e/                 Playwright end-to-end tests
│   └── fixtures/            Scripts, audio, golden event logs
├── turbo.json
├── pnpm-workspace.yaml
├── SPEC.md                  ← this file
└── CLAUDE.md
```

`turbo.json` pipeline (target):

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**", ".output/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "lint":      {},
    "test":      { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:int":  { "dependsOn": ["^build"], "cache": false },
    "test:e2e":  { "dependsOn": ["build"], "cache": false },
    "dev":       { "cache": false, "persistent": true },
    "db:migrate":{ "cache": false }
  }
}
```

Root scripts: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:int`, `pnpm test:e2e`, `pnpm db:migrate`. Each one runs `turbo run <task>`.

## B2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | **Turborepo** + pnpm workspaces | Python app joins via a `package.json` whose scripts call `uv run …` |
| Runtime | Node 22 LTS; Python 3.12 (via uv) | Node 20.15 on the machine is too old for Nuxt 4; Python 3.13 ML wheels not assumed |
| Frontend | Nuxt 4, Vue 3, TypeScript, Nuxt UI + Tailwind | Studio/preflight/teleprompter pages are client-only |
| API | Nitro server routes in `apps/web/server/api` | No NestJS/GraphQL |
| ORM | **TypeORM** (not Prisma) | Entities use `EntitySchema` (no decorators), because Nitro/esbuild doesn't emit decorator metadata. Migrations in `packages/db/migrations`. `typeorm` + `pg` marked external in the Nitro build. |
| Database | **Hosted PostgreSQL: Neon (dev) + Supabase (integration tests)**; no local install | `DATABASE_URL` → Neon project (the app's database). `DATABASE_URL_TEST` → a Supabase project used only by `pnpm test:int`. TLS always verified; each URL has its own optional CA setting (`DATABASE_URL_CA_CERT`, `DATABASE_URL_TEST_CA_CERT`), since Supabase uses its own CA and Neon a public one. Any PostgreSQL URL works. See §C1.1 |
| Media files | Browser OPFS first (crash-safe), then upload to local disk storage (`STORAGE_DIR`) via the API | Large media never goes in DB rows. Storage sits behind a `Storage` interface so S3-compatible storage can be added later. |
| AI service | FastAPI; TTS: **Kokoro-82M via kokoro-onnx, onnx-community *timestamped* export, fp32** (Task 7); candidates: faster-whisper (STT), Silero or in-browser VAD, Ollama (optional segmentation) | Candidates until measured (Tasks 7–9) |
| Tests | Vitest, fast-check, Playwright, pytest, ruff | See Part C |
| UI state | Vue composables; Pinia only if needed | Session truth lives in the engine, not in Pinia |

**Forbidden without a spec change:** React/Next/extra SPA, NestJS, GraphQL, Redis, message brokers, Kubernetes, event sourcing, LangChain/LlamaIndex/agent frameworks, XState or other state-machine libraries, Prisma or Drizzle, duplicate TTS/STT/UI/animation/video SDKs, paid APIs other than OpenAI speech (§B12), content-capturing analytics.
**Dependency rule:** every new dependency is added to the table in §B8, justified by a task's acceptance criterion.

## B3. Component boundaries

```
Browser (apps/web, client-only studio)
  Vue components ──dispatch commands──▶ session-engine (pure TS) ──effects──▶ effect runner
                  ◀──────snapshot──────                                     │
       ┌──────────────────────────────────────────────────────────────────────┤
       ▼                    ▼                        ▼                        ▼
  media-adapters       TTS/STT/VAD clients      OPFS take buffer        Nitro API client
  (mic, camera,        (AI service + browser    (crash-safe)            (projects, scripts,
   output, recorder)    fallbacks)                                       sessions, takes)
                            │ HTTP/WS /v0                                     │ HTTP /api
                            ▼                                                 ▼
                      apps/ai (FastAPI)                              Nitro routes → packages/db
                                                                     (TypeORM → PostgreSQL)
                                                                     + Storage (STORAGE_DIR)
```

Rules:
- `session-engine` imports nothing from Vue, Nuxt, DOM, Web Audio, TypeORM, or AI SDKs. It's a reducer: `(snapshot, event, now) → { snapshot, effects[] }`. Time is injected.
- `packages/db` is only imported by `apps/web/server/**`, never by client code.
- Every provider sits behind an interface in `contracts`: `TTSProvider`, `STTProvider`, `VADProvider`, `ScriptSegmenter`, `MediaCapture`, `AudioOutput`, `Storage`, `DocumentImporter`. Each has `capabilities()`, `AbortSignal` cancellation, a timeout, and typed errors `unavailable | timeout | invalid | cancelled | quota | permission`.

| Interface | Primary | Fallback |
|---|---|---|
| TTS | **OpenAI TTS via Nitro** (after opt-in, §B12); word timings derived by aligning the generated audio, else chunk highlight | Offline / no consent: local AI service (Kokoro, word start times from durations) → browser `speechSynthesis` (chunk highlight; word highlight only if boundary events are confirmed) |
| STT | **OpenAI STT via Nitro** (after opt-in, §B12), no chunk-text prompt, only on VAD-detected speech | Offline / no consent: local AI service (faster-whisper `base.en` int8, greedy, Task 8) → manual advance. (Browser Web Speech is not used: it sends audio to a third party with no opt-in control.) |
| VAD | **Silero** (Task 8; an energy VAD misses speech in noise). Browser (onnxruntime-web) vs AI-service placement decided in Task 13 | none → manual advance |
| Segmenter | Deterministic rules | Ollama proposals (boundaries only, validated) |

## B4. Data model (TypeORM entities, PostgreSQL)

All ids are UUID v7 (`uuid` primary key, generated in app code). All tables have `created_at` and `updated_at`.

| Entity | Key fields | Relations / notes |
|---|---|---|
| **User** | id, email (nullable, unique), display_name, locale (`Locale` value, default `en`, §B11), is_local (bool) | R1: one seeded local user (`is_local = true`). Auth comes later with its own spec. |
| **UserSettings** | user_id (PK/FK), default_voice_id, default_rate, theme, reduced_motion, command_aliases (jsonb), match_thresholds (jsonb) | 1:1 User |
| **VoiceFavorite** | id, user_id, provider, voice_id, label | N:1 User; unique (user_id, provider, voice_id) |
| **Device** | id, user_id, label, user_agent, echo_settle_ms, capability_probe (jsonb), last_seen_at | Per-device calibration + capability results |
| **Project** | id, owner_id, title, archived_at | N:1 User |
| **Script** | id, project_id, version (int), source_kind, source_ref, original_asset_key | N:1 Project; immutable per version |
| **ScriptBlock** | id, script_id, order, type (`spoken\|heading\|note\|scene_cue`), text, source (jsonb: page/row/column/range), metadata (jsonb) | N:1 Script; unique (script_id, order) |
| **ChunkPlan** | id, script_id, version, mode (`short\|sentence\|paragraph\|smart`) | N:1 Script |
| **ScriptChunk** | id, chunk_plan_id, order, ranges (jsonb `[{blockId,start,end}]`), text, spoken_text, scene_cue (jsonb) | N:1 ChunkPlan; ids stable across unrelated edits |
| **Session** | id, project_id, user_id, device_id, chunk_plan_id, state, current_chunk_id, seq (bigint), settings (jsonb), completed_at | Snapshot only; the event log is a capped client ring buffer exported for debugging, **not** event sourcing |
| **Take** | id, session_id, chunk_id, ordinal, status (`recording\|complete\|interrupted\|unusable`), selected (bool), media_key, mime_type, kind (`audio\|video`), bytes, duration_ms, timing (jsonb), transcript (jsonb), match (jsonb) | N:1 Session, N:1 ScriptChunk; unique (session_id, chunk_id, ordinal); **partial unique index: one `selected = true` per (session_id, chunk_id)**; deletes are soft (`deleted_at`) and need confirmation |
| **Export** | id, session_id, status (`pending\|running\|done\|failed`), kind (`per_take\|stitched`), media_key, error | N:1 Session |

**Task 1 tables** (migration `InitUsers1727136000000`; snake_case columns, plural table names, schema-qualified):

```
users 1 ──── 1 user_settings        (user_id PK/FK, ON DELETE CASCADE)
users 1 ──── * voice_favorites      (user_id FK, CASCADE; UNIQUE (user_id, provider, voice_id))
users 1 ──── * devices              (user_id FK, CASCADE; index on user_id)
```
- `users`: unique index on `lower(email)` (so email is case-insensitive unique; NULLs allowed); partial unique index on `is_local WHERE is_local` (at most one local user); CHECK `locale IN (Locale values)`; CHECK non-blank `display_name`.
- `user_settings`: CHECK `theme IN (Theme values)` (`dark` default), CHECK `default_rate BETWEEN 0.5 AND 2`; `match_thresholds` defaults to `{"coverage":0.8,"similarity":0.7}`.
- Fixed value sets in CHECKs are generated from the `packages/contracts` constants, so adding a value needs a migration.

**Task 4 tables** (migration `InitRecording1727222400000`):

```
users 1 ── * projects 1 ── * scripts 1 ── * script_blocks        PK (script_id, id)
                               scripts 1 ── * chunk_plans 1 ── * script_chunks   PK (chunk_plan_id, id)
projects 1 ── * sessions (→ chunk_plan, → (chunk_plan_id, current_chunk_id) chunk, → device SET NULL)
sessions 1 ── * takes (→ (chunk_plan_id, chunk_id) chunk)      sessions 1 ── * exports
```
- All parent FKs are `ON DELETE RESTRICT`; nothing cascades into takes.
- `scripts`/`chunk_plans`: `UNIQUE (parent, version)`, versions from 1; `scripts.source_text` holds the pasted original.
- `takes`: `UNIQUE (session_id, chunk_id, ordinal)`; partial unique `(session_id, chunk_id) WHERE selected`; CHECK `NOT selected OR deleted_at IS NULL`; **`BEFORE DELETE` trigger `takes_forbid_delete` raises `restrict_violation`**.
- Value-set CHECKs (block type, chunk mode, session state, take status/kind, export status/kind, source kind) come from the contracts constants. RLS is on for every table.

DB invariants enforced by constraints + tests:
- A take row is never hard-deleted by application code paths reachable from the session flow.
- Changing a chunk plan never re-links existing takes (takes reference immutable chunk ids).

## B5. Contracts (shared in `packages/contracts`, mirrored in Python with Pydantic)

**Envelope** (every event/message):
```ts
interface Envelope<T extends string, P> {
  v: '0.1'; type: T; id: string;
  sessionId?: string; chunkId?: string; seq?: number; requestId?: string;
  t: number;            // monotonic ms
  payload: P;
}
```
Consumers ignore unknown fields and reject a different major `v`.

**Text-preservation rules**
1. Offsets are **UTF-16 code units** (JS string indices); the Python side converts. A fixture with emoji and combining accents enforces this.
2. Chunk ranges cover every non-whitespace character of spoken text exactly once. No gaps, no overlaps.
3. `normalize(s)` = NFC, collapse whitespace, trim. Invariant: `normalize(join(chunks.text)) === normalize(join(spokenBlocks.text))`.
4. `spoken_text` may differ from `text` only by whitespace, markdown emphasis markers, and explicitly listed, unit-tested rules.
5. AI segmenters return **boundary offsets only**. An offset that isn't on a boundary is snapped (≤ 12 UTF-16 units) or rejected. Boundaries are **whitespace-separated word starts only**, never inside a token like `now—then`, because chunks are rejoined with a space for rule 3 (found by the Task 3 property tests).

**Key payloads**
```ts
interface WordTiming { index: number; start: number; end: number; charStart: number; charEnd: number } // ms from audio start
interface TtsResult  { audioUrl: string; durationMs: number; timings: WordTiming[] | null;
                       timingSource: 'provider' | 'boundary-event' | 'none'; cacheKey: string }
interface MatchResult { coverage: number; similarity: number; missingSpans: {charStart:number;charEnd:number}[];
                        decision: 'advance' | 'ask'; reasons: string[] }
type Intent = 'START'|'PAUSE'|'CONTINUE'|'REPEAT'|'RETAKE'|'NEXT'|'PREVIOUS'|'NAVIGATE'|'SPEED'|'CHUNK_SIZE'|'HELP'
interface CommandEvent { intent: Intent; args?: Record<string,string>; source: 'voice'|'touch'|'keyboard'; utterance?: string; confidence?: number }
```

**Command grammar (en)**

| Intent | Phrases |
|---|---|
| START | start, begin |
| PAUSE | pause, **stop**, hold on, wait ("stop" means pause; ending a session is a button with confirmation) |
| CONTINUE | continue, resume, go on |
| REPEAT | repeat, read it again, repeat this line, again |
| RETAKE | retake, let me try again, one more time |
| NEXT / PREVIOUS | next, next line / go back, previous, previous line |
| NAVIGATE | go to {target}, back to {target} |
| SPEED | slower, faster, normal speed |
| CHUNK_SIZE | read less, read a full sentence, read the paragraph |
| HELP | what can I say, help |

**APIs**

| Service | Method & path | Purpose |
|---|---|---|
| Nitro | `GET /api/health` | App + DB + AI-service health |
| Nitro | `GET/PATCH /api/me`, `GET/PATCH /api/me/settings`, `GET/POST /api/me/voices`, `DELETE /api/me/voices/:id` | Local user, settings, favorites |
| Nitro | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` | Projects (delete = archive; PATCH `archived:false` restores) |
| Nitro | `POST/GET /api/projects/:id/scripts`, `GET /api/scripts/:id` | Script versions (immutable) + blocks |
| Nitro | `POST /api/scripts/:id/chunk-plans`, `GET /api/chunk-plans/:id` | Chunk plans are **immutable versions**; an edit is a new version. The server rebuilds chunk text from ranges and checks coverage |
| Nitro | `POST /api/sessions`, `GET/PATCH /api/sessions/:id` | Session snapshot autosave (`seq` must increase, else 409) |
| Nitro | `POST/GET /api/sessions/:id/takes`, `PATCH /api/takes/:id`, `DELETE /api/takes/:id?confirm=true`, `POST /api/takes/:id/restore` | Takes: create (JSON metadata), select, mark, soft delete, restore |
| Nitro | `PUT /api/takes/:id/media`, `GET /api/takes/:id/media` | Media: raw body **streamed to disk** once (never overwritten); download with HTTP `Range` |
| Nitro | `POST /api/sessions/:id/exports`, `GET /api/exports/:id` | Exports (entity + routes in Task 4; producing files in Task 17) |
| Nitro | `POST /api/speech/tts`, `GET /api/speech/audio/:key`, `POST /api/speech/stt`, `GET /api/speech/voices` | Speech (§B12): synthesis (cached; OpenAI after consent, else local), cached audio with `Range`, per-take transcription (raw audio body; echoes sessionId/chunkId/seq), voices of both providers |
| AI | `GET /v0/health` | Status of each capability + model versions |
| AI | `GET /v0/tts/voices`, `POST /v0/tts`, `GET /v0/tts/audio/:key` | Voices, synthesis, cached audio |
| AI | `POST /v0/stt` | Per-take transcription (echoes sessionId/chunkId/seq) |
| AI | `WS /v0/stt/stream` | Streaming transcription (teleprompter, R1.1) |
| AI | `POST /v0/segment` | Boundary proposals only |

### B5.1 API documentation (OpenAPI 3.1 + Swagger UI)

Both HTTP services publish an OpenAPI document and Swagger UI. **An endpoint doesn't exist until it is documented.** The completeness test below fails the build if any route is undocumented or under-documented.

**Where**

| Service | OpenAPI JSON | Swagger UI | Enabled |
|---|---|---|---|
| Web API (Nitro) | `/api/openapi.json` | `/api/docs` | Dev: always. Production: only when `API_DOCS_ENABLED=true` |
| AI service (FastAPI) | `/openapi.json` | `/docs` | Always (local service) |

**How (web API).** Nitro's experimental generator was checked in Task 1 and **can't meet the standard** (H-21 refuted). It emits no top-level `tags` with descriptions and hard-codes `servers`. So the documented fallback applies:

- `apps/web/server/openapi/` holds a hand-written document, typed against a small OpenAPI 3.1 type: one module per tag, plus shared component schemas.
- It is served by `server/routes/api/openapi.json.get.ts` (JSON) and `server/routes/api/docs.get.ts` (Swagger UI; `swagger-ui-dist` pinned, loaded from jsDelivr). These are docs infrastructure, not API operations, so they live outside `server/api/`.
- Docs are always on in dev. In production they're on only when `API_DOCS_ENABLED=true` at **runtime**; otherwise both routes return 404.

**Tags** (registered in `meta` with descriptions; every operation has **exactly one**):

| Tag | Description | Routes (introduced in) |
|---|---|---|
| Health | Liveness and dependency status (DB, AI service) | `/api/health` (Task 0/1) |
| User | The current (local) user profile | `/api/me` (Task 1) |
| Settings | Per-user preferences: voice, speed, thresholds, theme, command aliases | `/api/me/settings` (Task 1) |
| Voices | Favorite voices | `/api/me/voices` (Task 1) |
| Devices | Per-device calibration and capability results | `/api/me/devices` (Task 14) |
| Projects | Projects owning scripts and sessions | Task 4 |
| Scripts | Versioned scripts and blocks | Task 4 |
| Chunk Plans | Chunk boundaries over spoken text | Task 4 |
| Sessions | Recording session snapshots | Task 4 |
| Takes | Recorded takes: upload, select, soft delete | Task 4 |
| Exports | Per-take and stitched exports | Task 4/17 |
| Speech | Assistant voice (TTS) and take transcription (STT): OpenAI after consent, else the local AI service | `/api/speech/*` (Task 10) |

**Documentation standard (every operation):**
1. `tags`: exactly one registered tag.
2. `operationId`: unique, camelCase, verb + noun (`getMe`, `updateSettings`, `addFavoriteVoice`).
3. `summary`: ≤ 60 characters, imperative mood.
4. `description`: what it does, side effects, idempotency, and any safety rule that applies (e.g. "Takes are never hard-deleted; requires `confirm=true`").
5. Every path/query parameter has a `description`, a `schema` and an `example`.
6. The `requestBody` (if any) has `required`, a `$ref` schema and an `example`.
7. Responses:
   - The success response has a `$ref` schema and an `example`.
   - Every applicable error response (`400`, `404`, `409`, `422`, `500`) references `ApiError`.
8. Component schemas have a `description` on the schema **and on every property**. Enums list their values, and formats are set (`uuid`, `date-time`, `email`).

**Every `/api` error is an `ApiError` (v0.21.0).** This includes requests no route handles:
- An unknown path gets 404 `not_found` from the fallback `server/api/[...path].ts`, the only route file without a method suffix; the completeness checker knows it.
- A documented path with the wrong method gets 405 `method_not_allowed` with an `Allow` header, from `server/middleware/api-methods.ts`, which checks the OpenAPI document.
- Before this, both fell through to the page renderer, which answered in its own format (with a stack trace in dev).

**Error shape** (all web API errors):

```ts
interface ApiError {
  statusCode: number;           // HTTP status
  code: string;                 // stable machine code from the ApiErrorCode constant, e.g. 'validation_failed', 'not_found', 'conflict'
  message: string;              // human-readable, safe to show
  details?: { field: string; issue: string }[];  // validation details
}
```

**AI service (FastAPI).**
- `openapi_tags` declares tags with descriptions: Health, TTS, STT, Segmentation.
- Every route sets `tags`, `summary`, `description`, `response_model` and `responses` for errors.
- Every Pydantic model and field has a `description` (`Field(description=…)`) and an example (`json_schema_extra`).
- The same completeness test is applied in pytest.

**Completeness tests (part of `pnpm test:int` and pytest).** These fetch the generated document and assert:
- every file under `server/api/**` maps to a documented path and method, and every documented path has a handler
- every operation meets rules 1–7
- every schema meets rule 8
- operationIds are unique, and all `$ref` targets resolve
- the document validates as OpenAPI 3.1

## B6. Session state machine (normative)

States: `idle, preparing, ready, assistant_speaking, settle, waiting_for_speech, creator_speaking, evaluating, review_or_advance, paused, recovering, error, completed`

| From | Event | Guard | To | Effects |
|---|---|---|---|---|
| idle | PREPARE | — | preparing | probe capabilities |
| preparing | CAPS_READY / CAPS_FAILED | min caps met / — | ready / error | persist |
| ready | START, CONTINUE | — | assistant_speaking | speak(chunk) |
| assistant_speaking | TTS_ENDED | seq match | settle | startTimer(settleMs) |
| assistant_speaking | TTS_FAILED | — | ready | show text, toast |
| settle | TIMER | — | waiting_for_speech | armCapture |
| waiting_for_speech | VAD_START | — | creator_speaking | startTake |
| waiting_for_speech | TIMER(noSpeech) | — | review_or_advance | prompt(no_speech) |
| creator_speaking | VAD_END / VAD_START | — | creator_speaking | start / cancel silence timer |
| creator_speaking | TIMER(silence) | — | evaluating | stopTake, evaluate |
| evaluating | EVAL_RESULT | seq match ∧ auto ∧ confident | ready (next) | commitTake, persist |
| evaluating | EVAL_RESULT | seq match ∧ not (auto ∧ confident) | review_or_advance | commitTake, prompt |
| evaluating | EVAL_FAILED / TIMEOUT | — | review_or_advance | commitTake, prompt(eval_unavailable) |
| review_or_advance | NEXT / REPEAT / RETAKE | — | ready(next) / assistant_speaking / settle | markAlternative on retake |
| any active | PAUSE, VISIBILITY_HIDDEN | — | paused | cancelTTS, stopTake(interrupted), disarm, clear timers |
| paused | CONTINUE | — | ready | — |
| any active | DEVICE_LOST, PERMISSION_REVOKED | — | recovering | stop all tracks, stopTake(interrupted) |
| recovering | DEVICE_RESTORED | — | paused | — |
| ready | FINISH / NEXT at last chunk | — | completed | persist |

**Engine interpretation (Task 5, v0.13.0):**
- **Running sessions keep reading (user decision).** While a session is running, `ready` is passed straight through: after NEXT, PREVIOUS/NAVIGATE while running, or a confident auto-advance, the target chunk is read at once (auto and manual alike); CONTINUE/START after a pause re-reads the current chunk; CONTINUE in `review_or_advance` advances. `ready` is where a session rests: before the first START, after `TTS_FAILED`, or after navigating while stopped. Navigation while paused moves the chunk and stays paused. NEXT at the last chunk (any accepting state) → `completed`.
- **Stale guard = tokens.** Every async operation (speech, timer, capture, take, evaluation) gets a unique token; a result is accepted only while its token is current, and leaving a state clears them. "seq match" in the table means token match (an `EVAL_RESULT` must also name the current chunk). `seq` counts accepted changes (autosave ordering, invariant 5); a single seq can't be the guard because VAD events inside one take would go stale.
- **Evaluation timeout** is an engine timer (`evalTimeoutMs`, 5 s = the STT timeout in §B7); `TIMEOUT` in the table is that timer.
- `FINISH` is accepted in `ready`, `paused` and `review_or_advance`. `PREPARE` also leaves `error`. `DEVICE_LOST`/`PERMISSION_REVOKED` also apply in `paused`.
- SPEED (±0.1, 0.5–2), CHUNK_SIZE (emits `request_rechunk`; the runner answers with `PLAN_CHANGED`) and HELP don't change state. Identical touch/keyboard commands within 300 ms are coalesced; voice never is. NAVIGATE carries the resolved `args.chunkId`.
- ✓* cells: the recognizer reports `speechGate` (duration, exact grammar match, similarity to the remaining chunk); the engine accepts voice only if ≤ 2.5 s, exact, and similarity < 0.5.

**Invariants (property-tested):** (1) leaving a state cancels its timers and in-flight requests; (2) `stopTake` always persists a take; (3) the mic is armed only in `waiting_for_speech`/`creator_speaking` and never while paused, recovering, or in error; (4) no capture during `assistant_speaking` in A1; (5) `seq` is strictly increasing.

**Command permission matrix** (✓ accepted · ✗ ignored · T touch/keyboard only)

| Intent \ State | ready | speaking (A1) | speaking (A2) | settle | waiting | creator_speaking | evaluating | review | paused |
|---|---|---|---|---|---|---|---|---|---|
| START/CONTINUE | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| PAUSE | ✓ | T | ✓ | ✓ | ✓ | ✓* | ✓ | ✓ | ✗ |
| REPEAT | ✓ | T | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| RETAKE | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | ✓ |
| NEXT/PREVIOUS | ✓ | T | T | T | ✓ | ✗ | ✗ | ✓ | ✓ |
| SPEED/CHUNK_SIZE/HELP | ✓ | T | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |

\* A voice command during creator speech counts only if it is a separate short utterance (≤ 2.5 s), matches the grammar exactly, and doesn't match the remaining chunk text (similarity < 0.5). Touch PAUSE always works.

## B7. Audio, highlighting, matching (defaults to validate)

- **Assistant highlight tiers:** `word-provider` (TTS timings, driven by `audio.currentTime`) → `word-approx` (browser boundary events, only where probed) → `chunk`. Never interpolated. Task 7: `word-provider` uses word **start** times (≤ 40 ms from the audio); a word stays current until the next starts (phrase-final end times overshoot by about 240 ms); a chunk whose phoneme words don't add up to its script words falls back to `chunk`.
- **Creator highlight (teleprompter):** streaming STT + fuzzy token alignment (lookahead 30 tokens, lookbehind 10). Low confidence holds the position. Phrase-level by default; word-level only if measured error ≤ 1 word in 90% of samples.
- **Capture:** `getUserMedia` with echoCancellation/noiseSuppression/AGC on (toggles in advanced settings); a rolling `MediaRecorder` for ≥ 200 ms pre-roll; MIME type from `isTypeSupported` (webm/vp9+opus, then mp4).
- **Echo test (A1):** play a known 2 s phrase, measure the mic's residual tail, and store the recommended `settleMs` per Device.
- **Matching:** normalize (case, punctuation, numbers, contractions) → alignment → advance if `coverage ≥ 0.80 ∧ similarity ≥ 0.70 ∧ last chunk tokens (±2) covered`, else ask.
- **Timers:** `silenceMs` 1200, `noSpeechMs` 8000. **Timeouts:** TTS 4 s, STT 5 s, health 1 s.
- **Latency targets:** cached TTS start ≤ 150 ms; uncached ≤ 1.2 s (prefetch next chunk); decision ≤ silence + 1.5 s; command → action ≤ 1.5 s.

## B8. Dependency register

| Name | Purpose | Lighter alternative | License | Justified by | Status |
|---|---|---|---|---|---|
| turbo | Monorepo task runner | pnpm -r | MIT | Task 0 | Approved (user) |
| nuxt, @nuxt/ui, tailwindcss | App + UI | — | MIT | Brief | Approved |
| typeorm, pg (+ @types/pg, dev) | ORM + driver (+ driver types; `pg` is passed to TypeORM explicitly so the Nitro build traces it) | raw `pg` | MIT | Task 1 | Approved (user) |
| (none) Nitro built-in OpenAPI + Swagger UI | API docs | — | MIT (Nitro) | §B5.1, Task 1 | Approved (user). No new package; Swagger UI assets load from Nitro's configured CDN in dev |
| vitest, @playwright/test | Tests | node:test | MIT/Apache-2.0 | Task 0 | Approved (Task 0) |
| @nuxtjs/i18n 10.6.0 (vue-i18n transitively) | UI text from `en.json` with typed keys, so later languages only add a file | hand-rolled `Record<MessageKey, string>` | MIT | §B11, Task 11 | Approved (Task 11) |
| @iconify-json/lucide 1.2.137 | Nuxt UI's icon set bundled and served by our own server (`fallbackToApi: false`), so no icon request goes to a third party (§A6.8, offline) | Iconify public API (network call per icon) | ISC | Task 11 | Approved (Task 11) |
| @vitejs/plugin-vue 6.0.9 (dev, packages/ui) | Compiles SFCs for the props-only component unit tests (rendered with `vue/server-renderer`, so no DOM library) | @nuxt/test-utils + happy-dom | MIT | Task 11 | Approved (Task 11); already in the tree via Nuxt |
| fast-check | Property tests | hand-written loops | MIT | Task 3/5 | Approved (fixed stack in CLAUDE.md; first used in Task 3) |
| typescript 6.0.x (pinned) | Types | — | Apache-2.0 | §B10 R1 | Approved (Task 0). TS 7 blocked: typescript-eslint supports < 6.1 |
| vue-tsc | Vue typecheck (`nuxt typecheck`) | — | MIT | §B10 R1 | Approved (Task 0) |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-vue, vue-eslint-parser, globals | Lint + §B10 rules | — | MIT | §B10 R2–R4 | Approved (Task 0) |
| @types/node | Node types | — | MIT | Task 0 | Approved (Task 0) |
| ajv | JSON Schema validation (OpenAPI 3.1 document check in Task 1; contract schemas in Task 2) | hand validators | MIT | Task 1, Task 2 | Approved (user) |
| fastapi, uvicorn (pydantic transitively) | AI service | — | MIT/BSD | Task 0 | Approved (Task 0) |
| pytest, ruff, pyright, httpx2 | Py tests, lint, strict types; httpx2 backs Starlette 1.7's TestClient | — | MIT/BSD | Task 0 | Approved (Task 0) |
| faster-whisper 1.2.1 + ctranslate2 4.8.2 (Intel-Mac wheels OK), model `base.en` int8 | STT | whisper.cpp | MIT | Task 8 → Task 10 | Chosen (Task 8); `tiny.en` kept only as a fallback if real takes show no accuracy difference |
| kokoro-onnx 0.6.1 + onnxruntime 1.23.2 (pinned: last Intel-Mac wheels) + Kokoro-82M timestamped ONNX (fp32) | TTS with word timings | browser TTS | MIT / MIT / Apache-2.0 (weights, voices, export). Pulls **phonemizer + espeak-ng: GPL-3.0** (open decision 6) | Task 7 → Task 10 | Chosen (Task 7) |
| Silero VAD v5 (ONNX, 2.3 MB) | VAD | energy VAD (refuted) | MIT | Task 8 → Task 13 | Chosen (Task 8). Browser use needs `onnxruntime-web` (MIT), to be proposed in Task 13 |

## B9. Design system (summary)

- **Semantic color tokens** as CSS variables (studio dark by default, plus light): canvas, surface-1/2, text/muted/subtle, accent, success, warning, error, **live** (recording), **listening** (mic armed), **assistant** (speaking), highlight-current/spoken/upcoming. No raw hex outside `tokens.css`.
- **Typography:** system stack; UI scale 0.75 → 2.25 rem; teleprompter scale 2.5 → 6.5 rem.
- **Spacing:** 4-pt scale. **Radii:** 6/10/16/full. **Motion:** 120/200/320 ms; reduced motion means instant changes.
- **Status language (icon + text + color):** shown here in English. Every string comes from the locale files (§B11), e.g. `studio.status.reading_line` = "Reading line {current}/{total}" · "Get ready…" · "Your turn" · "Recording take 2" · "Checking…" · "Next · Repeat · Retake" · "Paused" · specific error + recovery action.
- **Breakpoints:** < 640 phone · 640–1024 tablet · 1024–1440 laptop · > 1440. No horizontal scroll at 320 px.
- **Accessibility:** WCAG 2.2 AA; keyboard shortcuts (Space pause/continue, → next, ← previous, R repeat, T retake, ? help); touch targets ≥ 44 px; ARIA live announcements; `aria-current` on the current chunk.
- **Surfaces:** project list, script import/review, preflight, recording studio, teleprompter, take review/export, settings.

## B10. Code standards (enforced; a task is not done while any rule fails)

**R1. Zero TypeScript errors.**
- `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch` in `packages/config/tsconfig.base.json`.
- `pnpm typecheck` (tsc / vue-tsc across all packages) must report **0 errors**.
- Banned: `any` (`@typescript-eslint/no-explicit-any`), `@ts-ignore`/`@ts-nocheck`, and `@ts-expect-error` without a written reason (`@typescript-eslint/ban-ts-comment`). Non-null `!` is also banned (`no-non-null-assertion`).

**R2. Zero lint errors and zero warnings.**
- `pnpm lint` runs with `--max-warnings=0`. Python: `ruff check` and `ruff format --check` clean, and `pyright` in strict mode clean.
- Disabling a rule inline needs `-- reason` and is reviewed in the task report.

**R3. No comparisons against raw string literals.** Values that come from a fixed set (states, intents, statuses, modes, block types, arrangements, error codes) are defined **once** as a `const` object in `packages/contracts` and referenced by name:

```ts
// packages/contracts/src/session-state.ts
export const SessionState = {
  Idle: 'idle',
  AssistantSpeaking: 'assistant_speaking',
  CreatorSpeaking: 'creator_speaking',
  Paused: 'paused',
  // …
} as const;
export type SessionState = (typeof SessionState)[keyof typeof SessionState];

// ✗ if (snapshot.state === 'paused')
// ✓ if (snapshot.state === SessionState.Paused)
```

- This applies to `===`, `!==`, `==`, `!=`, `switch`/`case` in TS, and expressions in Vue templates.
- `typeof x === 'string'` is allowed.
- Enforced by lint (`no-restricted-syntax` + `vue/no-restricted-syntax`):

```js
const noStringLiteralCompare = [
  { selector: "BinaryExpression[operator=/^[!=]==?$/][left.type!='UnaryExpression'] > Literal[raw=/^['\"]/]",
    message: 'Compare against a named constant (e.g. SessionState.Paused), not a string literal.' },
  { selector: "BinaryExpression[operator=/^[!=]==?$/] > TemplateLiteral[expressions.length=0]",
    message: 'Compare against a named constant, not a string literal.' },
  { selector: "SwitchCase > Literal[raw=/^['\"]/]",
    message: 'Use named constants in case labels.' },
];
```

- Python mirrors use `StrEnum` with the same values. Comparing against a raw `'paused'` string isn't allowed there either.

**R4. Lookup records instead of nested conditionals.**
- Nested ternaries are banned (`no-nested-ternary`, plus `vue/no-restricted-syntax` on `ConditionalExpression > ConditionalExpression` in templates). One simple ternary is fine.
- When a value depends on a key from a fixed set, map it in a `Record` typed over the full union, so a missing key is a type error:

```ts
// ✗ const label = s === 'paused' ? 'Paused' : s === 'creator_speaking' ? 'Your turn' : s === … ? … : '';
// ✓ (values are translation keys, §B11)
const STATUS_LABEL_KEY: Record<SessionState, MessageKey> = {
  [SessionState.Idle]: 'studio.status.ready',
  [SessionState.AssistantSpeaking]: 'studio.status.reading',
  [SessionState.CreatorSpeaking]: 'studio.status.your_turn',
  [SessionState.Paused]: 'studio.status.paused',
  // … compile error if any state is missing or a key doesn't exist
};
const label = t(STATUS_LABEL_KEY[snapshot.state]);
```

- Behavior maps use the same pattern, e.g. `Record<Intent, CommandHandler>`, `Record<Arrangement, ArrangementPolicy>`, and `Record<SessionState, Partial<Record<EventType, Transition>>>` for the engine's transition table.
- `if/else if` chains with more than two branches on the same key should be a record as well (review rule).
- Python: use `dict[MyEnum, T]` lookups with an exhaustiveness test.

**R5. No hard-coded user-facing text.** All UI copy goes through `t()` with a key from §B11. Enforced by `vue/no-bare-strings-in-template` (text, `title`, `aria-label`, `placeholder`, `alt`), which is part of the already-approved eslint-plugin-vue.

**R6. Enforcement.** Configure all of this in `packages/config/eslint` (flat config) and share it with every package in Task 0. CI fails on any violation. Each task report includes the `pnpm typecheck` and `pnpm lint` output.

## B11. Internationalization (i18n)

**Scope.** R1 is **English only** (`en`). All UI text still goes through i18n from day one, so another language can be added later by adding a locale file, without touching components. UI text includes labels, status language, errors and recovery hints, a11y text (`aria-label`, live announcements) and the privacy statement. The creator's **script content is never translated or changed** (§A6.5). Voice (TTS, STT, commands) is English in R1. Swagger/OpenAPI docs and `ApiError.message` are developer-facing and stay English.

**Setup.** `@nuxtjs/i18n` in `apps/web`, strategy `no_prefix` (no locale in URLs), `en` as default and fallback:

```
apps/web/i18n/locales/en.json   ← the only locale in R1; source of truth for keys
```

**Key rules.**
- Keys are **nested by feature** (`common`, `nav`, `studio`, `preflight`, `script`, `takes`, `settings`, `errors`, …), and **every key segment is snake_case**: `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`. Example: `studio.status.your_turn`, `errors.mic_permission_denied`.
- Interpolation placeholders are snake_case too: `"Recording take {take_number}"`.
- Plurals use vue-i18n's pipe syntax. Dates, times and numbers use `Intl` with the active locale. They are never concatenated by hand.
- Keys describe meaning, not wording (`studio.action.retake`, not `studio.try_again_button`).

```json
{ "studio": { "status": { "your_turn": "Your turn", "recording_take": "Recording take {take_number}" } } }
```

**Typed keys.** `MessageKey` is derived from `en.json` (vue-i18n `DefineLocaleMessage` augmentation), so `t('studio.status.typo')` is a type error (§B10 R1). Key-dependent copy uses `Record<Union, MessageKey>` (§B10 R4). API errors map `Record<ApiErrorCode, MessageKey>` → `errors.*`, so the UI never shows the raw `message`.

**Locale values.** `Locale` const in `packages/contracts` with only `Locale.En = 'en'` in R1 (§B10 R3). `User.locale` stores it (default `en`). There's no language switcher while only one locale exists.

**Locale test (unit, `pnpm test`).** Runs over every file in `i18n/locales/` and fails if a key segment isn't snake_case or a value is empty. It's written so that once a second file exists, it also fails on key sets that differ from `en.json` and on mismatched placeholders.

**Runtime.** Missing-key warnings are errors in dev and tests.

**Adding a language later** (new spec version) covers: a locale file plus the parity check, a switcher, and, for voice, per-language TTS/STT/grammar/segmentation/matching. The v0.7.0 change-log entry lists what a full German rollout touched.

## B12. Cloud speech (OpenAI) with a local fallback (user decision, v0.17.0)

**Why:** the user prefers hosted models to running speech locally. Tasks 7–8 remain valid and become the **offline fallback**.

**Shape**
- **Server-side only.** The browser never talks to OpenAI and never sees the key. Nitro routes proxy TTS and STT: `POST /api/speech/tts` (chunk text, voice, rate → cached audio) and `POST /api/speech/stt` (take audio → transcript). `OPENAI_API_KEY` lives only in the server environment (`.env`), is never logged, and never reaches responses or the client bundle.
- **Providers behind the existing interfaces** (§B3): `TTSProvider` / `STTProvider` get an OpenAI implementation (Nitro) and a local one (AI service). A `Record<SpeechProvider, …>` selects the provider per request. Default: OpenAI when the user has opted in and the network is up; otherwise local.
- **Consent (§A6.8).** A one-time opt-in names exactly what is sent (chunk text for TTS; take audio for STT), to whom (OpenAI), and that it's needed for cloud voices and transcription. It's stored in `UserSettings`, shown in preflight and in the privacy statement (Task 21), and can be revoked. Until then, everything stays local.
- **Word highlighting (§A6.4; user decision after Task 10a).** OpenAI TTS returns audio only. Derived timings (`whisper-1` word timestamps on the TTS audio) were measured at a median 90–100 ms and up to 560 ms off the audio (H-29 refuted), so **the cloud voice uses the `chunk` tier** (`timingSource: none`, `timings: null`). Word-level highlighting stays available with the local Kokoro voice (`word-provider`). No `aligned` timing source is added.
- **Caching.** TTS audio is cached by (text, voice, rate, model) on local storage (`Storage`), so repeats and re-takes cost nothing and start instantly (§B7 target ≤ 150 ms).
- **No dependency needed:** plain `fetch` to the REST API (no `openai` SDK) unless the spike shows a real need.
- **Timeouts and failure (Task 10a: 15% of TTS requests stalled > 30 s, one mid-stream):**
  - Timeouts: server-side per OpenAI attempt, TTS first byte 2 s (successful requests all started within 1.19 s), a stall timeout while streaming (no bytes for 2 s), and STT 4 s. With one retry, the worst case before the local fallback stays around 4 s (TTS) and 8 s (STT). The client's §B7 timeouts are revisited in Task 13 against these budgets.
  - One retry, then the local provider.
  - The next chunk (N+1, and N+2 when idle) is prefetched while the creator records chunk N, and served from the cache.
  - The engine's existing failure paths apply (`TTS_FAILED`, `EVAL_FAILED`).

**Chosen in Task 10a** (`docs/measurements/openai-speech-2026-09-28.md`):
- **TTS `gpt-4o-mini-tts`**, mp3, streamed: first byte p90 1.14 s, and `speed` works. About $0.015/min.
- **STT `gpt-transcribe`**, never prompted with the chunk text: the same decisions as local `base.en` on all Task 8 fixtures, p90 1.01 s per take, silent on noise, $0.0045/min. `gpt-4o-mini-transcribe` ($0.003/min) is a configurable option; it had one 4.3 s outlier. `gpt-4o-transcribe` invented text on a noise-only clip.
- **Cost:** ≈ $0.02–0.04 per 60-s script and ≈ $0.26–0.41 per 45-min session.
- **Consent-text facts:** OpenAI doesn't train on API data. The speech endpoints keep no application state, and abuse-monitoring logs are retained for up to 30 days.

---

# PART C — HOW WE TEST

## C1. Test modes

| Mode | What it proves | Tooling | Command |
|---|---|---|---|
| **Unit** | Pure logic: engine transitions, segmentation, offsets, grammar, matcher | Vitest / pytest | `pnpm test` |
| **Property** | Invariants hold for random inputs (text preservation, engine invariants) | fast-check | `pnpm test` |
| **Contract** | TS and Python accept/reject the same fixtures; API responses match schemas | Vitest + ajv, pytest + Pydantic | `pnpm test` |
| **Integration (DB)** | TypeORM entities, migrations, constraints, repositories against real PostgreSQL | Vitest + Supabase test project (`DATABASE_URL_TEST`, §C1.1) | `pnpm test:int` |
| **Integration (API)** | Nitro routes end-to-end against the test DB | Vitest + `$fetch` against a built server | `pnpm test:int` |
| **Synthetic audio** | VAD/STT/TTS on recorded WAV fixtures | pytest | `pnpm --filter ai test:audio` |
| **E2E browser** | UI flows, a11y, permission errors, fake media devices | Playwright (Chromium full; WebKit/Firefox smoke) | `pnpm test:e2e` |
| **Manual device** | Real audio/video quality, latency, leakage, routing | Checklist in C3; results in `docs/measurements/` | — |

### C1.1 Integration test database (Supabase)

- `pnpm test:int` reads `DATABASE_URL_TEST` from `.env` (gitignored). If it's missing, the run **fails** with a clear message. It never skips silently and never falls back to `DATABASE_URL`.
- **Safety guard:** the run refuses to start if `DATABASE_URL_TEST` reaches the same database as `DATABASE_URL`. Identity is the Supabase **project ref** (from the pooler user `postgres.<ref>` or the direct host `db.<ref>.supabase.co`) plus database name, so the transaction pooler (6543), session pooler (5432) and direct host of one project all count as the same database. Other hosts compare host (Neon `-pooler` folded) + port + database. Dev (Neon) and tests (Supabase) are on different providers, so this holds by construction; the guard still protects against copy-paste mistakes.
- **Isolated schema per run:** global setup creates a fresh schema `it_<timestamp>_<random>`, points the DataSource at it, and runs all migrations there. Tests never touch `public`, and two runs (local + CI) can't collide.
- **Between tests:** each test file truncates every table (`TRUNCATE … RESTART IDENTITY CASCADE`) in `beforeEach`. Integration files run serially (`fileParallelism: false`).
- **Server under test:** API tests run the built server (`.output/server/index.mjs`) with `DATABASE_URL` set to the test URL and a test-only `DB_SCHEMA` naming the run's schema. `DB_SCHEMA` is never set outside tests (default `public`). Migrations qualify every table with the DataSource schema instead of relying on `search_path`.
- **Always cleared afterwards:** global teardown drops the run's schema (`DROP SCHEMA … CASCADE`), on success or failure. Teardown also removes any leftover `it_*` schema older than 1 hour from a crashed run. After `pnpm test:int` the test database holds no test data.
- **Supabase specifics:**
  - Tests and migrations use the **session pooler** (`…pooler.supabase.com:5432`, user `postgres.<ref>`; IPv4). The app may use the transaction pooler (`:6543`). Nothing relies on session state (tables are schema-qualified), so both work.
  - TLS is always verified. Supabase signs with its own CA: download it (Dashboard → Database → SSL → Download certificate) to `certs/supabase-ca.crt` (gitignored) and set `DATABASE_URL_TEST_CA_CERT=certs/supabase-ca.crt` (relative to the repo root). The API tests hand it to the server under test as `DATABASE_URL_CA_CERT`. Neon needs no CA setting. `sslmode`/`pgbouncer` URL parameters are stripped so they can't override this.
  - Supabase exposes the `public` schema through its REST Data API, so every table (incl. `migrations`) gets **row-level security enabled with no policies**. That API's roles are denied; the app connects as the table owner, which bypasses RLS.
  - Connect timeout ≥ 15 s so a paused Supabase project or a Neon scale-to-zero cold start doesn't flake anything.
- **Neon (dev):** the pooled or direct string both work for the app; use the direct one for `db:migrate`.
- **E2E uses the same lifecycle (v0.18.0, Task 12):** `pnpm test:e2e` creates its own `it_*` schema on `DATABASE_URL_TEST`, seeds it, serves the built app on port 3100 against it (`tests/e2e/global-setup.ts`), and drops it afterwards, so UI flows that save (E1) run against a real database. Like `test:int`, it fails without `DATABASE_URL_TEST`.
- CI doesn't run `test:int` or `test:e2e` with a database yet. When it does, it'll use a `DATABASE_URL_TEST` repository secret.

**A mocked AI response does not prove a real recording flow works.** Any task touching capture, playback, or routing needs manual device evidence.

## C2. Test naming

Every test cites the acceptance criterion it proves: `it('T5-AC3: late eval result for chunk N is ignored during N+1', …)`.

## C3. Manual device checklist (per device × browser)

- [ ] Permission prompt appears only after the tap; indicator visible; tracks end on stop/navigation
- [ ] Voice preview audible; output selection supported or system default (recorded)
- [ ] Echo test result + chosen settle value
- [ ] 10 takes: first syllable not clipped
- [ ] A1: assistant leakage in 10 takes (0–3 scale)
- [ ] 20 attempts each of: repeat this line, retake, previous line, pause, continue, slower, next (hits / misses / false triggers)
- [ ] Background tab and lock screen behavior
- [ ] Recorded MIME type; per-take files play in a system player; stitched export plays
- [ ] Unplug mic / disconnect Bluetooth mid-take

## C4. End-to-end acceptance scenarios (from the brief)

| # | Scenario | Proven in task |
|---|---|---|
| E1 | Paste a script with headings, paragraphs, comma, full stop, table; mark spoken; move boundaries; wording preserved | 3, 12 |
| E2 | A1: assistant speaks, word highlight when timings exist; capture after playback + settle; auto and manual advance | 15 |
| E3 | Creator pauses mid-sentence for several seconds → no false advance, no erased speech | 5, 15 |
| E4 | Seven voice commands behave correctly per state; no take destroyed | 6, 16 |
| E5 | A2: preflight shows input/output where supported; routing failure explained with a safe alternative | 14 |
| E6 | No word-timing API → accurate chunk highlight, no simulated word-follow | 15 |
| E7 | Teleprompter: speech drives position; manual correction and autoscroll work | 20 |
| E8 | Permission denied, mic unplugged, AI service stopped, background tab, disk low, interrupted export → recoverable and truthful | 18 |
| E9 | ≥ 2 takes on one line, select one, export a reviewable video; originals recoverable | 17 |
| E10 | Late transcription for chunk N doesn't advance N+1 | 5, 13 |

---

# PART D — TASK PLAN (GATED)

## D0. How we work task by task

1. **One task at a time.** Only one task is `IN PROGRESS`. Tasks run in order unless marked parallel-safe.
2. **Before coding**, Claude restates the task's scope and plan in a few lines and flags anything unclear.
3. **Implement only what the task lists.** No work from future tasks, and no dependencies outside §B8 without updating it.
4. **Prove it:** run the task's tests and report the actual output. Any task that adds UI text adds its snake_case keys to `en.json` (§B11). `pnpm typecheck` and `pnpm lint` must show **0 errors and 0 warnings** (§B10). Manual checks are listed for the user to perform or confirm.
5. **Gate:** the task moves to `DONE` only when **the user confirms**. Claude then updates the status here and adds a change-log line (Part F). Claude doesn't start the next task before confirmation.
6. If a task reveals that the spec is wrong, stop, propose the spec change, and continue after approval.

Status values: `TODO` · `IN PROGRESS` · `AWAITING CONFIRMATION` · `DONE` · `BLOCKED`

## D1. Task overview

| # | Task | Status | Depends on |
|---|---|---|---|
| 0 | Monorepo foundation (Turborepo, Nuxt, FastAPI, CI) | DONE | — |
| 1 | User modelling & database (TypeORM + PostgreSQL) | DONE | 0 |
| 2 | Shared contracts & fixtures | DONE | 0 |
| 3 | Script model: parsing, segmentation, text preservation | DONE | 2 |
| 4 | Project, script & session persistence (entities + API) | DONE | 1, 3 |
| 5 | Session engine (state machine) | DONE | 2 |
| 6 | Command grammar & transcript matcher | DONE | 2 |
| 7 | Spike: TTS (Kokoro timings & latency, browser boundary events) | DONE | 0 |
| 8 | Spike: STT & VAD on the dev CPU | DONE | 0 |
| 9 | Spike: browser capture, echo/settle, pre-roll, MIME, stitching | IN PROGRESS | 0 |
| 10a | Spike: OpenAI speech (latency, cost, derived word timings, STT on the Task 8 fixtures) | DONE | 8 |
| 10 | Cloud speech via Nitro (OpenAI TTS/STT, consent, cache, timeouts, fallback hook) | DONE | 4, 10a |
| 10b | Local AI service fallback (Kokoro TTS + word timings, faster-whisper STT, real health) | IN PROGRESS | 7, 8, 10 |
| 11 | Design system & app shell | DONE | 0 |
| 12 | Script import & review UI | DONE | 4, 11 |
| 13 | Media adapters & effect runner | TODO | 5, 9, 10, 10b |
| 14 | Preflight UI | TODO | 13 |
| 15 | Recording studio: Listen & Repeat | TODO | 13, 14 |
| 16 | Voice commands wired | TODO | 6, 15 |
| 17 | Take review & export | TODO | 15 |
| 18 | Failure & recovery flows | TODO | 15 |
| 19 | Vertical slice acceptance & baseline | TODO | 12–18 |
| 20 | Teleprompter mode | TODO | 19 |
| 21 | Settings, favorites, scene cues | TODO | 19 |
| 22 | File imports (TXT, then DOCX/PDF) | TODO | 19 |
| — | Later (new spec needed): auth, cloud storage, hosted AI, Notion/Google Docs, extension, mobile | — | validation |

---

### Task 0 — Monorepo foundation

**What:** A Turborepo + pnpm monorepo containing `apps/web` (Nuxt 4 shell), `apps/ai` (FastAPI skeleton), empty packages from §B1, shared config, and a CI workflow.
**Why:** Every later task needs working build/test commands and package boundaries that enforce the architecture.
**Scope:**
- Prerequisites: Node 22 LTS (`.nvmrc`), `uv` (Python 3.12 pinned). PostgreSQL is hosted on Supabase (no local install, §B2) and ffmpeg moved to Task 9, because Homebrew no longer supports Intel macOS (see Part E)
- `turbo.json`, `pnpm-workspace.yaml`, root scripts (§B1), `packages/config` presets
- Nuxt 4 + Nuxt UI + Tailwind; `/api/health` returns `{ app: 'ok' }`
- `apps/ai`: FastAPI `/v0/health` (all capabilities `unavailable`), `package.json` scripts wrapping `uv run`
- ESLint rule: `packages/session-engine` can't import vue/nuxt/typeorm; client code can't import `packages/db`
- Shared strict tsconfig and ESLint flat config implementing all of §B10 (R1–R4), plus ruff + pyright strict for `apps/ai`
- `.gitignore`, GitHub Actions running typecheck, lint, test, build
**Tests:** Unit (a trivial test in each package runs) · E2E smoke (home page loads, zero `getUserMedia` calls) · pytest health test
**Done when:**
- [x] `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green from a clean clone
- [x] `pnpm dev` starts web + AI together through turbo
- [x] A second `pnpm build` is a turbo cache hit
- [x] The boundary lint rule fails when violated (demonstrated)
- [x] Each §B10 rule is demonstrated with a deliberately bad sample that fails lint/typecheck (string-literal comparison, `switch` on a literal, nested ternary in TS and in a Vue template, `any`, an incomplete `Record<Union, …>`); the samples are then removed
**Evidence (2026-09-24):**
- Clean copy (no node_modules/.venv/caches): `pnpm install --frozen-lockfile` → typecheck 9/9, lint 9/9, test 8/8 (7 Vitest + 1 pytest), build 1/1, test:e2e 2/2 (`--force`, no cache). All exit 0.
- `pnpm dev`: `GET :3000/api/health` → `{"app":"ok"}`; `GET :8008/v0/health` → all capabilities `unavailable`.
- Second `pnpm build`: `1 cached, 1 total … FULL TURBO` (263 ms).
- Bad samples caught: string-literal `===` (TS + Vue template), string `case` label, nested ternary (TS + template), `any`, non-null `!`, `vue` import in session-engine, `@repo/db` import in client code, `document` without the DOM lib, incomplete `Record<State, string>` (TS2741). `typeof v === 'string'` correctly allowed. `nuxt typecheck` catches errors in app, server and test files. Samples deleted.

### Task 1 — User modelling & database

**What:** `packages/db` with a TypeORM DataSource, the `User`, `UserSettings`, `VoiceFavorite`, `Device` entities, migrations, repositories, and a seeded local user. Nitro routes `GET/PATCH /api/me`, `GET/PATCH /api/me/settings`, `GET/POST /api/me/voices`, `DELETE /api/me/voices/:id`.
**Why:** Settings, favorites, per-device calibration, and project ownership all hang off a user. Modelling it now, with a single local user in R1, avoids a painful migration when auth arrives.
**Scope:**
- Entities as `EntitySchema` (§B2), UUID v7 ids, timestamps, `synchronize: false`, migrations only
- `pnpm db:migrate`, `db:seed` (idempotent local user + default settings)
- Nitro plugin that initializes the DataSource once; `typeorm`/`pg` external in the Nitro build
- Request bodies checked with typed guards for now; replaced by contract-schema validation (ajv) once Task 2 lands
- The `ApiError` shape (§B5.1) and an `ApiErrorCode` constant; one error helper used by every route
- `Locale` constant (§B11); `User.locale` accepts only `Locale` values (DB check constraint, default `en`); `PATCH /api/me` rejects others with `422`
- **Swagger / OpenAPI setup (§B5.1):**
  - Nitro OpenAPI enabled; JSON at `/api/openapi.json`, Swagger UI at `/api/docs`, production only with `API_DOCS_ENABLED=true`
  - All tags registered with descriptions
  - Shared component schemas (`User`, `UserSettings`, `UpdateSettingsRequest`, `VoiceFavorite`, `AddVoiceFavoriteRequest`, `Health`, `ApiError`), each with descriptions and examples
  - `/api/health` (now also reporting DB status), `/api/me`, `/api/me/settings` and `/api/me/voices` fully documented to the standard
- The same standard applied to FastAPI's `/v0/health`: `openapi_tags`, route summary/description, and model field descriptions and examples
- DataSource built only from `DATABASE_URL` (+ optional `DATABASE_URL_CA_CERT`; TLS verified, connect timeout ≥ 15 s; RLS on every table, §C1.1); a clear startup error when it's missing or unreachable
- Integration-test DB lifecycle per §C1.1: required `DATABASE_URL_TEST`, same-DB guard, per-run schema, truncate between tests, drop on teardown, stale-schema sweep
- `.env.example`: `DATABASE_URL`, `DATABASE_URL_TEST` (Neon dev, Supabase test, with placeholders and comments), `DATABASE_URL_TEST_CA_CERT`, `API_DOCS_ENABLED`
**Tests:**
- Integration (DB): the §C1.1 guard refuses a missing `DATABASE_URL_TEST` or one equal to `DATABASE_URL`; migrations up/down; unique constraints (email, favorite triple); 1:1 settings cascade
- Integration (API): `/api/me` returns the seeded user; PATCH settings persists valid values and rejects invalid ones with a `422` `ApiError`
- **OpenAPI completeness test** (web + AI service, §B5.1)
- Unit: repository helpers
**Done when:**
- [x] Fresh DB → `pnpm db:migrate && pnpm db:seed` → the local user exists; running seed twice creates no duplicates
- [x] `pnpm test:int` green against the Supabase test project, and afterwards the test DB has no `it_*` schemas left (checked with a query, also after a deliberately failing run)
- [x] `pnpm build` works with TypeORM (proves the Nitro bundling setup)
- [x] The ERD for these four entities is added to §B4 if it changed
- [ ] `/api/docs` shows every Task 1 route grouped by tag, with descriptions, request/response schemas and examples, and "Try it out" works against the local DB (screenshot)
- [ ] `/docs` on the AI service shows `/v0/health` under the Health tag, fully described
- [x] The completeness tests pass, and fail on a deliberately undocumented route and on a route missing its tag (demonstrated, then removed)

**Evidence so far (2026-09-24):**
- `pnpm typecheck` 9/9 · `pnpm lint` 9/9 (0 warnings) · `pnpm test` 8/8 tasks: contracts 3, db 21, web 20, ai 6 (pytest) · `pnpm build` ✓ · `pnpm test:e2e` 2/2 (the Playwright Chromium shell had to be reinstalled; its cache was missing).
- Built server without a DB: `/api/health` → `{"app":"ok","db":"unavailable"}`; `/api/me` → 503 `database_unavailable`; bad JSON → 400; invalid settings → 422 with `details`; docs 404 unless `API_DOCS_ENABLED=true`, then `/api/openapi.json` 200 and `/api/docs` 200 text/html.
- `pnpm test:int` without `DATABASE_URL_TEST` fails in both suites with `TestDatabaseConfigError` (no skip). `db:migrate` without `DATABASE_URL` prints the fix and exits 1.
- Completeness test demonstrated: a temporary `server/api/secret.get.ts` → "route file exists but is not documented"; removing `getMe`'s tag → "must have exactly one registered tag". Both reverted, 12/12 green. Permanent synthetic-bad-document cases are in `test/openapi.test.ts`.
- **Live databases (2026-09-24):** verified TLS to Neon (PostgreSQL 18.6, first connect 3.4 s: cold start) and Supabase (17.6, 0.4 s, own CA via `DATABASE_URL_TEST_CA_CERT`).
- Neon dev: `db:migrate` → `Applied: InitUsers1727136000000`; again → `No pending migrations.`; `db:seed` → `Created local user 01a0d391-…`; again → `… already exists.`; query: 1 user (1 local), 1 settings row; RLS on for all 5 tables.
- `pnpm test:int` (incl. build): db 13/13 + API 14/14, 45 s total (H-22 ✓). `db:test-schemas` → `No it_* schemas` after the green run and after a deliberately failing run (temporary failing file, removed).
- `pnpm dev` loads the repo-root `.env`: `/api/health` → `{"app":"ok","db":"ok"}`, `/api/me` → seeded user, `/api/docs` and `/api/openapi.json` → 200.
- **Manual checks for the user:** the two Swagger items below (screenshot of "Try it out" on `/api/docs`; `/docs` on the AI service).

### Task 2 — Shared contracts & fixtures

**What:** `packages/contracts`: JSON Schemas + TS types for §B5 payloads, Python Pydantic mirrors in `apps/ai`, and shared fixtures (valid/invalid per type, UTF-16 offset fixture, command grammar JSON).
**Why:** Web, engine, and AI service must agree on data exactly. Fixtures both runtimes test against catch drift early.
**Tests:** Contract (TS + Python load the same fixtures; valid ones pass, invalid ones fail; the UTF-16 fixture gives identical offsets)
**Done when:**
- [x] `pnpm test` and `pnpm --filter ai test` both pass the shared fixture suite
- [x] Contract version `0.1.0` recorded here and exported from the package (`CONTRACT_VERSION`, `package.json` version, Python `CONTRACT_VERSION`; envelope `v` is `0.1`)

**How it's built:**
- **Schemas** (JSON Schema 2020-12) live in `packages/contracts/src/schemas`, written with `objectSchema<T>()`: a property missing from the schema, an extra property, or a required key left out of `required` is a **compile error** (demonstrated). `pnpm --filter @repo/contracts schemas:emit` writes `schemas/<Type>.json`; a test fails when they're stale.
- **Contracts:** Envelope, WordTiming, TtsResult, TextSpan, MatchResult, CommandEvent, CommandGrammar (shared with Python) and the Task 1 request bodies UpdateMeRequest, UpdateSettingsRequest, AddVoiceFavoriteRequest (web only). Fixed value sets are constants: `TimingSource`, `MatchDecision`, `CommandSource` (+ existing `Intent`, `Locale`).
- **Messages ignore unknown fields** (`additionalProperties: true`, Pydantic `extra="ignore"`); **request bodies reject them**. Optional fields may be absent but never `null`, in both runtimes.
- **Cross-field rules** in both runtimes: `end ≥ start`, `charEnd ≥ charStart` (timings and spans), and **`timings` is null exactly when `timingSource` is `none`** (§A6.4, no fake word highlight). Envelope `v` must be `0.x`.
- **Validation:** `@repo/contracts/validation` (`validateContract(type, value)`, ajv) returns typed values or `{ path, issue }` lists. The web API now validates bodies with it (Task 1's typed guards are gone); text is trimmed after validation.
- **Python:** `apps/ai/app/contracts.py` (strict Pydantic, camelCase aliases, StrEnums) and `app/text_offsets.py` (UTF-16 ↔ code-point conversion; offsets inside a surrogate pair are rejected). The AI health endpoint takes `v` from `ENVELOPE_VERSION`.
- **Drift checks:** pytest compares every Pydantic model's properties/required and every enum with `schemas/*.json`; a web test compares the OpenAPI request-body schemas with the contract schemas.
- **Known difference:** JSON Schema treats `1.0` as an integer, strict Pydantic doesn't. No fixture relies on it; senders emit integers.

**Evidence (2026-09-24):** `pnpm typecheck` 9/9 · `pnpm lint` 9/9 (0 warnings; ruff + pyright strict 0) · `pnpm test`: contracts 86, db 28, web 23, ai 75 (pytest) · `pnpm build` ✓ · `pnpm test:e2e` 2/2 · `pnpm test:int` db 13 + API 14 (bodies validated by contract schemas through the built server). Drift demo: adding `Estimated` to TS `TimingSource` only → pytest `test_t2_enum_values_match_the_schemas[TtsResult-timingSource]` fails; restored → 75 passed. `objectSchema` demo: missing required key, extra property and missing property each fail typecheck.

### Task 3 — Script model

**What:** `packages/script-model`: paste parser (headings, `Note:` lines, `[Scene …]` cues, tables with row/column provenance) → `ScriptBlock[]`; segmentation modes short/sentence/paragraph/smart (`Intl.Segmenter`); boundary move/split/merge with stable chunk IDs; `normalize` + coverage assertion; `rechunkFrom(chunkId)` for mid-session size changes.
**Why:** The whole product depends on reading exactly what the creator wrote, in sensible pieces. Wording must never change.
**Tests:** Unit (each mode on fixtures; block typing) · Property (random boundary edits keep coverage; invalid AI boundaries snapped or rejected) · Unit (stable IDs across unrelated edits)
**Done when:**
- [x] E1 passes at the model level (fixture with headings, paragraphs, comma, full stop, table)
- [x] Property tests run ≥ 1,000 cases green
- [x] Headings, notes, and cues never appear in chunks unless re-typed as spoken

**How it's built (`packages/script-model`, pure TS):**
- **Parser:** `# ` headings, `Note:` lines, whole-line `[…]` scene cues, `- `/`* `/`•` bullets (one spoken block each), pipe tables and tab-separated tables (first row = header; one block per cell with `source.table` = index/row/column/header), everything else spoken paragraphs. Spoken table column: a header naming spoken text (script, line, dialogue, voice-over, narration, text, copy, words, read…), else the column with the longest cells; timestamp/number columns never. Header cells are headings, other body cells notes. Invariant: `paste.slice(source.start, source.end) === block.text`; markers go to `metadata.marker`.
- **Modes** (`DEFAULT_TUNING`, provisional until Task 19): `paragraph` = block; `sentence` = `Intl.Segmenter('en')` + abbreviation/initial merge (Dr., Mr., e.g., J.); `short` = breath groups ≤ 8 words split at `, ; :` and spaced dashes, tails < 3 words rejoin; `smart` = sentences ≤ 16 words whole, longer ones split at clauses, neighbouring sentences < 6 words merged up to 12.
- **Plan model:** cuts over the spoken stream; chunks partition it, so coverage holds by construction. Chunks may span blocks only via an explicit merge (one range per block). The first chunk after a scene cue carries `sceneCue`.
- **Edits** (`splitChunk`, `moveBoundary`, `mergeWithNext`, `rechunkFrom`, `retypeBlock`) return `EditResult` with a `ScriptEditError`, never throw, and snap to word starts.
- **Stable ids:** a chunk keeps its id iff its ranges are unchanged; changed chunks get new ids, so takes never move to different text (§B4). `reconcileBlockIds` keeps block ids across re-parses (LCS on type + text), so an edit to one paragraph leaves other blocks, and chunk ranges in them, stable. **Task 4 note:** block/chunk ids are logical ids that recur across script/plan versions, so the DB primary keys must be composite (`script_id, id` / `chunk_plan_id, id`) or use a separate row id.
- **AI proposals:** `applyBoundaryProposals` snaps each offset to a word start within 12 units or rejects it (`not_spoken`, `no_boundary_nearby`); paragraph breaks always remain cuts.
- **`checkCoverage` / `assertCoverage`** independently check rules 2–4 (uncovered, covered twice, unknown block, invalid range, empty chunk, order, text/spokenText mismatch, wording changed, duplicate ids) for plans from the DB/API/AI.
- **Types/constants** `BlockType`, `ChunkMode`, `ScriptBlock`, `ScriptChunk`, `ChunkPlan` live in `packages/contracts/src/script.ts` (JSON Schemas come with the Task 4 API).

**Evidence (2026-09-24):** script-model 50 tests (E1 ×4, parser 13, text 4, segmentation 7, edits/ids/proposals 9, coverage 7, **6 fast-check properties × 1,000 runs**: parse slices, coverage in every mode, random edit sequences + id stability, AI proposals, block-id stability, spokenText rule). The properties found two real issues, both fixed: cutting inside `now—then` changed wording after rejoin (→ whitespace-only boundaries), and an over-strict test premise. Repo: `pnpm typecheck` 9/9 · `pnpm lint` 9/9 · `pnpm test` (contracts 86, db 28, web 23, script-model 50, ai 75) · `pnpm build` ✓ · `pnpm test:e2e` 2/2 · `pnpm test:int` 13 + 14.

### Task 4 — Project, script & session persistence

**What:** Entities `Project`, `Script`, `ScriptBlock`, `ChunkPlan`, `ScriptChunk`, `Session`, `Take`, `Export` + migrations; the `Storage` interface with a local-disk implementation; Nitro routes from §B5 (projects, scripts, chunk plans, sessions, takes, exports).
**Why:** Sessions, positions, and takes must survive reloads and crashes, and takes must be structurally protected from deletion.
**Streaming rule:** take uploads are **streamed to disk**, never buffered in memory. Upload is two steps (user decision): `POST /api/sessions/:id/takes` (JSON metadata) creates the take row first, then `PUT /api/takes/:id/media` streams the raw body to `Storage` (temp file, then an atomic no-overwrite link; a second upload is a 409). `MAX_UPLOAD_BYTES` (default 2 GiB) → 413; free disk below the upload + `MIN_FREE_BYTES` (default 1 GiB) → 507. `GET /api/takes/:id/media` supports single `Range` requests (206/416).
**Design decisions (Task 4):**
- Chunk plans are immutable versions (user decision); `PATCH /api/chunk-plans/:id` is dropped. A client may reuse a chunk id from an earlier plan of the same script **only with identical ranges**, otherwise 422, so an id never points at different text.
- `script_blocks` PK `(script_id, id)`, `script_chunks` PK `(chunk_plan_id, id)` (Task 3 note). A take stores `chunk_plan_id` + `chunk_id` (composite FK), so it stays linked to that exact text, and to unchanged chunks in newer plans by id.
- Takes are protected structurally: a `BEFORE DELETE` trigger on `takes` raises, FKs to takes' parents are `RESTRICT`, the `Storage` interface has no delete, a deleted take can't be selected (CHECK), and removal is `deleted_at` with `confirm=true` plus a restore route.
- The server never trusts client text: scripts send block types + source ranges (text = `sourceText.slice`), plans send chunk ranges; the server rebuilds text with `@repo/script-model` and runs `assertCoverage` (422 `coverage_violation`).
- Pasted scripts keep their original text in `scripts.source_text` (B4's `original_asset_key` is for file imports, Task 22).
**Tests:** Integration (DB): partial unique index (one selected take per chunk); soft delete; takes keep their chunk link after a new chunk plan · Integration (API): create project → script → chunk plan (server rejects a plan that breaks coverage) → session → upload take (multipart, file on disk, row in DB) → select → delete without `confirm=true` is rejected
**Done when:**
- [x] All routes are covered by API integration tests
- [x] Uploading 3 takes for one chunk and selecting one leaves exactly one selected and all 3 recoverable
- [x] No code path hard-deletes a take (grep + test)

**How it's built:**
- `packages/db`: 8 entities + migration `InitRecording1727222400000` (§B4 Task 4 tables), repositories scoped to the owner/user (another user's id is "not found"), atomic conditional updates for autosave (`seq`) and media attach (write-once), ordinal allocation with retry, `parseInt8` for bigint.
- `packages/contracts`: `SessionState`, `TakeStatus`, `TakeKind`, `MediaType`, `ExportStatus`, `ExportKind`, `SourceKind`; 18 new contract schemas (requests + resources, each with a validated example and fixtures); `Storage` interface (no delete) + `StorageError`; ajv now checks `uuid`/`date-time`/`email` formats; a take's `kind` must match its MIME type.
- `packages/script-model`: `buildBlocks` (client types + ranges → blocks, text from the source) and `chunksFromRanges` (ranges → chunks, text rebuilt), property-tested against `segment` (1,000 runs).
- `apps/web`: 22 new routes; local-disk `Storage` (`STORAGE_DIR`, temp file + atomic no-overwrite link, `MAX_UPLOAD_BYTES`, `MIN_FREE_BYTES`, byte ranges); OpenAPI components for Task 4 are **generated from the contract schemas** (single source); completeness checker extended to binary bodies and 413/415/416/507.

**Evidence (2026-09-25):** `pnpm typecheck` 9/9 · `pnpm lint` 9/9 · `pnpm test`: contracts 164, db 36 (incl. the no-take-delete scan: 6 patterns over 40+ source files, plus a self-test that it catches offenders), script-model 54, web 30, ai 75 · `pnpm build` ✓ · `pnpm test:e2e` 2/2 · `pnpm test:int`: db 26 (trigger rejects raw `DELETE`, one-selected index, deleted-can't-be-selected CHECK, stale autosave, plan FK, concurrent ordinals, no re-linking), API 23 (every Task 4 route; 3 takes/one selected/all recoverable; write-once media, 413 with and without Content-Length leaving no file, 415, 206/416 ranges; confirm-gated soft delete + restore; coverage and id-reuse rejections; every response validated against its contract).
**Known:** an early 413 while the client is still streaming makes nitropack's graceful-shutdown hook log `Cannot set properties of null (setting '_isIdle')` (upstream; the server keeps serving). **Environment:** one db run failed on DNS (`ENOTFOUND` for the Supabase pooler) while the machine slept; the stale `it_*` schema it left was swept by the next run.
**Manual check for the user:** `/api/docs` shows the Projects/Scripts/Chunk Plans/Sessions/Takes/Exports tags with their operations.

### Task 5 — Session engine

**What:** `packages/session-engine`: a pure reducer implementing §B6 (states, transitions, guards, effects, timers as effects, stale guard, 300 ms tap coalescing, command permission matrix).
**Why:** Timing and cancellation bugs are the biggest risk to takes. A deterministic, hardware-free engine makes them testable.
**Tests:** Unit (table-driven over every transition row and every state × intent cell) · Property (invariants 1–5) · Golden event-log replays for E3 and E10
**Done when:**
- [x] 100% of transition rows and matrix cells have a test
- [x] E3 (mid-sentence pause never advances) and E10 (late result ignored) green
- [x] Zero imports from vue/nuxt/DOM/typeorm (lint enforced)

**Evidence (2026-09-28):** `packages/session-engine` 343 tests: 21 transition-row tests (`B6-R01`…`B6-R21`) + 7 detail tests; the §B6 matrix copied verbatim and checked cell by cell for voice, touch and keyboard, both via `isCommandAllowed` and end-to-end through `step` (6 rows × 9 columns × every intent × 3 sources), plus the 5 states outside the matrix; invariants 1–5 and the stale-token rule as fast-check properties (1,000 random sessions each, stale tokens mixed in); golden replays `tests/fixtures/golden/e3-mid-sentence-pause.json` and `e10-late-result.json` (state, chunk and effects after every event); a purity test (imports only `@repo/contracts`; no clock, randomness, timers or globals). A temporary `vue` import in `src/` fails both lint and the purity test. Repo: typecheck 9/9 · lint 9/9 · `pnpm test` (contracts 164, db 36, script-model 54, session-engine 343, web 30, ai 75) · build ✓ · e2e 2/2 · test:int 26 + 23.

### Task 6 — Command grammar & transcript matcher

**What:** A normalizer, a grammar matcher (§B5 table → `CommandEvent | null`), and a transcript aligner → `MatchResult` (§B7 thresholds + end-token rule); command-vs-script-speech separation.
**Why:** Commands must work reliably without script lines like "Next, we repeat…" triggering them, and advancement must never skip unfinished lines.
**Tests:** Unit (every synonym → intent; near-misses → null; "Next, we repeat the process" as script speech → no command; paraphrase → advance; half-delivered → ask; ending omitted → ask)
**Done when:**
- [x] All grammar and matcher fixtures green
- [x] Thresholds read from settings, not hard-coded

**How it's built** (`packages/script-model/src/matching/`, pure TS, next to the text/offset logic):
- **Normalizer** (`matchTokens`): case, punctuation, accents, contractions ("we're" → "we are", "gonna" → "going to"), numbers and ordinals to words ("3" → "three", "1,000", "3.5", "2nd"), `&`/`%`. Script and transcript go through the same function; every token keeps the UTF-16 range of its source word.
- **Grammar** (`compileGrammar`, `matchCommand`): a command is the *whole* utterance (after trimming fillers: um, uh, okay, please…) matching one phrase exactly; `{target}` phrases capture the rest as `args.target` (resolving it to a chunk id is Task 16). Aliases only add phrases; an alias that collides with another intent's built-in phrase is rejected (reported in `rejectedAliases`), so PAUSE can't be lost.
- **Command vs script speech** (`classifyUtterance`): if the remaining chunk text contains the utterance (containment ≥ 0.5) it's script speech, even when it's also a grammar phrase ("Next." / "Stop scrolling…"). Returns the `speechGate` the engine uses for ✓* cells. `SpeechGate` moved to `packages/contracts`.
- **Transcript matcher** (`matchTranscript(chunkText, transcript, thresholds)` → `MatchResult`): token LCS with fuzzy equality for words ≥ 4 letters (edit-distance ratio ≥ 0.8); coverage = heard chunk words / chunk words; similarity = Dice (extra words count against it); **end rule**: the last heard chunk word is among the final 3 (§B7 "±2"). `missingSpans` point into the chunk text; `reasons` explain each check. Thresholds are a required argument; `thresholdsFrom(settings)` falls back to `DEFAULT_MATCH_THRESHOLDS`.

**Evidence (2026-09-28):** 84 matching tests: every phrase of the en grammar → its intent; 12 real-world variants; 14 near-misses → null; 7 classification cases incl. "Next, we repeat the process" → script speech; 12 transcript fixtures (`tests/fixtures/matching/`) incl. paraphrase → advance, half-delivered → ask, ending omitted → ask (coverage 0.85 but ending not heard), last word dropped → advance, skipped middle / rambling / said twice / silence → ask, with expected missing spans; settings-driven thresholds (same take asks or advances); property test (1,000 runs: the chunk itself always advances, silence never does, spans stay in range). Every command/result validates against its contract. Repo: typecheck 9/9 · lint 9/9 · `pnpm test` all green (script-model 138) · build ✓ · e2e 2/2.

### Task 7 — Spike: TTS *(parallel-safe with 8, 9; timebox 1 day; throwaway code)*

**What:** Measure Kokoro on this Intel CPU (cold/warm latency, RAM, disk), check whether it exposes word timings (or whether aligning the generated audio gives ≤ 50 ms error), verify licenses for weights and voices, and probe browser `boundary` events in Chrome/Safari/Firefox.
**Why:** Decides whether word-level assistant highlighting is real or falls back to chunk highlighting, and whether prefetching is needed.
**Tests:** Manual + scripted measurements → `docs/measurements/tts-<date>.md`
**Done when:**
- [x] A measurements doc with tables and a recommendation (`docs/measurements/tts-2026-09-28.md`)
- [x] Part E hypotheses H-10/H-11 updated to validated or refuted
- [ ] Browser boundary events on the device matrix: `spikes/tts/boundary.html` run by the user in Chrome and Safari on this Mac, on iPhone Safari and on Android Chrome (Chromium headless on this Mac: all 10 word starts reported)

### Task 8 — Spike: STT & VAD *(parallel-safe; timebox 1.5 days)*

**What:** faster-whisper `tiny.en`/`base.en`/`small.en` int8 latency and WER on fixtures (clean, noisy, paused, paraphrased); whether biasing with the chunk text inflates matches; in-browser AudioWorklet VAD vs. Silero (latency, false starts, assistant bleed).
**Why:** Picks the STT model and VAD approach that meet the latency targets on the real hardware.
**Tests:** Synthetic audio (pytest) + manual → `docs/measurements/stt-vad-<date>.md`
**Done when:**
- [x] A model and VAD approach chosen with numbers; §B8 updated (≤ 1 candidate kept per interface): `docs/measurements/stt-vad-2026-09-28.md`
- [x] H-14, H-15, H-17 updated (and H-27 added for Task 9)
- [ ] Optional: real takes from the user (5–10 WAVs) to confirm accuracy on real voices; the fixtures so far are synthetic

### Task 9 — Spike: browser capture *(parallel-safe; timebox 1.5 days)*

**What:** On each available device: permission flow and track lifecycle; LAN HTTPS (mkcert); echo tail with echo cancellation on/off → settle; rolling-recorder pre-roll vs. start-at-VAD (clipping over 10 takes); supported MIME types and sizes; client-side stitching without ffmpeg.wasm; `setSinkId`/`selectAudioOutput` behavior with a Bluetooth earbud.
**Why:** Recording behavior varies by browser and device. Real numbers decide the capture strategy before the UI is built on top of it.
**Tests:** Manual device checklist (C3) → `docs/measurements/device-matrix.md`
**Done when:**
- [ ] The first device-matrix pass is recorded; a capture strategy is recommended
- [ ] H-12, H-13, H-18, H-19 updated

### Task 10a — Spike: OpenAI speech *(timebox 1 day; throwaway code)*

**What:** Against the OpenAI API with the user's key: TTS latency to first byte / full audio for short, medium and long chunks; STT latency and decisions on the Task 8 fixtures (through the Task 6 matcher, as in `spikes/stt/score.ts`); word-timestamp alignment of TTS audio (start-time error against the audio, fraction of chunks fully aligned); cost per 60-s script and per 45-min session; data-retention terms to state in the privacy notice.
**Tests:** scripted measurements → `docs/measurements/openai-speech-<date>.md`
**Done when:**
- [x] Models chosen with numbers; H-28, H-29, H-30 updated
- [x] The privacy statement's facts (what is sent, retention) are written down with sources

**Evidence (2026-09-28):** `docs/measurements/openai-speech-2026-09-28.md`, with raw data in `spikes/openai/results/` and `spikes/stt/results/stt-openai-*.json`. Only synthetic text and takes were sent.
- **TTS:** 3 models × 3 lengths × mp3/wav × 3 runs, a speed check, and a 20-request tail test (17 succeeded with p90 1.14 s; 3 stalled past 30 s).
- **STT:** 4 models × 50 Task 8 fixtures, scored with the app's matcher: 0 false advances for every model.
- **Derived word timings:** 14 chunks × 3 voices. 12–13 of 14 chunks were fully aligned, but start errors had a median of 90–100 ms and a max of 560 ms, with only 25–36% within 50 ms.
- **User decision:** chunk highlighting for the cloud voice.

### Task 10 — Cloud speech via Nitro

**What:** the OpenAI half of §B12, in `apps/web/server`, with the local AI service reached only through an HTTP contract (implemented for real in Task 10b):
- **Routes (tag Speech, §B5.1):**
  - `POST /api/speech/tts` `{text, voiceId?, rate?}` → `SpeechTtsResult`: `TtsResult` plus `provider`, `voiceId`, `cached`. `rate`/`voiceId` default to the user's settings.
  - `GET /api/speech/audio/:key`: the cached audio, with `Range`.
  - `POST /api/speech/stt?sessionId&chunkId&seq`: a raw audio body (≤ 25 MB) → `SpeechSttResult` (text, provider, echoed ids).
  - `GET /api/speech/voices`: OpenAI and local voices.
- **Provider choice:** OpenAI only if the user has consented (`UserSettings.cloudSpeechConsentAt`, set through `PATCH /api/me/settings {cloudSpeechConsent}`) and `OPENAI_API_KEY` is set. Otherwise the local AI service (`AI_SERVICE_URL`). If neither is available: 503 `speech_unavailable`.
- **OpenAI calls:**
  - TTS `gpt-4o-mini-tts`, mp3, `speed` = rate. STT `gpt-transcribe`, `language=en`, **never a prompt**.
  - Plain `fetch`; the key is sent only in the `Authorization` header.
  - The §B12 per-attempt timeouts (first byte 2 s, stall 2 s, STT 4 s) and one retry, then local.
  - TTS audio is streamed from OpenAI straight into `Storage` (never buffered whole) under a key hashed from provider, model, voice, rate and text, with a metadata object beside it (duration from the mp3 frames).
- **Health:** `GET /api/health` adds `speech: {openai, local}`. OpenAI: `unavailable` without a key, otherwise a cached 1 s probe. Local: the AI service's `/v0/health` with a 1 s timeout.
- **The AI-service contract** (`/v0/tts`, `/v0/tts/audio/:key`, `/v0/stt`, `/v0/tts/voices`, `/v0/health`) is fixed in `packages/contracts` now; Task 10b implements it.

**Why:** the creator gets fast cloud voices and transcription after an explicit opt-in, and the app keeps working when the cloud stalls.
**Tests:**
- **Unit:** cache key, mp3 duration, provider choice, timeout/stall/retry logic against scripted fake streams.
- **Integration:** the built server against a fake OpenAI and a fake AI service (behaviour chosen per request), plus a per-run DB schema.
- **Contract:** every response validates against its schema; completeness of the OpenAPI docs.
- **Manual:** one real call each for TTS and STT with the user's key and consent.
**Done when:**
- [x] Without consent, no request reaches OpenAI (test)
- [x] A second identical TTS request is served from cache and makes no upstream call (test)
- [x] A stalled (before or during the stream), failing or rate-limited OpenAI request is retried once and then served by the local provider (test)
- [x] The key never appears in responses, server logs, or the client bundle/page (test)
- [x] `/api/health` reports both speech providers; `/api/docs` documents the Speech routes

**How it's built:**
- **Contracts:** `SpeechProvider`, `TtsRequest`, `SpeechTtsResult`, `SttTranscript`, `SpeechSttResult`, `SpeechVoice`, `SpeechLimits`, `AiCapabilityStatus`; `ApiErrorCode.SpeechUnavailable` and `MethodNotAllowed`. `TtsRequest`, `SttTranscript` and `SpeechVoice` are shared with Python (Pydantic mirrors; the drift tests cover them).
- **Consent:** `UserSettings.cloudSpeechConsentAt` (migration `CloudSpeechConsent1727308800000`, a nullable column), set by `PATCH /api/me/settings {cloudSpeechConsent}`. The first consent's time is kept; `false` clears it.
- **`server/utils/speech/`:**
  - `config` (env: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_TTS_MODEL`, `OPENAI_STT_MODEL`, `AI_SERVICE_URL`, per-attempt timeouts). The key is not in `runtimeConfig`, so it can't reach the client.
  - `openai`: plain `fetch`. TTS asks for mp3 with `speed` = rate; STT is multipart with `language=en` and no prompt.
  - `guarded-stream`: first-byte and stall deadlines, measured from the request start; on failure it aborts the upstream and cancels the reader.
  - `local`: the `/v0` client; every response is validated against the contracts, and audio is fetched only from the service's own `/v0/` paths.
  - `cache`: write-once `speech/<sha256>.audio` + `.json` in `Storage`. A concurrent identical request counts as success, and a failed stream leaves no clip.
  - `mp3`: duration from the frame headers; it matches `afinfo` on a real OpenAI clip.
  - `service`: provider order by consent and key, `Record<SpeechProvider, …>` dispatch, and one retry for transient failures only (not for a bad key or a rejected request). Failures are logged by kind only, and the 503 `details` names each provider's failure.
- **Health:** OpenAI health never calls OpenAI: `unavailable` without a key, `degraded` after a failure in the last minute. The local health reads `/v0/health` with a 1 s timeout.
- **Routes:** `POST /api/speech/tts`, `GET /api/speech/audio/:key` (Range, through the shared `sendStoredObject`, which the take media route now also uses), `POST /api/speech/stt` (415/413/422 checks), `GET /api/speech/voices`, and the Speech tag in the docs.

**Evidence (2026-09-29):**
- `pnpm typecheck` 9/9 · `pnpm lint` 9/9 (0 warnings; ruff + pyright strict 0).
- `pnpm test`: contracts 193, db 37, script-model 144, session-engine 343, ui 17, **web 54** (+16: mp3 incl. the real clip, guarded stream, provider choice, cache key, voices, retry incl. no retry on a bad key, config, the `/api` fallback), **ai 96** (+21 fixture/drift cases), media-adapters 1.
- `pnpm test:int`: db 26 (the migration round trip includes the consent column), **web 39** (+15 against a fake OpenAI and a fake AI service):
  - no OpenAI call without consent
  - consent stored and revoked
  - the exact OpenAI request (model, voice, speed, mp3, auth), duration, chunk highlight, Range, and a cached repeat with no upstream call
  - no first byte, a stall mid-stream, a 500 and a 429 each retried once and then local, all within 3 s
  - a flaky first attempt succeeding on retry
  - 503 with per-provider details
  - STT without a prompt, in English, echoing ids, falling back to local
  - 415/413/422 checks
  - voices and health
  - 404/405 ApiErrors
  - the key absent from responses, pages, the server log (even when OpenAI echoes it) and `.output/public`
- `pnpm build` ✓ · `pnpm test:e2e` 13/13.
- **Real check (the user's key, consent simulated in context, not in the DB):**
  - TTS "Here it is, finally. Let us open it together." → OpenAI, 1.38 s to a fully cached clip, 3,864 ms of audio (by the frame count); an identical repeat was served from the cache in 1 ms.
  - STT on the Task 8 clip → "Welcome back to the channel, everyone." in 0.81 s, with `chunkId`/`seq` echoed.
- **Found while checking the dev server (fixed):**
  - Unknown `/api` paths and wrong methods returned the page renderer's error JSON with a stack trace. Now they return `ApiError` 404/405.
  - The Neon dev DB lacked the new column (`/api/me/settings` → 500); `pnpm db:migrate` applied it.
  - A dev server started before `OPENAI_API_KEY` was added doesn't see the key until it's restarted.

### Task 10b — Local AI service fallback

**What:** `apps/ai` implements the Task 10 contract for real:
- Kokoro-82M through kokoro-onnx, the timestamped fp32 export, voice `af_heart` by default. Word start times come from phoneme durations mapped onto script words (Task 7); when the mapping doesn't add up, `timingSource: none`.
- faster-whisper `base.en` int8, greedy, no prompt (Task 8).
- A disk cache for TTS audio.
- `/v0/health` reports real model status (loading → available). Models load from `models/` at startup.
- Cancellation on client disconnect. Every route documented in `/docs` (tags Health, TTS, STT).
**Tests:** pytest with injected fake engines (default `pnpm --filter ai test`), plus `test:models` with the real models (TTS returns audio and timings for the E1 lines; STT on the Task 8 fixtures); contract (responses validate against the shared schemas).
**Done when:**
- [ ] `pnpm --filter ai test` green; the health endpoint reflects real model status
- [ ] With consent off, the web app reads and transcribes through the local service end to end (manual)
- [ ] A second identical TTS request is served from the AI service's cache

### Task 11 — Design system & app shell

**What:** Token CSS (dark studio + light), Nuxt UI theme mapping, layout shell, status components (StatusPill, CaptureIndicator, DecisionBar, ChunkText with three highlight tiers) as props-only components, and a dev `/_design` page. **i18n setup (§B11):** `@nuxtjs/i18n`, `en.json`, typed `MessageKey`, and lint rule §B10 R5.
**Why:** Clear, calm, unmistakable recording status is part of the product, and later UI tasks build on these pieces. Doing i18n now means no later task hard-codes text, so more languages can be added later without rework.
**Tests:** Unit (component rendering; `chunk` tier renders no word-level markers; **locale test**) · E2E (contrast test on token pairs; reduced-motion check; raw-hex lint; shell + `/_design` with zero missing-key warnings)
**Done when:**
- [x] Screenshots of `/_design` at 360, 768, 1280, and 1728 widths: `docs/screenshots/task-11/design-<width>.png` (written by the E2E run)
- [x] Every status shows icon + text (unit: `STUDIO_STATUS` covers every `SessionState`; E2E on `/_design`)
- [x] The locale test and R5 lint fail on deliberate bad samples (a camelCase key, an empty value, a bare string in a template), then the samples are removed
- [x] From Task 11 on, every UI task adds its keys to `en.json`

**Implementation notes (Task 11):**
- **`packages/ui` is a Nuxt layer** (`apps/web` extends it): `app/assets/css/tokens.css` (the only file with raw hex; dark in `:root, .dark`, light in `.light`, radii, motion, teleprompter scale, 44 px target), `theme.css` (Tailwind `@theme inline` utilities such as `bg-canvas`, `text-ink-muted`, `text-live`, `text-prompter-3`, plus Nuxt UI's `--ui-*` variables mapped to the tokens, unlayered so they win in both modes), and `app/components/` StatusPill, CaptureIndicator, DecisionBar, ChunkText. The components are **props-only and text-agnostic**: they take already-translated strings, so i18n stays in the app.
- **Contracts:** `HighlightTier`, `ReadingState`, `StatusTone`, `CaptureState`, `DecisionAction` (a subset of `Intent`) in `packages/contracts/src/ui.ts`.
- **ChunkText:** word segments come from `chunkSegments()` (property test: they always concatenate to the exact chunk text). Invalid spans (overlapping, out of order, out of range) fall back to `chunk` instead of guessing. `word-provider` gets a full highlight, `word-approx` an underline, `chunk` no word markers. Only the current chunk has `aria-current`.
- **i18n:** `@nuxtjs/i18n` (`no_prefix`, `en` only, no browser detection). `MessageKey` = every dotted leaf path of `en.json`. `useT()` is the one typed wrapper, and lint forbids `useI18n()`/`$t` elsewhere in `app/`. A missing key logs `console.error`, and the E2E run fails on any console error or warning. `vue/no-bare-strings-in-template` (R5) is on in the shared config.
- **Status language:** `app/utils/studio-status.ts`: `Record<SessionState, {icon, tone, label}>`, `Record<CaptureState, MessageKey>`, `Record<DecisionAction, MessageKey>`.
- **Theme:** color mode is dark by default; the shell's theme switch toggles light/dark. Reduced motion (OS setting, or `data-reduced-motion` on `<html>` for the Task 18 setting) zeroes the motion tokens; animations use `motion-safe:`.
- **`/_design`** is on in `nuxt dev` and otherwise 404 unless `NUXT_PUBLIC_DESIGN_PAGE_ENABLED=true` (the E2E server sets it).
- **Deviation (tighter than specified):** the **contrast check** and the **raw-hex lint** run as unit tests (`packages/ui/test/contrast.test.ts` over every foreground/background pair the components use, in both themes, ≥ 4.5 for text and ≥ 3 for UI; `raw-hex.test.ts` over `packages/ui` and `apps/web/app`). Reading hex straight from `tokens.css` is deterministic, whereas computed browser colors would need a page per pair. The E2E suite covers reduced motion, the shell, missing keys, theme switching, tiers, and no horizontal scroll at 320 px plus the 4 widths.
- The 320 px check found a real overflow (header); on phones the nav now wraps to its own row.

### Task 12 — Script import & review UI

**What:** Paste/editor page → block preview with type chips (changeable), table column picker, chunk mode picker, drag/keyboard boundary editing, live coverage check, save through the Task 4 API.
**Why:** The creator must trust that what will be read is exactly what they wrote.
**Tests:** E2E (E1 through the UI; keyboard-only boundary editing) · Integration (saved plan round-trips)
**Done when:**
- [x] E1 green in Playwright; screenshots at 4 widths (`docs/screenshots/task-12/import-<width>.png`)

**How it's built:**
- **`/import`** (`apps/web/app/pages/import.vue`), linked from the header and the projects page:
  - project title and paste area; blocks re-parse 150 ms after typing stops, and `reconcileBlockIds` keeps the user's re-typing on unchanged blocks
  - block list with a type chip per block (a native select: spoken, heading, note, scene cue)
  - per-table spoken-column picker (`tablesOf` / `setSpokenColumn`; header cells stay headings, the others become notes)
  - chunk-size radio group (short, sentence, paragraph, smart)
  - a live coverage pill (`checkCoverage`) and a chunk and word count
  - save is disabled until there's a title, at least one chunk and zero coverage issues
- **ChunkEditor** (`app/components/script/ChunkEditor.vue`):
  - Mouse: click a word to split before it; drag a boundary handle onto a word to move the boundary (`moveBoundary`); use the merge button (`mergeWithNext`).
  - Keyboard: every chunk and boundary is a tab stop. On a boundary, ↑/← and ↓/→ move it one word (`nudgeBoundary`, new in script-model), and Delete/Backspace merges. On a chunk, Enter starts split mode (arrow keys pick the word, Enter splits, Escape cancels). After an edit, focus returns to the same position.
  - A refused edit (e.g. emptying a neighbour) leaves the plan unchanged and announces why (`Record<ScriptEditError, MessageKey>`, `aria-live`).
  - Words and the gaps between them come from the block text (`chunkWords`) and are rendered with `v-text`, so the rendered text is the chunk text verbatim.
- **Re-segmenting:** changing the text, a block type or the chunk size re-segments and discards boundary edits (stated on the page).
- **Save:** `POST /api/projects` → `POST /api/projects/:id/scripts` (types + ranges only, `blockInputs`) → `POST /api/scripts/:id/chunk-plans` (ranges only; the server's block ids are mapped by block order, `planInputs`). The server rebuilds all text and checks coverage again. API errors are shown as `Record<ApiErrorCode, MessageKey>` → `errors.*`; with no response, `errors.network`.
- **Projects page:** lists real projects (`GET /api/projects`) with a localized updated date (`Intl`, via `useLocaleTag()`), plus an empty state and an error state.
- **Contracts:** `KeyboardKey` (§B10 R3 for key handling).
- **script-model:** `nudgeBoundary`/`BoundaryStep`, `tablesOf`, `setSpokenColumn`; `wordsIn` is exported.
- **Type safety:** `vueCompilerOptions.checkUnknownComponents` is on, so a misnamed component is a type error. It caught this task's first bug: a component rendered nothing because Nuxt prefixes components in sub-folders (`ScriptChunkEditor`).
- **E2E against a real database** (§C1.1).

**Evidence (2026-09-28):**
- `pnpm typecheck` 9/9 and `pnpm lint` 9/9 (0 warnings).
- `pnpm test`: contracts 164, db 36, script-model 144, session-engine 343, ui 17, web 38, ai 75, media-adapters 1.
  - script-model +6: nudge (incl. a 1,000-run coverage property) and the column picker.
  - web +3: `chunkWords` rebuilds chunk text verbatim across a merge; block and plan inputs carry no text and map ids by order.
- `pnpm test:int`: db 26, web 24 (+1 **plan round-trip**: column picker, split, move, nudge and merge in the model, then save; the stored text, spokenText, scene cues and range positions equal the edited plan, and the re-typed blocks are stored).
- `pnpm build` ✓.
- `pnpm test:e2e` 13/13 (+4):
  - **T12-E1** through the UI: 17 typed blocks, sentence chunks, mark a table note spoken, split by click, move by drag, merge across a paragraph break, save; the saved plan equals the UI, and its wording equals the spoken blocks.
  - The column picker switches the column that's read.
  - **Keyboard-only editing:** Tab to the title, the source and a boundary; arrows move it (and are refused at the limit); Delete merges; Enter/arrows/Enter split; Escape cancels.
  - No horizontal scroll from 320 px, plus the 4 screenshots.
- **Screenshot note:** the Save bar is `sticky` at the bottom of the chunk column, so in full-page screenshots it appears where the first viewport ended.

### Task 13 — Media adapters & effect runner

**What:** `packages/media-adapters` (mic, camera, audio output, take recorder with pre-roll, per Task 9's findings) and the effect runner that connects engine effects to adapters, AI clients, OPFS buffering, and take upload, with the stale guard and abort handling.
**Why:** This is where the real hardware meets the deterministic engine, so it needs to be correct under cancellation.
**Tests:** Unit (runner with fake adapters: every effect type; aborts on state exit) · E2E with fake media (take is recorded, buffered in OPFS, uploaded) · Manual (C3 subset)
**Done when:**
- [ ] E10 green end-to-end in the browser
- [ ] Killing the tab mid-take → on reload the take is recovered from OPFS as `interrupted`

### Task 14 — Preflight UI

**What:** Permission explanation → explicit Allow → mic level + selector → voice test (with an "Where did you hear it?" confirmation) → echo test (stores settle on the Device) → camera preview + MIME → AI health → capability summary; Start enabled only when minimum capabilities exist.
**Why:** Truthful setup avoids failed recordings and false compatibility claims.
**Tests:** E2E (zero `getUserMedia` before Allow; permission-denied path; AI-down path) · Manual (E5 on a headset)
**Done when:**
- [ ] E5 recorded with device evidence

### Task 15 — Recording studio: Listen & Repeat

**What:** The studio screen driving the engine: current chunk (dominant), highlight tiers, status bar, settle countdown, "Your turn", recording indicator, decision bar, take chips, keyboard shortcuts, auto/manual/practice modes, autosave of the session snapshot.
**Why:** The core loop of the product.
**Tests:** E2E with fake audio (E2 auto and manual; E3; E6) · Manual (A1 on the dev laptop + one phone: full 60-s script)
**Done when:**
- [ ] E2, E3, E6 green; a 60-s script completed on a real device with notes recorded

### Task 16 — Voice commands wired

**What:** Command recognition through STT/grammar gated by the permission matrix; recognized-command toast with Undo for navigation; HELP overlay.
**Tests:** E2E (E4 with fake audio utterances) · Manual (20 attempts × 7 commands per C3)
**Done when:**
- [ ] E4 green; hit/miss/false-trigger rates recorded

### Task 17 — Take review & export

**What:** Review grid (chunks × takes), play, select (★), mark unusable, delete with confirmation (soft), per-take download, stitched export only where Task 9 proved it works (otherwise explained), truthful progress/failure.
**Tests:** E2E (E9) · Integration (Export entity lifecycle) · Manual (exported files play in a system player)
**Done when:**
- [ ] E9 green on the supported browsers

### Task 18 — Failure & recovery flows

**What:** Permission denied/revoked, device unplugged → `recovering`, AI service down → degraded mode banner, background tab → pause, low storage (quota check) → warn/block, interrupted export → retry, repeated taps → coalesced.
**Tests:** E2E (E8, each trigger simulated) · Manual (unplug mic, Bluetooth disconnect, lock screen)
**Done when:**
- [ ] E8 green; no trigger loses a take (M6 = 0)

### Task 19 — Vertical slice acceptance & baseline

**What:** Run E1–E6 and E8–E10 in full; run the 60-s script ×5 and the long scenario ×1; record M1–M7; revise the provisional thresholds (§A7, §B7) from the data; publish the device matrix.
**Why:** Confirms R1's core promise with real measurements, not assumptions.
**Done when:**
- [ ] The metrics report is in `docs/measurements/baseline-<date>.md`; the spec version is bumped with the revised thresholds
- [ ] M6 = 0 and M7 = 0

### Task 20 — Teleprompter mode

**What:** Large mirrorable display, adjustable size/spacing, autoscroll with speed control, follow-voice via streaming STT + alignment (phrase-level by default), manual correction by tap/arrows.
**Tests:** Unit (aligner on re-read/skip fixtures) · E2E (E7 with fake audio; autoscroll; manual correction) · Manual (position error measured)
**Done when:** [ ] E7 green; measured position error recorded

### Task 21 — Settings, favorites, scene cues

**What:** Settings panel (voice, speed, thresholds, command aliases, where Pause can never be removed, theme, reduced motion, privacy statement), voice favorites, optional spoken scene cues excluded from takes.
**Tests:** Integration (settings persistence) · E2E (alias rules; scene cue spoken, capture starts after it)
**Done when:** [ ] All settings persist per user/device; the privacy statement matches actual data flows

### Task 22 — File imports

**What:** TXT import (same output as paste); then DOCX and PDF (text layer only) with an editable preview, each enabled only after its fixture suite passes; image-only PDF shows an explicit unsupported message.
**Tests:** Contract (every importer outputs valid `ScriptBlock[]`) · Unit (fixture documents) · E2E (import → preview → save)
**Done when:** [ ] Each format's fixture suite is green before its UI option appears

---

# PART E — ASSUMPTIONS & OPEN DECISIONS

**Environment (updated 2026-09-24):** macOS 26.7 (was 15.6.1), Intel i9-9980HK (no AVX-512/VNNI), 32 GB RAM, no Apple Silicon/CUDA → CPU-only inference; **92 GB free disk (2026-09-28)**. Node 22.23.3 via nvm (Homebrew's `node@20` sits earlier on PATH, so shells must put `~/.nvm/versions/node/v22.23.3/bin` first); pnpm 10.15 via corepack; uv 0.12.18 (in `~/.local/share/uv-tool`, linked into `~/.local/bin`); Python 3.12.6 for the AI service; Ollama 0.34 (no models); Playwright headless Chromium installed. **Homebrew 6 has dropped Intel macOS support** (formulae would build from source and need newer Xcode CLT), so ffmpeg will come from a static build. **PostgreSQL is not installed locally: the app database is on Neon and the integration-test database on Supabase** (user decision, 2026-09-24). Missing: ffmpeg, docker. Git repo initialized, no commits.

| ID | Hypothesis | Validated in | Status |
|---|---|---|---|
| H-01 | The repeat-after flow appeals beyond the founding user | 5 creator sessions after Task 19 | Open |
| H-10 | Kokoro gives word timings, or they can be derived by aligning the generated audio | Task 7 | **Validated**: timestamped export; word starts ≤ 40 ms (median 38 ms) from the audio; mapping to script words works for 8/10 test lines, and misses are detectable → chunk tier |
| H-11 | Kokoro synthesizes a sentence in ≤ 1.2 s on this CPU | Task 7 | **Partly refuted**: fp32 6 words 1.0 s, 13 words 1.5 s, 27 words 3.0 s; int8 3× slower (no VNNI). Mitigation: prefetch the next chunk + cache |
| H-12 | Headset settle ≤ 150 ms is enough | Task 9 | Open |
| H-13 | Browser echo cancellation materially reduces assistant leakage in A1 | Task 9 | Open |
| H-14 | faster-whisper `base.en` int8 transcribes a 5 s take in ≤ 1.5 s | Task 8 | **Validated**: 0.63 s greedy (RTF 0.13), 1.0 GB RSS |
| H-15 | Biasing STT with the chunk text doesn't cause false "delivered" matches | Task 8 | **Refuted**: 1 false advance and 7 invented chunk words (beam 5), paused takes truncated → never bias |
| H-16 | Thresholds 0.80/0.70 + end-token rule → 0 false advances on the 60-s script | Task 19 | Open |
| H-17 | In-browser VAD is good enough (no onnxruntime-web needed) | Task 8 | **Refuted** for an energy VAD (misses 4/6 takes at 5 dB SNR, onset up to 480 ms); Silero: 0 misses, 72 ms median |
| H-18 | A rolling recorder avoids clipping take starts | Task 9 | Open |
| H-19 | Same-MIME take stitching works in Chrome and Safari without ffmpeg.wasm | Task 9 | Open |
| H-20 | TypeORM bundles cleanly in Nitro with `EntitySchema` + externals | Task 1 | **Validated (build)**: `@repo/*` inlined, `typeorm`/`pg` external and traced into `.output/server/node_modules`; `pg` passed to TypeORM as `driver`. The live-DB run is pending the Neon URLs |
| H-22 | Supabase (session pooler, eu-west-1) keeps `pnpm test:int` under 60 s, and Neon keeps dev API calls responsive, from this machine | Task 1 | **Validated**: 45 s incl. build (Supabase transaction pooler works too); Neon cold start ≈ 3.4 s on first connect only |
| H-26 | The `short`/`smart` word budgets (8 / 16, merge < 6 up to 12) give natural repeat-after chunks | Task 19 | Open |
| H-27 | With the settle time and echo cancellation, no assistant residual reaches a take in A1 (a -20 dB residual is transcribed as the chunk and would advance a silent take) | Task 9 | Open |
| H-28 | OpenAI TTS starts audio for a short chunk in ≤ 1.2 s from this network (uncached) | Task 10a | **Validated with a caveat**: `gpt-4o-mini-tts` mp3 first byte p90 1.14 s, max 1.19 s over successful requests; 15% of requests stalled > 30 s, so timeouts, retry, prefetch and fallback are required (§B12) |
| H-29 | Word timings derived by aligning OpenAI STT word timestamps on the TTS audio are within ≤ 50 ms of word onsets for most chunks | Task 10a | **Refuted**: `whisper-1` starts are a median 90–100 ms off (max 560 ms, both directions), with only 25–36% within 50 ms; the cloud voice uses chunk highlighting (user decision) |
| H-30 | Cloud speech costs stay small for a solo creator (target to set from the 10a numbers: 60-s script and a 45-min session) | Task 10a | **Validated**: ≈ $0.02–0.04 per 60-s script, ≈ $0.26–0.41 per 45-min session (list prices) |
| H-21 | Nitro's experimental OpenAPI generator (`defineRouteMeta` + `$global` components) can meet the §B5.1 standard; else fall back to a hand-written typed document | Task 1 | **Refuted** (nitropack 2.13.4: no top-level tags, fixed `servers`) → fallback |

**Decisions needed from the user:**
1. ~~Test devices and browsers~~ **Decided 2026-09-28:** this Intel Mac (Chrome, Safari), an iPhone (Safari) and an Android phone (Chrome). That is the R1 device matrix (§A6.10: no claims beyond it).
2. ~~Disk~~ **Resolved 2026-09-28:** 92 GB free on the system disk; models go in `models/` (gitignored).
3. Git remote, and permission to commit.
4. Databases: the user puts `DATABASE_URL` (Neon), `DATABASE_URL_TEST` (Supabase, session pooler) and `DATABASE_URL_TEST_CA_CERT` in `.env` before Task 1's integration tests. Storing scripts in hosted DBs the user chose and configured is the user's opt-in under §A6.8. Media stays on local disk (`STORAGE_DIR`). Other Neon platform features (Auth, buckets, functions, deploy) are **not** used in R1 (§A8); adopting any needs a spec change.

6. ~~GPL in the AI service~~ **Resolved 2026-09-28:** cloud speech (OpenAI) is primary; the Kokoro/faster-whisper AI service stays as a **local-only** offline fallback, where the GPL phonemizer carries no obligations. Revisit only if the AI service is ever distributed.
7. **OpenAI API key** for Task 10a/10: put `OPENAI_API_KEY` in the repo-root `.env` (never committed).
---

# PART F — CHANGE LOG

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-09-23 | Initial multi-file spec set |
| 0.2.0 | 2026-09-23 | Consolidated into a single SPEC.md; Turborepo monorepo; TypeORM + PostgreSQL (replaces the "no DB in R1" plan and Prisma); User modelling added as Task 1; gated task-by-task protocol |
| 0.3.0 | 2026-09-23 | Added §B10 code standards: zero TS/lint errors, named constants instead of string-literal comparisons, Record lookups instead of nested ternaries; wired into Task 0 and the D0 gate |
| 0.3.1 | 2026-09-24 | Task 0 implemented; TypeScript pinned to 6.0.x; PostgreSQL/ffmpeg install moved to Tasks 1/9 (Homebrew dropped Intel); dependency register updated |
| 0.3.2 | 2026-09-24 | Task 0 confirmed by user → DONE |
| 0.21.1 | 2026-09-29 | Task 10 confirmed by the user → DONE; Task 10b started |
| 0.21.0 | 2026-09-29 | Task 10 implemented (awaiting confirmation): Speech routes, consent column + migration, OpenAI client with first-byte/stall deadlines and a transient-only retry, local `/v0` client, write-once speech cache, mp3 duration, speech health; **§B5.1: every `/api` error is an `ApiError`** (404 fallback route, 405 + `Allow` middleware), `ApiErrorCode.SpeechUnavailable`/`MethodNotAllowed`; Speech tag |
| 0.20.0 | 2026-09-28 | **Task 10 split (user decision):** Task 10 = cloud speech via Nitro (routes, consent, cache, per-attempt timeouts + retry + local fallback hook, health); new Task 10b = the local AI service fallback (Kokoro, faster-whisper, real health); Task 13 depends on 10b. §B12 per-attempt budget: TTS first byte 2 s, stall 2 s, STT 4 s, one retry. §B5 lists the Speech routes |
| 0.19.1 | 2026-09-28 | Task 10a confirmed by the user → DONE; Task 10 started |
| 0.19.0 | 2026-09-28 | Task 10a spike done (awaiting confirmation): `gpt-4o-mini-tts` + `gpt-transcribe` chosen; H-28 validated with a stall caveat, H-29 refuted, H-30 validated; **user decision: the cloud voice uses chunk highlighting** (no `aligned` timing source); §B12 adds stall timeout, retry and N+1/N+2 prefetch; consent-text facts with sources; Task 10 scope updated |
| 0.18.1 | 2026-09-28 | Task 12 confirmed by the user → DONE |
| 0.18.0 | 2026-09-28 | Task 12 implemented (awaiting confirmation): `/import` review UI (type chips, table column picker, chunk size, click/drag/keyboard boundary editing, live coverage, save via the Task 4 API), projects list; script-model `nudgeBoundary`/`tablesOf`/`setSpokenColumn`; contracts `KeyboardKey`; **§C1.1: E2E now runs against a per-run test schema** (needs `DATABASE_URL_TEST`); `checkUnknownComponents` on in the web typecheck |
| 0.17.2 | 2026-09-28 | Task 11 confirmed by the user → DONE |
| 0.17.1 | 2026-09-28 | Task 11 implemented (awaiting confirmation): `packages/ui` Nuxt layer (tokens, theme mapping, props-only status components), i18n setup with typed keys, app shell, `/_design`; §B8: @nuxtjs/i18n approved, @iconify-json/lucide and @vitejs/plugin-vue added; contrast and raw-hex checks run as unit tests |
| 0.17.0 | 2026-09-28 | **Cloud speech (user decision):** OpenAI TTS + STT through Nitro (key server-side, explicit opt-in per §A6.8, cached TTS, derived word timings `timingSource: aligned`), with the Kokoro/faster-whisper AI service kept as the offline/no-consent fallback; new §B12; hosted AI / paid APIs allowed for OpenAI speech only; new Task 10a spike; Task 10 renamed to speech providers v0; H-28–H-30; open decision 6 resolved, 7 added (API key) |
| 0.16.2 | 2026-09-28 | Task 9 tooling ready: capture lab (`spikes/capture/`, HTTPS on the LAN via a local openssl CA instead of mkcert, results POSTed back to the Mac); smoke-tested in headless Chromium (naive WebM concatenation plays only the first take; re-recording works); `docs/measurements/device-matrix.md` skeleton; device runs pending |
| 0.16.1 | 2026-09-28 | Task 8 confirmed by user → DONE (real-voice takes remain an optional follow-up). Task 9 started |
| 0.16.0 | 2026-09-28 | Task 8 spike: faster-whisper `base.en` int8 greedy chosen (0.63 s per 5 s take, 0 false advances); chunk-text prompting refuted (H-15); Silero VAD chosen over an energy VAD (H-17); new H-27: assistant echo in a take would look like a delivered line (Task 9 must set settle from the measured tail); Task 8 → AWAITING CONFIRMATION |
| 0.15.1 | 2026-09-28 | Task 7 confirmed by user → DONE; the browser boundary-event runs on the user's devices are deferred (the probe stays in `spikes/tts/boundary.html`). Task 8 started |
| 0.15.0 | 2026-09-28 | Task 7 spike: Kokoro via kokoro-onnx + onnx-community timestamped export (fp32) chosen; H-10 validated (word starts ≤ 40 ms), H-11 partly refuted (prefetch + cache); int8 3× slower on this CPU; onnxruntime pinned to 1.23.2 (last Intel-Mac wheels); GPL phonemizer/espeak-ng → open decision 6; boundary-event probe awaiting the user's devices |
| 0.14.1 | 2026-09-28 | Task 6 confirmed by user → DONE |
| 0.14.0 | 2026-09-28 | Task 6 implemented: match normalizer, grammar matcher with safe aliases, command-vs-script classifier, transcript matcher (coverage, Dice similarity, end rule, missing spans); `SpeechGate` moved to contracts; matching fixtures in `tests/fixtures/matching/`; Task 6 → AWAITING CONFIRMATION |
| 0.13.1 | 2026-09-28 | Task 5 confirmed by user → DONE |
| 0.13.0 | 2026-09-28 | Task 5 implemented: pure session engine (tokens as the stale guard, timers as effects, 300 ms tap coalescing, permission matrix, isolated-voice gate); user decision: running sessions keep reading (§B6 engine interpretation); `Arrangement` constants in contracts; golden E3/E10 logs; Task 5 → AWAITING CONFIRMATION |
| 0.12.2 | 2026-09-28 | Task 4 confirmed by user ("proceed with task 5") → DONE; the /api/docs manual check was not reported back. Task 5 started |
| 0.12.1 | 2026-09-25 | `pnpm dev` under Node 20.17 (the shell's nvm default) served 500 on every page: Nuxt's `oxc-walker` `require()`s an ESM parser, which needs Node ≥ 20.19/22.12. Root scripts now run `scripts/check-node.mjs` first (fails fast with a fix hint); `uuid-v7` no longer uses BigInt literals (ES2019 dev-bundle warning); Task 4 migration applied to the Neon dev DB |
| 0.12.0 | 2026-09-25 | Task 4 implemented (8 tables, trigger-protected takes, streamed write-once media with ranges, 22 routes, OpenAPI from contract schemas, storage settings in `.env.example`); Task 4 → AWAITING CONFIRMATION |
| 0.11.0 | 2026-09-24 | Task 4 API decided with user: two-step take upload (JSON create + streamed raw `PUT …/media`, no multipart), immutable chunk-plan versions (`PATCH /api/chunk-plans/:id` dropped); route table updated (GET plan/session/takes, media GET/PUT, restore, script list); design decisions recorded under Task 4 |
| 0.10.1 | 2026-09-24 | Task 3 confirmed by user → DONE. Task 4 started |
| 0.10.0 | 2026-09-24 | Task 3 implemented (parser, four modes, cut-based plan model, stable ids, AI proposal snapping, coverage check, 6 × 1,000 property runs); §B5 rule 5 tightened to whitespace-only boundaries; `BlockType`/`ChunkMode`/script types in contracts; fast-check approved; H-26; Task 4 note on composite keys; Task 3 → AWAITING CONFIRMATION |
| 0.9.1 | 2026-09-24 | Task 2 confirmed by user → DONE. Task 3 started |
| 0.9.0 | 2026-09-24 | Task 2 implemented: JSON Schemas typed against TS types, emitted schema files, ajv validation (`@repo/contracts/validation`), Pydantic mirrors + UTF-16 helpers in `apps/ai`, shared fixtures (contracts, UTF-16, en grammar), drift tests both ways; web request bodies now validated by contract schemas; Task 2 → AWAITING CONFIRMATION |
| 0.8.5 | 2026-09-24 | Task 1 confirmed by user ("start task 2") → DONE. The two Swagger manual checks (/api/docs screenshot, AI /docs) were not reported back. Task 2 started |
| 0.8.4 | 2026-09-24 | Task 1 verified against live Neon + Supabase; H-22 validated; Task 1 → AWAITING CONFIRMATION |
| 0.8.3 | 2026-09-24 | Clarified by user: **Neon for `DATABASE_URL`, Supabase for `DATABASE_URL_TEST`**. CA setting is per connection (`DATABASE_URL_CA_CERT`, `DATABASE_URL_TEST_CA_CERT`); Neon platform features beyond Postgres stay out of R1 |
| 0.8.2 | 2026-09-24 | Database host is **Supabase** (user decision; replaces Neon); tests use a separate Supabase project via the session pooler; guard identifies Supabase projects by ref; `DATABASE_CA_CERT` for verified TLS; `sslmode`/`pgbouncer` URL params stripped; RLS enabled on all tables (Supabase Data API); Task 4 streaming-upload rule |
| 0.8.1 | 2026-09-24 | Task 1 started. ajv approved for Task 1 (OpenAPI 3.1 validation); `DELETE /api/me/voices/:id` added; H-21 refuted → hand-written OpenAPI document with a runtime `API_DOCS_ENABLED` gate; test-only `DB_SCHEMA` for the server under test |
| 0.8.0 | 2026-09-24 | **R1 is English only** (user decision). v0.7.0 reverted; §B11 reduced to `en.json` only (snake_case keys, typed `MessageKey`, `Locale.En`, no switcher), kept so languages can be rolled out later; German removed from Tasks 11/21; other languages listed as out of scope in §A8 |
| 0.7.0 | 2026-09-24 | *(Draft, superseded by 0.8.0 before implementation.)* English **and German** in R1 for everything spoken, not just the UI: new §B12 (script `language`, per-language segmentation, voices, STT, grammar, normalizers, thresholds); de command grammar; language-keyed settings and `VoiceFavorite.language` (Task 1), `Script.language` (Task 4); German TTS engine candidate (Piper) and a one-engine-per-language exception; multilingual STT; tasks 2–3, 6–8, 10, 12, 15–16, 19 and scenarios E1/E2/E4 cover both languages; H-23–H-25 |
| 0.6.0 | 2026-09-24 | Added §B11 i18n: UI in `en` + `de` via `@nuxtjs/i18n`, nested snake_case keys, typed `MessageKey`, parity test, `Locale` const + `User.locale`; §B10 R5 no hard-coded UI text (old R5 → R6); set up in Task 11, `Locale` in Task 1, language setting in Task 21; German voice out of R1 scope |
| 0.5.0 | 2026-09-24 | Database hosted on Neon instead of a local PostgreSQL install; connection only via `DATABASE_URL` / `DATABASE_URL_TEST`; new §C1.1 integration-test DB lifecycle (required URL, same-DB guard, per-run schema, truncate between tests, always dropped afterwards); Task 1 scope/done-when updated; H-22 added |
| 0.4.0 | 2026-09-24 | Added §B5.1 API documentation: OpenAPI 3.1 + Swagger UI for the web API (Nitro built-in) and AI service (FastAPI), tag registry, per-operation documentation standard, ApiError shape, completeness tests; wired into Task 1 (and Task 10) |

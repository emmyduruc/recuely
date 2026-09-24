# SPEC — Filming Assistant

> Single source of truth for this project. Version **0.3.1** · Last updated 2026-09-23
> Input brief: `product.md` (frozen). Repo rules for Claude Code: `CLAUDE.md`.
> "Filming Assistant" is a placeholder name. Never use it in package names, identifiers, or branding.

**Contents:** Part A What & Why · Part B How (architecture, stack, contracts, code standards) · Part C Testing · Part D Task Plan (gated) · Part E Assumptions & open decisions · Part F Change log

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
8. No cloud upload of scripts or audio without opt-in. No analytics that capture scripts or audio.
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

Voice cloning, AI avatars, a non-linear editor, social posting, Notion/Google Docs OAuth, browser extension, native mobile/background listening, billing, hosted AI, cloud storage, OCR for image-only PDFs, barge-in during speaker playback. **Login/auth** is also out of R1: the `User` model exists (Task 1), but R1 runs as a single local user.

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
| Database | **PostgreSQL 16** (Homebrew locally) | Separate `recuely_test` DB for integration tests |
| Media files | Browser OPFS first (crash-safe), then upload to local disk storage (`STORAGE_DIR`) via the API | Large media never goes in DB rows. Storage sits behind a `Storage` interface so S3-compatible storage can be added later. |
| AI service | FastAPI; candidates: faster-whisper (STT), Silero or in-browser VAD, Kokoro (TTS), Ollama (optional segmentation) | Candidates until measured (Tasks 7–9) |
| Tests | Vitest, fast-check, Playwright, pytest, ruff | See Part C |
| UI state | Vue composables; Pinia only if needed | Session truth lives in the engine, not in Pinia |

**Forbidden without a spec change:** React/Next/extra SPA, NestJS, GraphQL, Redis, message brokers, Kubernetes, event sourcing, LangChain/LlamaIndex/agent frameworks, XState or other state-machine libraries, Prisma or Drizzle, duplicate TTS/STT/UI/animation/video SDKs, paid APIs, content-capturing analytics.
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
| TTS | AI service / Kokoro (audio + word timings) | Browser `speechSynthesis` (chunk highlight; word highlight only if boundary events are confirmed) |
| STT | AI service / faster-whisper (per take) | Browser Web Speech: **opt-in only**, since it may send audio to the vendor's cloud. Otherwise manual advance. |
| VAD | In-browser AudioWorklet VAD or Silero (decided in Task 8) | none → manual advance |
| Segmenter | Deterministic rules | Ollama proposals (boundaries only, validated) |

## B4. Data model (TypeORM entities, PostgreSQL)

All ids are UUID v7 (`uuid` primary key, generated in app code). All tables have `created_at` and `updated_at`.

| Entity | Key fields | Relations / notes |
|---|---|---|
| **User** | id, email (nullable, unique), display_name, locale, is_local (bool) | R1: one seeded local user (`is_local = true`). Auth comes later with its own spec. |
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
5. AI segmenters return **boundary offsets only**. An offset that isn't on a whitespace or punctuation boundary is snapped or rejected.

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
| Nitro | `GET/PATCH /api/me`, `/api/me/settings`, `/api/me/voices` | Local user, settings, favorites |
| Nitro | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id` | Projects (delete = archive) |
| Nitro | `POST /api/projects/:id/scripts`, `GET /api/scripts/:id` | Script versions + blocks |
| Nitro | `POST /api/scripts/:id/chunk-plans`, `PATCH /api/chunk-plans/:id` | Chunking (the invariant is checked server-side too) |
| Nitro | `POST /api/sessions`, `PATCH /api/sessions/:id` | Session snapshot autosave |
| Nitro | `POST /api/sessions/:id/takes` (multipart), `PATCH /api/takes/:id`, `DELETE /api/takes/:id?confirm=true` | Takes: upload, select, soft delete |
| Nitro | `POST /api/sessions/:id/exports`, `GET /api/exports/:id` | Exports |
| AI | `GET /v0/health` | Status of each capability + model versions |
| AI | `GET /v0/tts/voices`, `POST /v0/tts`, `GET /v0/tts/audio/:key` | Voices, synthesis, cached audio |
| AI | `POST /v0/stt` | Per-take transcription (echoes sessionId/chunkId/seq) |
| AI | `WS /v0/stt/stream` | Streaming transcription (teleprompter, R1.1) |
| AI | `POST /v0/segment` | Boundary proposals only |

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

- **Assistant highlight tiers:** `word-provider` (TTS timings, driven by `audio.currentTime`) → `word-approx` (browser boundary events, only where probed) → `chunk`. Never interpolated.
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
| typeorm, pg | ORM + driver | raw `pg` | MIT | Task 1 | Approved (user) |
| vitest, @playwright/test | Tests | node:test | MIT/Apache-2.0 | Task 0 | Approved (Task 0) |
| fast-check | Property tests | hand-written loops | MIT | Task 3/5 | Proposed |
| typescript 6.0.x (pinned) | Types | — | Apache-2.0 | §B10 R1 | Approved (Task 0). TS 7 blocked: typescript-eslint supports < 6.1 |
| vue-tsc | Vue typecheck (`nuxt typecheck`) | — | MIT | §B10 R1 | Approved (Task 0) |
| eslint, @eslint/js, typescript-eslint, eslint-plugin-vue, vue-eslint-parser, globals | Lint + §B10 rules | — | MIT | §B10 R2–R4 | Approved (Task 0) |
| @types/node | Node types | — | MIT | Task 0 | Approved (Task 0) |
| ajv | JSON Schema validation | hand validators | MIT | Task 2 | Proposed |
| fastapi, uvicorn (pydantic transitively) | AI service | — | MIT/BSD | Task 0 | Approved (Task 0) |
| pytest, ruff, pyright, httpx2 | Py tests, lint, strict types; httpx2 backs Starlette 1.7's TestClient | — | MIT/BSD | Task 0 | Approved (Task 0) |
| faster-whisper | STT candidate | whisper.cpp | MIT | Task 8 | Candidate |
| kokoro (+ espeak-ng) | TTS candidate | browser TTS | Apache-2.0 (verify weights & voices) | Task 7 | Candidate |
| silero-vad | VAD candidate | in-browser VAD | MIT | Task 8 | Candidate |

## B9. Design system (summary)

- **Semantic color tokens** as CSS variables (studio dark by default, plus light): canvas, surface-1/2, text/muted/subtle, accent, success, warning, error, **live** (recording), **listening** (mic armed), **assistant** (speaking), highlight-current/spoken/upcoming. No raw hex outside `tokens.css`.
- **Typography:** system stack; UI scale 0.75 → 2.25 rem; teleprompter scale 2.5 → 6.5 rem.
- **Spacing:** 4-pt scale. **Radii:** 6/10/16/full. **Motion:** 120/200/320 ms; reduced motion means instant changes.
- **Status language (icon + text + color):** "Reading line 4/32" · "Get ready…" · "Your turn" · "Recording take 2" · "Checking…" · "Next · Repeat · Retake" · "Paused" · specific error + recovery action.
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
// ✓
const STATUS_LABEL: Record<SessionState, string> = {
  [SessionState.Idle]: 'Ready when you are',
  [SessionState.AssistantSpeaking]: 'Reading',
  [SessionState.CreatorSpeaking]: 'Your turn',
  [SessionState.Paused]: 'Paused',
  // … compile error if any state is missing
};
const label = STATUS_LABEL[snapshot.state];
```

- Behavior maps use the same pattern, e.g. `Record<Intent, CommandHandler>`, `Record<Arrangement, ArrangementPolicy>`, and `Record<SessionState, Partial<Record<EventType, Transition>>>` for the engine's transition table.
- `if/else if` chains with more than two branches on the same key should be a record as well (review rule).
- Python: use `dict[MyEnum, T]` lookups with an exhaustiveness test.

**R5. Enforcement.** Configure all of this in `packages/config/eslint` (flat config) and share it with every package in Task 0. CI fails on any violation. Each task report includes the `pnpm typecheck` and `pnpm lint` output.

---

# PART C — HOW WE TEST

## C1. Test modes

| Mode | What it proves | Tooling | Command |
|---|---|---|---|
| **Unit** | Pure logic: engine transitions, segmentation, offsets, grammar, matcher | Vitest / pytest | `pnpm test` |
| **Property** | Invariants hold for random inputs (text preservation, engine invariants) | fast-check | `pnpm test` |
| **Contract** | TS and Python accept/reject the same fixtures; API responses match schemas | Vitest + ajv, pytest + Pydantic | `pnpm test` |
| **Integration (DB)** | TypeORM entities, migrations, constraints, repositories against real PostgreSQL | Vitest + `recuely_test` DB | `pnpm test:int` |
| **Integration (API)** | Nitro routes end-to-end against the test DB | Vitest + `$fetch` against a built server | `pnpm test:int` |
| **Synthetic audio** | VAD/STT/TTS on recorded WAV fixtures | pytest | `pnpm --filter ai test:audio` |
| **E2E browser** | UI flows, a11y, permission errors, fake media devices | Playwright (Chromium full; WebKit/Firefox smoke) | `pnpm test:e2e` |
| **Manual device** | Real audio/video quality, latency, leakage, routing | Checklist in C3; results in `docs/measurements/` | — |

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
4. **Prove it:** run the task's tests and report the actual output. `pnpm typecheck` and `pnpm lint` must show **0 errors and 0 warnings** (§B10). Manual checks are listed for the user to perform or confirm.
5. **Gate:** the task moves to `DONE` only when **the user confirms**. Claude then updates the status here and adds a change-log line (Part F). Claude doesn't start the next task before confirmation.
6. If a task reveals that the spec is wrong, stop, propose the spec change, and continue after approval.

Status values: `TODO` · `IN PROGRESS` · `AWAITING CONFIRMATION` · `DONE` · `BLOCKED`

## D1. Task overview

| # | Task | Status | Depends on |
|---|---|---|---|
| 0 | Monorepo foundation (Turborepo, Nuxt, FastAPI, CI) | AWAITING CONFIRMATION | — |
| 1 | User modelling & database (TypeORM + PostgreSQL) | TODO | 0 |
| 2 | Shared contracts & fixtures | TODO | 0 |
| 3 | Script model: parsing, segmentation, text preservation | TODO | 2 |
| 4 | Project, script & session persistence (entities + API) | TODO | 1, 3 |
| 5 | Session engine (state machine) | TODO | 2 |
| 6 | Command grammar & transcript matcher | TODO | 2 |
| 7 | Spike: TTS (Kokoro timings & latency, browser boundary events) | TODO | 0 |
| 8 | Spike: STT & VAD on the dev CPU | TODO | 0 |
| 9 | Spike: browser capture, echo/settle, pre-roll, MIME, stitching | TODO | 0 |
| 10 | AI service v0 (health, TTS, STT) | TODO | 7, 8 |
| 11 | Design system & app shell | TODO | 0 |
| 12 | Script import & review UI | TODO | 4, 11 |
| 13 | Media adapters & effect runner | TODO | 5, 9, 10 |
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
- Prerequisites: Node 22 LTS (`.nvmrc`), `uv` (Python 3.12 pinned). PostgreSQL moved to Task 1 and ffmpeg to Task 9, because Homebrew no longer supports Intel macOS (see Part E)
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

**What:** `packages/db` with a TypeORM DataSource, the `User`, `UserSettings`, `VoiceFavorite`, `Device` entities, migrations, repositories, and a seeded local user. Nitro routes `GET/PATCH /api/me`, `/api/me/settings`, `/api/me/voices`.
**Why:** Settings, favorites, per-device calibration, and project ownership all hang off a user. Modelling it now, with a single local user in R1, avoids a painful migration when auth arrives.
**Scope:**
- Entities as `EntitySchema` (§B2), UUID v7 ids, timestamps, `synchronize: false`, migrations only
- `pnpm db:migrate`, `db:seed` (idempotent local user + default settings)
- Nitro plugin that initializes the DataSource once; `typeorm`/`pg` external in the Nitro build
- Request bodies checked with typed guards for now; replaced by contract-schema validation (ajv) once Task 2 lands
- `.env.example`: `DATABASE_URL`, `DATABASE_URL_TEST`
**Tests:** Integration (DB): migrations up/down; unique constraints (email, favorite triple); 1:1 settings cascade · Integration (API): `/api/me` returns the seeded user; PATCH settings persists and rejects invalid values · Unit: repository helpers
**Done when:**
- [ ] Fresh DB → `pnpm db:migrate && pnpm db:seed` → the local user exists; running seed twice creates no duplicates
- [ ] `pnpm test:int` green against `recuely_test`
- [ ] `pnpm build` works with TypeORM (proves the Nitro bundling setup)
- [ ] The ERD for these four entities is added to §B4 if it changed

### Task 2 — Shared contracts & fixtures

**What:** `packages/contracts`: JSON Schemas + TS types for §B5 payloads, Python Pydantic mirrors in `apps/ai`, and shared fixtures (valid/invalid per type, UTF-16 offset fixture, command grammar JSON).
**Why:** Web, engine, and AI service must agree on data exactly. Fixtures both runtimes test against catch drift early.
**Tests:** Contract (TS + Python load the same fixtures; valid ones pass, invalid ones fail; the UTF-16 fixture gives identical offsets)
**Done when:**
- [ ] `pnpm test` and `pnpm --filter ai test` both pass the shared fixture suite
- [ ] Contract version `0.1.0` recorded here and exported from the package

### Task 3 — Script model

**What:** `packages/script-model`: paste parser (headings, `Note:` lines, `[Scene …]` cues, tables with row/column provenance) → `ScriptBlock[]`; segmentation modes short/sentence/paragraph/smart (`Intl.Segmenter`); boundary move/split/merge with stable chunk IDs; `normalize` + coverage assertion; `rechunkFrom(chunkId)` for mid-session size changes.
**Why:** The whole product depends on reading exactly what the creator wrote, in sensible pieces. Wording must never change.
**Tests:** Unit (each mode on fixtures; block typing) · Property (random boundary edits keep coverage; invalid AI boundaries snapped or rejected) · Unit (stable IDs across unrelated edits)
**Done when:**
- [ ] E1 passes at the model level (fixture with headings, paragraphs, comma, full stop, table)
- [ ] Property tests run ≥ 1,000 cases green
- [ ] Headings, notes, and cues never appear in chunks unless re-typed as spoken

### Task 4 — Project, script & session persistence

**What:** Entities `Project`, `Script`, `ScriptBlock`, `ChunkPlan`, `ScriptChunk`, `Session`, `Take`, `Export` + migrations; the `Storage` interface with a local-disk implementation; Nitro routes from §B5 (projects, scripts, chunk plans, sessions, takes, exports).
**Why:** Sessions, positions, and takes must survive reloads and crashes, and takes must be structurally protected from deletion.
**Tests:** Integration (DB): partial unique index (one selected take per chunk); soft delete; takes keep their chunk link after a new chunk plan · Integration (API): create project → script → chunk plan (server rejects a plan that breaks coverage) → session → upload take (multipart, file on disk, row in DB) → select → delete without `confirm=true` is rejected
**Done when:**
- [ ] All routes are covered by API integration tests
- [ ] Uploading 3 takes for one chunk and selecting one leaves exactly one selected and all 3 recoverable
- [ ] No code path hard-deletes a take (grep + test)

### Task 5 — Session engine

**What:** `packages/session-engine`: a pure reducer implementing §B6 (states, transitions, guards, effects, timers as effects, stale guard, 300 ms tap coalescing, command permission matrix).
**Why:** Timing and cancellation bugs are the biggest risk to takes. A deterministic, hardware-free engine makes them testable.
**Tests:** Unit (table-driven over every transition row and every state × intent cell) · Property (invariants 1–5) · Golden event-log replays for E3 and E10
**Done when:**
- [ ] 100% of transition rows and matrix cells have a test
- [ ] E3 (mid-sentence pause never advances) and E10 (late result ignored) green
- [ ] Zero imports from vue/nuxt/DOM/typeorm (lint enforced)

### Task 6 — Command grammar & transcript matcher

**What:** A normalizer, a grammar matcher (§B5 table → `CommandEvent | null`), and a transcript aligner → `MatchResult` (§B7 thresholds + end-token rule); command-vs-script-speech separation.
**Why:** Commands must work reliably without script lines like "Next, we repeat…" triggering them, and advancement must never skip unfinished lines.
**Tests:** Unit (every synonym → intent; near-misses → null; "Next, we repeat the process" as script speech → no command; paraphrase → advance; half-delivered → ask; ending omitted → ask)
**Done when:**
- [ ] All grammar and matcher fixtures green
- [ ] Thresholds read from settings, not hard-coded

### Task 7 — Spike: TTS *(parallel-safe with 8, 9; timebox 1 day; throwaway code)*

**What:** Measure Kokoro on this Intel CPU (cold/warm latency, RAM, disk), check whether it exposes word timings (or whether aligning the generated audio gives ≤ 50 ms error), verify licenses for weights and voices, and probe browser `boundary` events in Chrome/Safari/Firefox.
**Why:** Decides whether word-level assistant highlighting is real or falls back to chunk highlighting, and whether prefetching is needed.
**Tests:** Manual + scripted measurements → `docs/measurements/tts-<date>.md`
**Done when:**
- [ ] A measurements doc with tables and a recommendation
- [ ] Part E hypotheses H-10/H-11 updated to validated or refuted

### Task 8 — Spike: STT & VAD *(parallel-safe; timebox 1.5 days)*

**What:** faster-whisper `tiny.en`/`base.en`/`small.en` int8 latency and WER on fixtures (clean, noisy, paused, paraphrased); whether biasing with the chunk text inflates matches; in-browser AudioWorklet VAD vs. Silero (latency, false starts, assistant bleed).
**Why:** Picks the STT model and VAD approach that meet the latency targets on the real hardware.
**Tests:** Synthetic audio (pytest) + manual → `docs/measurements/stt-vad-<date>.md`
**Done when:**
- [ ] A model and VAD approach chosen with numbers; §B8 updated (≤ 1 candidate kept per interface)
- [ ] H-14, H-15, H-17 updated

### Task 9 — Spike: browser capture *(parallel-safe; timebox 1.5 days)*

**What:** On each available device: permission flow and track lifecycle; LAN HTTPS (mkcert); echo tail with echo cancellation on/off → settle; rolling-recorder pre-roll vs. start-at-VAD (clipping over 10 takes); supported MIME types and sizes; client-side stitching without ffmpeg.wasm; `setSinkId`/`selectAudioOutput` behavior with a Bluetooth earbud.
**Why:** Recording behavior varies by browser and device. Real numbers decide the capture strategy before the UI is built on top of it.
**Tests:** Manual device checklist (C3) → `docs/measurements/device-matrix.md`
**Done when:**
- [ ] The first device-matrix pass is recorded; a capture strategy is recommended
- [ ] H-12, H-13, H-18, H-19 updated

### Task 10 — AI service v0

**What:** `/v0/health`, `/v0/tts/voices`, `/v0/tts` (+ timings or derived, cached by text hash/voice/rate), `/v0/stt` (echoes sessionId/chunkId/seq); timeouts, cancellation on client disconnect, per-capability health.
**Why:** Gives the web app real, versioned voice and transcription providers.
**Tests:** Contract (responses validate against the shared fixtures) · Synthetic audio (STT on fixtures; TTS returns audio + timings) · Unit (cache key, timeout, cancellation)
**Done when:**
- [ ] `pnpm --filter ai test` green; the health endpoint reflects real model status
- [ ] A second identical TTS request is served from cache

### Task 11 — Design system & app shell

**What:** Token CSS (dark studio + light), Nuxt UI theme mapping, layout shell, status components (StatusPill, CaptureIndicator, DecisionBar, ChunkText with three highlight tiers) as props-only components, and a dev `/_design` page.
**Why:** Clear, calm, unmistakable recording status is part of the product, and later UI tasks build on these pieces.
**Tests:** Unit (component rendering; `chunk` tier renders no word-level markers) · E2E (contrast test on token pairs; reduced-motion check; raw-hex lint)
**Done when:**
- [ ] Screenshots of `/_design` at 360, 768, 1280, and 1728 widths
- [ ] Every status shows icon + text

### Task 12 — Script import & review UI

**What:** Paste/editor page → block preview with type chips (changeable), table column picker, chunk mode picker, drag/keyboard boundary editing, live coverage check, save through the Task 4 API.
**Why:** The creator must trust that what will be read is exactly what they wrote.
**Tests:** E2E (E1 through the UI; keyboard-only boundary editing) · Integration (saved plan round-trips)
**Done when:**
- [ ] E1 green in Playwright; screenshots at 4 widths

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

**Environment (updated 2026-09-24):** macOS 15.6.1, Intel i9-9980HK, 32 GB RAM, no Apple Silicon/CUDA → CPU-only inference; **~9 GB free disk**. Node 22.23.3 via nvm (Homebrew's `node@20` sits earlier on PATH, so shells must put `~/.nvm/versions/node/v22.23.3/bin` first); pnpm 10.15 via corepack; uv 0.12.18 (in `~/.local/share/uv-tool`, linked into `~/.local/bin`); Python 3.12.6 for the AI service; Ollama 0.34 (no models); Playwright headless Chromium installed. **Homebrew 6 has dropped Intel macOS support** (formulae would build from source and need newer Xcode CLT), so PostgreSQL will come from Postgres.app (or an installer) and ffmpeg from a static build. Missing: PostgreSQL, ffmpeg, docker. Git repo initialized, no commits.

| ID | Hypothesis | Validated in | Status |
|---|---|---|---|
| H-01 | The repeat-after flow appeals beyond the founding user | 5 creator sessions after Task 19 | Open |
| H-10 | Kokoro gives word timings, or they can be derived by aligning the generated audio | Task 7 | Open |
| H-11 | Kokoro synthesizes a sentence in ≤ 1.2 s on this CPU | Task 7 | Open |
| H-12 | Headset settle ≤ 150 ms is enough | Task 9 | Open |
| H-13 | Browser echo cancellation materially reduces assistant leakage in A1 | Task 9 | Open |
| H-14 | faster-whisper `base.en` int8 transcribes a 5 s take in ≤ 1.5 s | Task 8 | Open |
| H-15 | Biasing STT with the chunk text doesn't cause false "delivered" matches | Task 8 | Open |
| H-16 | Thresholds 0.80/0.70 + end-token rule → 0 false advances on the 60-s script | Task 19 | Open |
| H-17 | In-browser VAD is good enough (no onnxruntime-web needed) | Task 8 | Open |
| H-18 | A rolling recorder avoids clipping take starts | Task 9 | Open |
| H-19 | Same-MIME take stitching works in Chrome and Safari without ffmpeg.wasm | Task 9 | Open |
| H-20 | TypeORM bundles cleanly in Nitro with `EntitySchema` + externals | Task 1 | Open |

**Decisions needed from the user:**
1. Test devices and browsers actually available (sets the device matrix).
2. Disk: free ≥ 15 GB, or name an external folder for models and media, before Tasks 7–9.
3. Git remote, and permission to commit.

---

# PART F — CHANGE LOG

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-09-23 | Initial multi-file spec set |
| 0.2.0 | 2026-09-23 | Consolidated into a single SPEC.md; Turborepo monorepo; TypeORM + PostgreSQL (replaces the "no DB in R1" plan and Prisma); User modelling added as Task 1; gated task-by-task protocol |
| 0.3.0 | 2026-09-23 | Added §B10 code standards: zero TS/lint errors, named constants instead of string-literal comparisons, Record lookups instead of nested ternaries; wired into Task 0 and the D0 gate |
| 0.3.1 | 2026-09-24 | Task 0 implemented; TypeScript pinned to 6.0.x; PostgreSQL/ffmpeg install moved to Tasks 1/9 (Homebrew dropped Intel); dependency register updated |

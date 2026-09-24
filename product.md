Filming Assistant: Product and Architecture Brief for Claude Code

Status: Founding brief for specification-driven development. This is an input to the specification process, not a claim that the software, integrations, or AI performance have already been validated.

Instruction to Claude Code: Use this brief to create an executable spec-driven development system and a parallel-work development factory for this project. First inspect the existing repository, toolchain, hardware, and available models; do not overwrite existing files or assume a blank repo. Ask for decisions only when a choice genuinely blocks safe implementation. Record other uncertainties as explicit hypotheses and propose sensible defaults. Do not generate all application code before preparing and reviewing the specs.

1. Product overview

Working name: Filming Assistant (placeholder; do not bake it into technical identifiers or branding).

The problem: A creator asks another person to read a written script aloud in short pieces, waits while the creator repeats each piece on camera, and repeats or moves forward on request. This can occupy another person’s time and create extra editing work. Conventional teleprompter reading suits some creators; others prefer hearing and then repeating each line while looking into the camera.

What we are building: A browser-first, mobile-responsive recording companion that imports or accepts a script, segments it into natural spoken chunks, reads each chunk through a selected synthetic voice, highlights the words as the assistant speaks, waits for the creator to deliver the chunk, recognizes configurable voice commands, and preserves the creator’s progress and takes. It also has a distinct, optional teleprompter mode where the creator reads the on-screen script and the text follows their own speech.

Primary outcome: A creator can complete a scripted recording without another person reading the script, with minimal unnecessary touches and a clear path to a usable export.

Target users: Creators filming Reels, Shorts, TikToks, YouTube videos, ads, teaching videos, and course lessons. Start with a user who repeats short lines after an assistant; validate broader appeal rather than assuming it.

Design principle: Feel like a considerate filming partner: calm interface, fast feedback, reversible actions, clear audio routing, reliable retakes, and an obvious current position. Do not describe untested behavior as ‘perfect’ or claim universal compatibility.

2. The exact recording flows

A. Listen & Repeat (primary)

1. User adds a script; sees an editable preview of extracted speaking text, notes, headings, and scene instructions.
2. User chooses a voice, language, reading speed, chunk size, automatic/manual advancement, microphone, speaker/headset arrangement, and recording arrangement.
3. User runs a short audio/camera check and explicitly grants relevant permissions.
4. Assistant speaks chunk N. A word-follow highlight tracks the assistant’s generated speech; current chunk is always prominent.
5. Assistant finishes. In the default no-headset mode, wait for speaker playback to finish and a configurable short settle period before accepting the creator’s take.
6. Creator repeats the chunk. Detect voice activity and transcribe with a dedicated speech-recognition component; a transcript comparison estimates whether the chunk has been delivered. Never require exact verbatim phrasing by default.
7. After an adjustable silence threshold, either advance automatically when sufficiently confident or offer an unobtrusive ‘Next / Repeat / Retake’ decision. Uncertain cases must not silently skip content.
8. Record the spoken take and link it to the chunk. A retake must preserve previous takes until the creator chooses one. A mistake should never delete the user’s only usable recording.
9. Persist session position, settings, chunk boundaries, selected takes, and timing metadata.
10. On finish, show a take review, an optional stitched preview, and an export path. Clearly explain when export or editing capabilities vary by device.

Manual mode: Read chunk, wait until user says or taps ‘Next’. A creator can rehearse, pause, or improvise without premature advancement.

Practice mode: No video recording required. Read aloud, listen, repeat; useful on a laptop or second phone while a separate camera records.

B. Follow-my-voice teleprompter (separate mode)

• Display script in a large, adjustable, mirrorable, high-contrast layout. Highlight the current word or phrase as the creator reads, with forgiving alignment, configurable scroll, and manual correction.
• Text should pause when the creator stops, and handle re-reading or skipping within reason; offer tap/keyboard correction when recognition is uncertain.
• Do not equate assistant-TTS word timestamps with creator speech alignment. These are separate clocks and separate highlighting implementations.
• Allow a conventional adjustable-speed autoscroll fallback when voice-follow is unsupported or noisy.
• Teleprompter may work without any AI voice playback.

C. Optional scene notes

• Documents may contain headings, scene numbers, spoken lines, shot instructions, tables, and presenter notes.
• Show spoken content and presenter notes separately. Default to reading only designated spoken content.
• User can optionally request spoken scene cues, e.g. ‘Scene two: show the product screen’, and mark them as not part of the final take.
• Do not indiscriminately read table headers, timestamps, row numbers, or visual instructions. Let the user select columns/blocks when parsing is ambiguous.

3. Audio and device configurations

| Configuration                                     | Assistant playback                            | Creator capture                                          | Product behavior and limits                                                                                                                                                                                                                                                                                |
| ------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One device, no headset (primary demo)             | Phone/laptop speaker                          | Built-in/external mic and optional camera on same device | Read and highlight first; only capture the creator’s take after playback ends and an audio-settle delay. Offer full-session backup recording and time-marked take regions as a separate, explicitly tested option. Audio can still leak through room echo or mic bleed; never promise total voice removal. |
| One device, one Bluetooth earbud or wired headset | Headset/earbud if supported by system/browser | Preferred chosen mic                                     | Creator can hear cues privately, with lower leakage. Expose input and output tests; Bluetooth may change microphone/routing quality or add latency. A visible earbud may matter on camera.                                                                                                                 |
| Two devices, no headset                           | Laptop/second phone speaker                   | Separate filming phone/camera                            | Companion app works as a script reader and session tracker. It cannot automatically edit video captured in an unrelated camera app unless that video is later imported and aligned.                                                                                                                        |
| Two devices, headset on companion device          | Companion headset                             | External filming camera                                  | Quietest cue arrangement for practice/external capture. Microphone used for voice commands must still be accessible to the companion device; headset mic selection may vary.                                                                                                                               |
| Teleprompter only                                 | None, unless explicitly enabled               | Optional camera/mic for voice-follow                     | Creator reads the screen; no assistant narration in the video.                                                                                                                                                                                                                                             |

Required setup UI: Playback mode (speaker/headset/none); test voice; microphone selector where available; microphone level; camera selector where available; echo test; audio input and output status; device-disconnect recovery; permission failures; fallback controls. Do not claim the web can force an arbitrary Bluetooth routing policy or choose an output on every browser. Treat system-default playback as a supported fallback. Browser camera/mic permissions require secure contexts in deployed environments.

Recording choices: (1) rehearsal with external camera; (2) built-in camera with per-chunk takes; (3) optional continuous master recording plus marked usable regions. Evaluate recording transitions carefully because start/stop latency can clip the beginning or end of a spoken take. Preserve original assets. Browser video MIME types, camera support, background behavior, audio routing, and file-size limits are capability-tested, not assumed.

Voice command listening: By default, turn off or disregard command recognition during assistant playback on speakers to avoid the model reacting to its own voice. Provide a visible/touch interrupt. With headset and reliable acoustic separation, investigate limited barge-in later. Avoid command words that appear as ordinary script text triggering actions; interpret commands only in permitted states, with confidence/context gates or an optional wake phrase.

4. Voice, reading, and highlighting

Voice selection: User can preview available voices by language, accent/locale when provided by the engine, style only if the engine supports it, and playback speed. Offer an accessible default and allow saving favorites. Start with available browser voices or a local TTS provider; test Kokoro or other local TTS for consistent sample generation. A later cloud TTS provider can be added through the same interface. Never promise a given named voice across browser, OS, locale, or provider without verifying its availability and usage license. Do not add voice cloning to initial scope.

Segmentation: Short / sentence / paragraph / smart boundaries, manually adjustable. Headings and notes are marked, not automatically spoken. Keep original text, normalized spoken text, token offsets, and the source block/column reference; AI may propose boundaries but may not quietly paraphrase or drop words. Smart segmentation considers meaning, sentence endings, commas, and natural breath groups, with user correction.

Two distinct word-follow systems:

• Assistant-reading highlight: Prefer TTS providers that expose word/phoneme timing metadata tied to the audio. For prerecorded chunks, cache generated audio + timing events. Browser SpeechSynthesisUtterance boundary events may support simple fallback highlighting but are not reliable across all browsers; if unavailable, visibly highlight the current chunk rather than presenting fake word-level precision.
• Creator-speaking highlight: Use streaming/short-window transcription with timestamps plus fuzzy text alignment and confidence checks. It is a separate feature from TTS highlighting; for the first build, phrase/chunk highlighting is an honest fallback when exact word tracking is not reliable.

Highlight styles: current word, already-spoken words, upcoming words, focused line, adjustable font/line spacing/contrast, optional auto-scroll, reduced-motion setting, dark studio mode, and a large teleprompter display. Highlight must follow the actual playback or recognized speech, not a hard-coded words-per-minute timer.

5. Voice commands and controls

Initial command intents and common synonyms:

| Intent       | Phrases/examples                                | Behavior                                                                                                                                       |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| START        | ‘Start’, ‘Begin’                                | Begin/resume the current session when idle or ready.                                                                                           |
| STOP / PAUSE | ‘Stop’, ‘Pause’, ‘Hold on’                      | Halt reading, suspend auto-advance and recording decisions safely; preserve progress. Clarify in UI whether ‘stop’ means pause or end session. |
| CONTINUE     | ‘Continue’, ‘Resume’                            | Resume from current section.                                                                                                                   |
| REPEAT       | ‘Repeat’, ‘Read it again’, ‘Repeat this line’   | Replay the current script section without deleting its takes.                                                                                  |
| RETAKE       | ‘Retake’, ‘Let me try again’                    | Mark the next take as an alternative for the current section, keeping prior takes.                                                             |
| NEXT         | ‘Next’, ‘Next line’                             | Advance one section; ask confirmation only if doing so would discard unsaved content.                                                          |
| PREVIOUS     | ‘Go back’, ‘Previous line’                      | Return to prior section.                                                                                                                       |
| NAVIGATE     | ‘Go to scene three’, ‘Back to the introduction’ | Resolve section only if sufficiently confident; preview target when ambiguous.                                                                 |
| SPEED        | ‘Slower’, ‘Faster’, ‘Normal speed’              | Adjust assistant playback rate in supported increments.                                                                                        |
| CHUNK SIZE   | ‘Read less’, ‘Read a full sentence’             | Change future chunk size without changing previously recorded take links unexpectedly.                                                         |
| HELP         | ‘What can I say?’                               | Show a concise command guide.                                                                                                                  |

Touch, keyboard and accessible controls must mirror every critical voice command. User can customize aliases but cannot unintentionally remove the only way to pause. Suppress commands within ordinary script speech using state and contextual checks; a configurable wake phrase is an optional escalation. Show what command was recognized and let the user undo navigation or a destructive action. No irreversible deletion from voice commands alone.

6. Script input and integrations

Release 1: Paste text and a simple in-app editor; import plain text and, after parser tests, DOCX/PDF with an editable extraction preview. Allow manual selection of speaking text and note blocks. Treat image-only PDFs as an explicit unsupported or separately scoped OCR case, not a promised import capability.

Later: Authorized Notion and Google Docs integrations through their respective APIs, with access scopes, pagination, structured blocks/tables, source metadata, selection, and user confirmation. Import only user-selected documents/pages. A browser extension is a separate project with per-site adapters; DOM scraping alone cannot guarantee correct content extraction for every website or application. External mobile apps may require sharing/importing rather than arbitrary cross-app reading.

Internal document contract: A structured ordered list of ScriptBlock entities: { id, type: spoken|heading|note|scene_cue, text, source, order, metadata }; optionally a ScriptChunk list with stable IDs and precise ranges into spoken blocks. Support tables by storing source row/column provenance. Each import adapter must output the same validated contract and preserve a downloadable source/original where appropriate.

7. Technology and architectural decisions

• Frontend: Nuxt (current verified stable major), Vue 3, TypeScript, Nuxt UI + Tailwind; a clear token-based design system. Use native browser APIs for media with thin typed adapters. Client-only recording UI; avoid attempting SSR of camera/microphone objects.
• App backend: Nuxt/Nitro server routes for simple script/session/settings APIs in the initial product. Introduce a separate NestJS service only if concrete scaling/deployment needs justify it.
• Recording controller: Independent TypeScript package with a typed state machine, commands, transitions, event log, and deterministic tests; no direct imports from Vue, Nuxt, audio hardware, or an AI SDK.
• AI service: Python/FastAPI for local speech, VAD, TTS, and optional language-model processing. WebSocket or HTTP transport chosen per operation; version all messages. Implement timeouts, cancellation, health checks and error recovery.
• AI providers: Ollama with a tested compact instruction model for script segmentation and occasional non-urgent intent interpretation; faster-whisper or another STT model as a speech-transcription candidate; Silero VAD as a speech/silence detection candidate; Kokoro as a TTS candidate. These are candidates, not guaranteed winners. Measure on target hardware. Prefer deterministic rules for straightforward controls.
• Persistence: Local drafts and assets for single-device prototype with clear storage limits, export/backup and recovery. Add PostgreSQL + a single selected ORM once account sync, memberships, and multi-device sessions are required. Store large video/audio assets in a file/object-storage layer, not database rows.
• Future mobile: Nuxt web/PWA first. Investigate Capacitor and native camera/audio requirements through a device prototype before promising parity or background listening. Keep business logic and API contracts platform-agnostic.
• Cloud migration: Provider interfaces for ScriptSegmenter, TTSProvider, STTProvider, VADProvider, MediaCapture, Storage, and DocumentImporter. Maintain the same application contract when changing providers. Keep local-only operation explicit; a local Ollama instance serves the developer’s machine, not arbitrary users’ phones.

Runtime session states (starting proposal): idle -> preparing -> ready -> assistant_speaking -> settle -> waiting_for_speech -> creator_speaking -> evaluating -> review_or_advance -> ready -> ... -> completed, with paused, recovering, and error. State transitions own timer cleanup and audio stream cancellation; every event carries sessionId, chunkId, sequence, monotonicTimestamp, and provider request ID as relevant. Stale async responses must not advance the wrong chunk. Model output never directly mutates UI, recorded assets, or navigation.

8. Explicit dependencies to avoid introducing early

• No React/Next/Vite app in parallel with Nuxt; Nuxt already uses a build system. No simultaneous second SPA framework.
• No NestJS microservice, Rails service, GraphQL, message broker, Redis, Kubernetes, microservice mesh, or event sourcing just to deliver the first guided-recording session.
• No LangChain/LlamaIndex/agent framework for the critical read/listen/advance loop. Use explicit typed provider calls and deterministic transition rules. Language models are optional helpers, not the timing authority.
• No multiple competing state stores or heavy state-machine package until the typed internal engine proves insufficient. A small Pinia store is for app/UI state, not a second copy of session truth.
• No simultaneous Prisma and Drizzle; select at most one if/when a database is needed.
• No duplicate TTS/STT SDKs, video-editing SDKs, animation libraries, or UI libraries without a documented comparison and removal plan.
• No paid API requirement, default always-on cloud upload, analytics/session replay that captures scripts or raw audio, or unreviewed automatic voice cloning.
• No full non-linear video editor, AI avatar, automatic social posting, OAuth for every document provider, cross-website browser extension, or background mobile service in the first complete vertical slice.
• No unlicensed models, fonts, media assets, or dependencies; verify commercial licenses and attribution before release.

Dependency rule: Claude Code must maintain docs/architecture/dependency-decisions.md: name, purpose, lighter alternative considered, maintenance/license/security risk, bundle/runtime impact, approval, and owning workstream. Do not add a dependency to solve a speculative future problem.

9. Visual and experience direction

Product feeling: focused, premium creator studio; unmistakable recording status; generous spacing; clear typography; large primary actions; low-distraction transitions. Design quality is part of the first vertical slice, while final branding and product name remain open. Build desktop, narrow laptop, tablet, and mobile responsive layouts from the start.

Design system spec: color tokens for canvas/surfaces/text/accent/success/warning/error and recording/live states; typography scale including teleprompter sizes; spacing/radii/elevation; focus and keyboard states; light/dark or deliberate studio theme; motion rules and reduced-motion support. Color may support meaning but may never be the sole indication of a recording state. Do not imply that decorative animation is a prerequisite for functional recording.

Required surfaces: dashboard/project list (can be skeletal first), script import/review, preflight audio/camera check, primary recording studio, focus/teleprompter view, take review and simple export, accessible settings panel. Save persistent settings per user/device appropriately, warn when capabilities are unavailable, and never hide a failed recording behind a success animation.

10. Privacy, reliability and correctness requirements

• Obtain explicit mic/camera permissions and visible capture indicators. Never record before a user action authorizes recording. No listening after stop, navigation away, or permission revocation.
• Provide a clear statement about what is processed locally, uploaded, persisted, and deleted. Opt-in is required before sending personal scripts or raw audio to a cloud provider.
• Graceful fallback for unavailable output selection, word timings, microphone, camera, voice commands, model service, connection, storage capacity, or export codec.
• Protect against background-tab suspension, mic/device changes, repeated taps, interrupted TTS, user speaking during playback, low-confidence transcript matching, accent variation, partial speech, echoes, and assistant self-triggering.
• Auto-save session metadata and protect existing takes from retake/delete bugs. Confirm destructive deletion.
• Avoid inventing guarantees about perfect separation of speaker audio. If using a separate external filming camera, do not claim access to its recording without an explicit later import.
• Build a repeatable browser/device compatibility matrix before public claims. For cloud deployment use HTTPS, auth and authorization, quotas, signed asset access, retention controls, and safe error logging.

11. Measurable success and acceptance tests

Create a baseline using the real 45-60-minute guided filming scenario and a shorter 60-second script. Collect number of interventions, time-to-finish, retakes, false advances, missed commands, leaked assistant audio, lost takes, and export failures. Set provisional target thresholds in the spec and revise using measured data; do not invent benchmarks now.

Minimum end-to-end acceptance examples:

1. Paste a script containing headings, spoken paragraphs, a comma, a full stop, and a table; user marks spoken content, changes chunk boundaries, and the assistant preserves exact wording.
2. In no-headset mode, assistant speaks and highlights each word when timing metadata exists; capture starts after playback/settle; user repeats, waits, and moves on automatically or manually.
3. Creator pauses mid-sentence for several seconds: session does not falsely advance or erase speech; user can repeat or complete the chunk.
4. User says ‘repeat this line’, ‘retake’, ‘previous line’, ‘pause’, ‘continue’, ‘slower’, and ‘next’; actions match states and never destroy earlier recordings.
5. With headset, audio preflight identifies selected input/output when supported; if routing fails, app explains and offers a safe alternative.
6. With unavailable word-timing API, script remains readable with accurate chunk highlight; no misleading simulated word-follow state.
7. In teleprompter mode, the creator’s speech drives line/word position where available; manual correction and regular autoscroll work when recognition fails.
8. Browser permission denied, mic unplugged, local AI service stopped, background tab, disk low, and interrupted export each produce recoverable and truthful outcomes.
9. Record at least two takes for one line, select the preferred one, export a reviewable video using a tested supported browser/codec; originals remain recoverable until deletion.
10. Distinct session IDs and monotonic sequence numbers prevent a late transcription from moving the next scene forward.

Test tiers: pure unit tests for transition logic, segmentation, offsets, command parsing, and transcript matching; contract tests for each AI and import adapter; synthetic audio integration tests; browser automation for accessible UI and media permission errors; manual real-device audio/video tests for quality and latency. A mocked AI response does not prove a real recording flow works.

12. Factory: parallel specification and development system

Goal: Use Claude Code to generate versioned specifications, split work into independent workstreams, implement modules in parallel only after contracts are stable, and merge through repeatable integration gates. ‘Factory’ means reusable templates, role instructions, interfaces, test gates, and task ownership; do not create an autonomous agent system that edits the same files simultaneously.

Required generated artifacts:

• CLAUDE.md: repo rules, source-of-truth spec index, working practices, no-dependency policy, test/verification commands, nonnegotiable product constraints.
• specs/000-product-vision.md: users, problem, success metrics, primary modes, out-of-scope and release criteria.
• specs/001-user-flows.md: preflight, import, listen/repeat, teleprompter, headset/no-headset, retake, review, export, failure states.
• specs/002-functional-requirements.md: numbered testable requirements with priorities and acceptance criteria.
• specs/003-architecture.md: boundaries, sequence diagrams, state machine, lifecycle and storage, offline/local/cloud modes, error handling.
• specs/004-data-contracts.md: TypeScript + Python-compatible versioned payloads, script offset/range rules, transcript/timing/command events, asset metadata.
• specs/005-ai-audio.md: model selection tests, latency targets to validate, capture/playback routing, voice catalog, timing/highlighting strategies, VAD/STT evaluation.
• specs/006-ui-design-system.md: visual tokens, layouts, responsive behavior, interaction states, accessibility, storyboard and design acceptance criteria.
• specs/007-testing-and-release.md: repeatable test suite, target devices and manual checklist, objective release gate.
• specs/008-integrations-roadmap.md: import adapters, permissions and table semantics, browser-extension and mobile feasibility gates.
• docs/architecture/decisions/: concise numbered architecture decision records (ADRs) with alternatives and rationale.
• factory/README.md, factory/workstreams.yaml, factory/agent-brief-template.md, factory/task-template.md, factory/integration-checklist.md, factory/change-request-template.md: reusable parallel-work protocol.
• tasks/: small ordered vertical slices with owner, dependencies, contract version, allowed edit paths, implementation plan, and acceptance tests.

Workstreams after contracts are agreed:
A. UX/design system and studio UI (owns Nuxt presentation components and design tokens).
B. Recording engine and media adapters (owns framework-independent controller, camera/microphone/media interfaces).
C. AI/audio service (owns Python models, provider adapters, streaming/transcription/timing contracts).
D. Script ingestion/document contracts (owns parsers, segmentation, source mapping, import UI handoff).
E. API/persistence and integrations (owns Nuxt server routes and persistent domain entities; OAuth integrations later).
F. Test/integration owner (owns cross-module tests, capability matrix, deployment checks and merge gate; cannot silently change public contracts).

Parallel safety: Each workstream gets an isolated git worktree/branch, a written task and allowed paths, and fixture-based contract tests. Freeze shared interfaces for a work cycle. A change to a shared event or schema requires an ADR/change request, version update, impacted-owner review, fixture updates, and an integration test. No parallel agent directly modifies another owner’s file or adds a global dependency without review. Integrate in thin vertical slices at least daily when working; do not leave all integration until the end. Use a single integration owner or explicit rotating integrator; continuous integration runs type checks, unit/contract tests, linting, build, and targeted device checks before merge.

Order of work: 0. Inspect repository and local hardware; establish licensing, secure permissions, supported browsers, metrics and working assumptions.

1. Finalize product spec, design tokens, interfaces, test fixtures, recording state diagram, and minimal no-headset protocol.
2. Spike real audio: microphone permission, TTS timing, VAD end-of-turn, device output selection, camera capture and actual export; record limitations and measurements.
3. Complete one polished vertical slice: paste script -> preflight -> read/highlight -> listen/repeat -> retake -> review/export. All other features remain behind documented contracts, not fake working buttons.
4. Add teleprompter mode, settings, persistence and recovery.
5. Add document imports, local model alternatives, browser/device matrix, and broader tests.
6. Only after validation, add auth/billing/hosted AI, cloud storage, document account integrations, extension and mobile app according to new specs.

Definition of done per task: Implemented behind stable contracts; relevant unit/contract/E2E tests pass; manual device behavior recorded when applicable; accessibility and responsive states addressed; screenshots or short test evidence included for UX work; security/privacy assumptions documented; docs updated; no unapproved dependency; no misleading feature claims.

13. First instruction to execute in Claude Code

> Read `filming_assistant_claude_code_brief.md` in full. Inspect the repository and current tool versions. Produce the versioned specs, ADRs, acceptance tests, reusable factory templates, dependency policy, and phased task graph described in sections 11-12. Begin with a concise list of confirmed decisions, unverified assumptions, and any truly blocking decisions. Treat the two highlighting paths and the headset/no-headset audio arrangements as separate testable contracts. Document exact owners and allowed edit paths for parallel workstreams. Create representative UI/design specifications early, then prioritize a real hardware-backed audio/recording spike before implementing feature breadth. Do not create the entire app in one pass. Do not add backend frameworks, agent frameworks, state management libraries, or cloud APIs without proving they are required by a named acceptance criterion. Deliver a proposed first vertical slice with tests and a clear integration sequence.

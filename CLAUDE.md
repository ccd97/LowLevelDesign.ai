# CLAUDE.md

Instructions for Claude when working on the LowLevelDesign.ai codebase.

## Project Overview

LowLevelDesign.ai is an Electron desktop app for practicing low-level design (LLD) / machine-coding interviews. Users generate OOP problems (ambiguous or detailed mode), implement them in a multi-file code workspace (Python or Java), run real code locally, ask an AI interviewer clarifying questions, generate runnable tests, and receive strict AI-scored evaluations with code snippets and Mermaid diagrams.

## Tech Stack

- **Electron** (v34) — desktop shell with context-isolated preload bridge
- **React 19** + **TypeScript** — renderer process UI
- **Vite** (v6) — build tooling, dev server on `127.0.0.1:5173`
- **Tailwind CSS** (v3) — styling via `src/index.css`
- **Lucide React** — icons
- **react-resizable-panels** — resizable workspace layout
- **OpenAI SDK** (pointed at OpenRouter) — all LLM calls
- **Mermaid** — design diagrams in evaluation feedback

## Architecture

### Two-Process Model

- **Main process** (`electron/main.ts`) — window lifecycle plus all IPC handlers: JSON storage, code execution, terminal workspace, IntelliSense, external libraries, feedback. No database — just JSON files in the app user-data dir.
- **Renderer process** (`src/`) — React app. Communicates with main exclusively via `window.electronAPI` (exposed in `electron/preload.ts`, typed in `src/types/electron.ts`).

### Key Modules

| Directory | Purpose | External API |
|---|---|---|
| `src/services/openrouter.ts` | Problem generation, clarifier chat, test generation, judge evaluation | OpenRouter (`openrouter.ai/api/v1`) |
| `src/services/templates.ts` | Blank / generic starter files per language | — |
| `src/services/feedbackService.ts` | User feedback submission | FormSubmit AJAX |
| `src/services/externalLibraries.ts` | Enabled-library resolution (renderer side) | Main process IPC |
| `src/utils/llmParsers.ts` | Safe JSON parsing for all model output (problem / clarify / evaluation) | — |
| `src/utils/codeAnalysis.ts` | Emptiness / completeness guard before judging | — |
| `src/utils/fileTree.ts` | Test-file detection, rename/delete helpers | — |
| `electron/runner.ts` | CodeRunner — writes files to `os.tmpdir()/lld_runs`, runs Python/Java | `python`, `javac`+`java` |
| `electron/terminal.ts` | Per-session workspace sync + interactive shell | OS shell |
| `electron/storage.ts` | Settings + sessions JSON persistence | App user-data dir |
| `electron/pathResolver.ts` | Python/Java/shell binary resolution | — |
| `electron/pythonEnv.ts` | venv detection + setup | — |
| `electron/externalLibraries.ts` | Java JAR / Python pip resolution + install | Maven Central / pip |
| `electron/intellisenseService.ts` | STL hover / completions / signature help | Main process IPC |

### Data Flow

1. Sessions are created in `NewSessionModal` (language, ambiguous/detailed mode, time budget 45/60/90/120, topic, concurrency flag) → problem generated via `openRouterService.generateProblem`
2. Problem + starter files + clarification chat live in `SessionData`; auto-saved via `storage:save-session` IPC
3. Code runs via `runner:execute` (clean temp dir per run, streamed `runner:log-output` chunks, `{ stdout, stderr, exitCode, status }`)
4. Terminal workspace synced via `terminal:sync-files`; interactive commands via `terminal:execute` with `terminal:output` / `terminal:exit` events
5. Tests generated via `openRouterService.generateTests` (Python `unittest`, Java standalone `main`)
6. Evaluation via `openRouterService.evaluateProject` → `EvaluationReport` (overall 0–100, 6 criteria 0–20, seniority, strengths, improvements with snippets + Mermaid)

### Run & Test Engine

The `CodeRunner` class (`electron/runner.ts`) executes candidate code by writing project files to a clean temp dir per run. It:
- Supports `run` and `test` modes for Python (`python`) and Java (`javac` + `java`)
- Streams stdout/stderr chunks live to the renderer
- Returns pass/fail/error/timeout status with execution time
- Resolves enabled external libraries (JAR classpath / pip env) per session

### AI Integration

- **OpenRouter** (`src/services/openrouter.ts`): Single `callOpenRouter()` helper (OpenAI SDK, `baseURL https://openrouter.ai/api/v1`, 3 retries, timeouts, response_format fallback). Used by `generateProblem`, `clarifyQuestion`, `generateTests`, `evaluateProject`. Single model slot (`openRouterModel`, default `nex-agi/nex-n2.5-mini:free`).
- **Safe parsing** (`src/utils/llmParsers.ts`): `safeParseProblemJson()`, `safeParseClarifyJson()`, `safeParseEvaluationJson()` — never trust raw model JSON; JSON-repair + fallback extraction lives here.
- **Judge** (`evaluateProject`): strict hiring-bar prompt, 6 criteria (problemAnalysis, classDesign, codeQuality, extensibility, concurrencyAndEdgeCases, testingAndCorrectness), overall = round(avg × 5), mandatory code snippets, Mermaid diagrams only for Class Design / Extensibility categories.
- **Clarifier** (`clarifyQuestion`): brief decisive answers (1–3 sentences), clarifies *what* never *how*, refuses implementation help and off-topic requests.

## Conventions

- **TypeScript strict mode** — `strict: true` in tsconfig
- **No default exports** — everything uses named exports
- **Type imports** — use `import type` for type-only imports
- **Functional React** — no class components, hooks only
- **State in App.tsx** — main application state lives in `App`, not in a state management library
- **Styling** — Tailwind utilities + `src/index.css`, no CSS modules or CSS-in-JS
- **No utility libraries** — no lodash, no axios. Uses native `fetch`, `crypto.randomUUID()`, etc.

## Commands

```bash
npm run dev               # Start dev server + Electron
npm run build             # TypeScript compile + Vite build + Electron build
npm run start             # Launch built Electron app
npm run package:mac       # Build + package for macOS (universal)
npm run package:mac:arm64 # Build + package for macOS (arm64)
npm run package:mac:x64   # Build + package for macOS (x64)
```

## Important Patterns

- The `window.electronAPI` object is typed in `src/types/electron.ts` — must stay in sync with `electron/preload.ts`
- Test-file detection must go through `isTestFilePath()` in `src/utils/fileTree.ts` — Python (`*test*.py`) and Java (`*Test.java`) conventions differ
- Evaluation output must go through `safeParseEvaluationJson()`; problem output through `safeParseProblemJson()` — never trust raw model JSON
- The session timer in `App` is the source of truth for time tracking
- The judge prompt constructs a system+user message pair with problem, clarification transcript, test output, and full file contents
- The clarifier prompt instructs the AI to never reveal solutions or give implementation guidance

## Common Tasks

- **Adding a new IPC channel**: Add handler in `electron/main.ts`, expose in `electron/preload.ts`, add type in `src/types/electron.ts`
- **Adding a new setting**: Add field to `Settings` type in `src/types/settings.ts`, update `DEFAULT_SETTINGS`, add UI in `src/components/SettingsModal.tsx`
- **Adding a new problem mode / budget**: Extend `ProblemMode` / `TimeBudget` in `src/types/session.ts`, update prompt logic in `openRouterService.generateProblem`, update UI in `src/components/NewSessionModal.tsx`
- **Changing AI behavior**: Edit the system prompt in `generateProblem`, `clarifyQuestion`, `generateTests`, or `evaluateProject` in `src/services/openrouter.ts`

## Behavioral Guidelines

These guidelines reduce common LLM coding mistakes. Bias toward caution over speed.

### 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs.

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First
Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes
Touch only what you must. Clean up only your own mess.

**When editing existing code:**
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

**When your changes create orphans:**
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- **The test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
Define success criteria. Loop until verified.

**Transform tasks into verifiable goals:**
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

**For multi-step tasks, state a brief plan:**
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

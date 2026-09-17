# Agent Instructions

## Project

LowLevelDesign.ai — an Electron + React + TypeScript desktop app for low-level design (LLD) / machine-coding interview practice. Users solve AI-generated OOP problems in a multi-file code workspace, run real Python/Java code, chat with an AI interviewer for clarifications, generate runnable tests, and get AI-scored evaluations.

## Stack

- Electron 34, React 19, TypeScript (strict), Vite 6
- Tailwind CSS 3, Lucide icons, react-resizable-panels
- OpenAI SDK pointed at OpenRouter (all LLM calls), Mermaid (diagrams), Prism (highlighting), Zod (validation)
- No state management library, no UI component kit

## Structure

```
electron/
  main.ts                # Main process — window + all IPC handlers
  preload.ts             # Context bridge — exposes window.electronAPI
  storage.ts             # JSON file storage (settings + sessions)
  runner.ts              # CodeRunner — real Python/Java execution in os.tmpdir()/lld_runs
  terminal.ts            # Per-session workspace on disk + interactive shell
  pathResolver.ts        # Python/Java/shell binary resolution
  pythonEnv.ts           # venv detection + setup
  externalLibraries.ts   # Java JAR / Python pip library resolution + install
  intellisenseService.ts # STL hover / completions / signature help
src/
  App.tsx           # Root component, all app state lives here
  main.tsx          # React entry point
  index.css         # Tailwind + global styles
  components/       # Header, ProblemPanel, FileExplorer, CodeEditor, TerminalPanel,
                    #   LandingPage, SettingsModal, NewSessionModal, EvaluationModal,
                    #   FeedbackModal, MarkdownViewer, MermaidViewer, ModalShell, ...
  services/         # openrouter (problem/chat/tests/judge), templates, feedbackService
  types/            # session, settings, evaluation, electron API types
  utils/            # llmParsers, problemText, codeAnalysis, fileTree, json, theme
  vite-env.d.ts     # Window API type declarations
```

## Key Patterns

- **IPC bridge**: Main process handles file I/O, code execution, and terminal. Renderer calls `window.electronAPI.*`. Types declared in `src/types/electron.ts` (must stay in sync with `electron/preload.ts`).
- **No database**: JSON files stored in the app user-data dir. Sessions list + per-session JSON (problem, files, chat, test output, evaluation report).
- **Run engine**: `CodeRunner` writes project files to a clean temp dir per run, spawns `python` / `javac`+`java`, streams chunks via `runner:log-output`. Returns `{ stdout, stderr, exitCode, status }` where status is `passed | failed | error | timeout`.
- **Terminal manager**: per-session workspace synced via `terminal:sync-files`, interactive commands via `terminal:execute` with `terminal:output` / `terminal:exit` events.
- **AI calls**: All go through `openRouterService` in `src/services/openrouter.ts` (OpenAI SDK with `baseURL https://openrouter.ai/api/v1`, 3 retries, timeouts, JSON-repair + fallback parsing in `src/utils/llmParsers.ts`). Single model slot (`openRouterModel`, default `nex-agi/nex-n2.5-mini:free`).
- **Named exports only** — no default exports anywhere.
- **Type imports** — always use `import type` for type-only imports.
- **State management** — all state in `App` component via `useState`/`useRef`. No Redux/Zustand.

## Commands

```
npm run dev               # Dev server + Electron
npm run build             # TS compile + Vite production build + Electron build
npm run start             # Launch built Electron app
npm run package:mac       # Package macOS .dmg (universal)
npm run package:mac:arm64 # Package macOS .dmg (arm64)
npm run package:mac:x64   # Package macOS .dmg (x64)
```

## How to Add Things

- **New IPC channel**: handler in `electron/main.ts` → expose in `electron/preload.ts` → type in `src/types/electron.ts`
- **New setting**: field in `src/types/settings.ts` (type + default in `DEFAULT_SETTINGS`) → UI in `src/components/SettingsModal.tsx` → persist via `storage.ts`
- **New problem mode / budget**: extend `ProblemMode` / `TimeBudget` in `src/types/session.ts` → prompt logic in `openRouterService.generateProblem` → UI in `src/components/NewSessionModal.tsx`
- **Change AI prompts**: edit `src/services/openrouter.ts` (`generateProblem`, `clarifyQuestion`, `generateTests`, `evaluateProject` system/user prompts)

## Rules

- Keep styling in Tailwind + `src/index.css` — no CSS modules, no CSS-in-JS beyond that
- Use native APIs (`fetch`, `crypto.randomUUID()`) — no axios, no lodash
- Functional components only, hooks only — no class components
- TypeScript strict mode — no `any` unless unavoidable (LLM JSON parsing is the main exception, and it must go through the safe parsers)
- Session timer is the source of truth for time tracking — don't duplicate timing logic
- Test-file detection must go through `isTestFilePath()` — Python (`*test*.py`) and Java (`*Test.java`) conventions differ
- Evaluation JSON must go through `safeParseEvaluationJson()` — never trust raw model output
- Problem JSON must go through `safeParseProblemJson()` — same reason

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

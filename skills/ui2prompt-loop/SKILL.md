---
name: ui2prompt-loop
description: >-
  Run UI2Prompt loop mode — continuously claim, fix, and self-review UI bugs a
  human annotates in their browser with the UI2Prompt extension. Use when the
  user pastes the UI2Prompt loop prompt, mentions UI2Prompt, "loop mode", or the
  ↻ Loop panel, or asks you to keep fixing annotated UI problems. The skill
  auto-starts a local task broker and exposes one CLI (loop.mjs) — no MCP or
  manual setup required.
---

# UI2Prompt — Loop mode

A human is annotating UI problems in their browser with the UI2Prompt extension.
Your job: continuously **claim → fix → self-review** each problem, asking the
human a multiple-choice question (non-blocking) when a fix has several valid
options. Keep looping until the human stops you.

## Setup is automatic

Everything runs through one bundled CLI. It **auto-starts the local broker** on
first use, keeps a stable agent id, and sends heartbeats. You never start a
server, configure MCP, or manage curl by hand.

Resolve the CLI path once per shell command (it lives beside this file):

```bash
LOOP="$HOME/.claude/skills/ui2prompt-loop/loop.mjs"; [ -f "$LOOP" ] || LOOP="$HOME/.cursor/skills/ui2prompt-loop/loop.mjs"
node "$LOOP" up       # ensure broker is running, register this agent
node "$LOOP" detect   # which scheduling mode to use (below)
```

Every command prints JSON to stdout. Requires Node 18+.

## Choose a scheduling mode (keep your context small)

A single long-running session that fixes every task will accumulate context and
slow down. **Don't do that.** Pick one of:

### A. Daemon mode — preferred when a coding-agent CLI exists

`node "$LOOP" detect` reports `"daemonCapable": true` when it finds a launchable
CLI (`claude`, `cursor-agent`, or `codex`). Then just run:

```bash
node "$LOOP" daemon
```

The daemon does the whole loop for you:

```
pull task → launch a FRESH agent session (e.g. claude -p …) → it fixes + self-reviews
that one task → prints a summary → exits → next task …
```

Because every task runs in its own short-lived process, **no context piles up**.
The daemon stays resident and keeps looping until:

- the human runs `node "$LOOP" stop` (or clicks **Stop** in the Loop panel),
- it gets SIGINT/SIGTERM, or
- the session/shell that started it ends (it is not detached).

Your main session only needs to start the daemon — it does **not** fix tasks
itself. Override the launcher with `UI2PROMPT_AGENT_BIN=claude|cursor-agent|codex`
or a full template `UI2PROMPT_AGENT_CMD='claude -p {PROMPT} --permission-mode acceptEdits'`.

### B. In-session mode — when there is no launchable CLI (e.g. zcode)

`detect` reports `"daemonCapable": false`. Loop yourself, but **dispatch a
subagent per task** so your main context stays lean:

```
- [ ] node "$LOOP" up           # once
- [ ] node "$LOOP" next         # claim a task
- [ ] hand the task to a SUBAGENT that fixes it + runs fixed/reviewed
- [ ] repeat → next
```

Never fix every task in one growing context — one subagent (fresh context) per
task, just like the daemon launches one session per task.

## CLI reference

| Command | What it does |
| --- | --- |
| `node "$LOOP" up` | Ensure the broker is running; print health. Run this first. |
| `node "$LOOP" detect` | Report the available agent CLI + recommended mode (daemon / in-session). |
| `node "$LOOP" daemon` | Run the scheduler: a fresh agent session per task. Blocks until stopped. |
| `node "$LOOP" stop` | Ask a running daemon/agents to stop after the current task. |
| `node "$LOOP" next` | Claim the next task. Prints `{"task":{…}}` or `{"task":null}` (queue empty). |
| `node "$LOOP" details <id>` | Full 4-layer DOM (Raw / Semantic / Accessibility / Layout). |
| `node "$LOOP" fixed <id> "summary"` | Mark **AI-fixed** after you edit the code. |
| `node "$LOOP" reviewed <id> "summary"` | Mark **AI-reviewed** after you self-check the fix. |
| `node "$LOOP" ask <id> "question" "A" "B"` | Ask the human (non-blocking). Prints a `questionId` — do **not** wait. |
| `node "$LOOP" answer <questionId>` | Poll the answer. `{"answered":false}` → keep working; `{"answered":true,…}` → apply it. |
| `node "$LOOP" release <id>` | Return a task to the queue if you cannot do it. |
| `node "$LOOP" list` | Overview of all tasks + pending questions. |

A claimed task looks like:

```json
{ "task": { "id": "a1b2", "url": "http://localhost:5179/#…", "title": "Settings",
  "problem": "Save button text is too low-contrast",
  "location": "Billing tab → .card-actions button.primary",
  "selector": "#saveBtn", "feedback": "", "uiContext": [ … ] } }
```

## Handling rejections (feedback)

When a human rejects a fix, the task returns to the queue carrying a **`feedback`**
string — their reason / what to do differently. Always check it on a claimed task
and address it; do not just repeat the previous fix. The human can keep editing
that feedback until the task is claimed again, so re-read it each time you claim.

## Fixing a task

1. Find the source from `problem` + `location` (run `details <id>` if you can't
   locate the element), then implement the **smallest correct, root-cause** fix
   in the real source files.
2. If the task has **multiple reasonable solutions**, `ask <id> "question" "A" "B"`.
   Do **not** wait — poll `answer <questionId>` later and apply it.
3. After fixing: `fixed <id> "summary"`, then self-review and `reviewed <id> "summary"`.

## Rules

- Only work a task you (or the daemon) claimed — the broker locks each task to one
  agent. Multiple agents/daemons may run at once; never assume a task is yours.
- Keep summaries concrete: path + line + what changed.
- Markers in the human's browser update live (in-progress → AI-fixed → AI-reviewed);
  they confirm or reject each fix. A rejected task returns to the queue with feedback.
- **Never stop on your own** — keep looping until the human stops you.

Begin now: `node "$LOOP" up`, then `node "$LOOP" detect`.

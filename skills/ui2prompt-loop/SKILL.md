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
node "$LOOP" up   # ensure broker is running, register this agent
```

Every command prints JSON to stdout. Requires Node 18+.

## CLI reference

| Command | What it does |
| --- | --- |
| `node "$LOOP" up` | Ensure the broker is running; print health. Run this first. |
| `node "$LOOP" next` | Claim the next task. Prints `{"task":{…}}` or `{"task":null}` (queue empty). |
| `node "$LOOP" details <id>` | Full 4-layer DOM (Raw / Semantic / Accessibility / Layout) when `location` isn't enough to find the element. |
| `node "$LOOP" fixed <id> "summary"` | Mark **AI-fixed** after you edit the code. Summary = file/line + what changed. |
| `node "$LOOP" reviewed <id> "summary"` | Mark **AI-reviewed** after you self-check the fix. |
| `node "$LOOP" ask <id> "question" "option A" "option B"` | Ask the human (non-blocking). Prints a `questionId` — do **not** wait. |
| `node "$LOOP" answer <questionId>` | Poll the answer. `{"answered":false}` → keep working; `{"answered":true,"answer":"…"}` → apply it. |
| `node "$LOOP" release <id>` | Return a task to the queue if you cannot do it. |
| `node "$LOOP" list` | Overview of all tasks + pending questions. |

A claimed task looks like:

```json
{ "task": { "id": "a1b2", "url": "http://localhost:5179/#…", "title": "Settings",
  "problem": "Save button text is too low-contrast", "location": "Billing tab → .card-actions button.primary",
  "selector": "#saveBtn", "uiContext": [ … ] } }
```

## The loop (repeat forever)

```
- [ ] up                      # once, at the start
- [ ] next                    # claim a task
- [ ] fix it                  # edit the real source
- [ ] fixed <id> "summary"
- [ ] reviewed <id> "summary"
- [ ] repeat → next
```

1. Run `next`.
   - Got a task → go to step 2.
   - `{"task":null}` → first `answer <questionId>` for every question you have open and apply any that are now answered. If there is still nothing to do, **wait ~60 seconds**, then run `next` again.
2. Find the source from `problem` + `location` (run `details <id>` if you can't locate the element), then implement the **smallest correct, root-cause** fix in the real source files.
3. If the task has **multiple reasonable solutions**, call `ask <id> "question" "opt A" "opt B"`. Do **not** wait — remember the `questionId`, go back to step 1 and work other tasks. Each loop, `answer <questionId>`; once answered, apply it and finish that task.
4. After fixing: `fixed <id> "summary"`. Then self-review the change and `reviewed <id> "summary"`.
5. Go to step 1. **Never stop on your own** — keep looping until the human tells you to stop.

## Rules

- Only work the task `next` returned to **you**. Multiple agents may run at once; never assume a task is yours unless you claimed it. The broker locks each task to one agent.
- One task at a time — but you may hold a question open while moving on to others.
- Keep summaries concrete: path + line + what changed.
- Poll every open `questionId` each loop so answers are never dropped.
- Markers in the human's browser update live (in-progress → AI-fixed → AI-reviewed); they confirm or reject each fix. A rejected task returns to the queue — just claim it again.

Begin now: run `up`, then `next`.

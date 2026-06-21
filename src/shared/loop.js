import { describeLocation, buildDomDetails } from "./prompt.js";

/**
 * Loop mode glue (requirement: human annotates UI problems, agents fix them in
 * a continuous loop). Two pure builders, shared by the popup + background:
 *   - buildLoopTask    : annotation → broker task payload
 *   - buildLoopPrompt  : the copy-paste "start your agent" instructions
 */

/** Map an annotation to the task payload pushed to the broker. */
export function buildLoopTask(annotation, { locale } = {}) {
  const page = { url: annotation.url, title: annotation.title, annotations: [annotation] };
  return {
    id: annotation.id,
    url: annotation.url || "",
    title: annotation.title || "",
    problem: annotation.userNote || "",
    location: describeLocation(annotation, locale),
    selector: annotation.locatorQuality !== "weak" ? annotation.selector || "" : "",
    label: annotation.label || "",
    uiContext: annotation.uiContext || [],
    domDetails: buildDomDetails(page, { locale }),
    layers: annotation.layers || null,
  };
}

const INSTALL_ONELINER =
  "curl -fsSL https://github.com/cocbin/MarkUI2Prompt/releases/latest/download/install.sh | bash";

const LOOP_PROMPT_I18N = {
  en: [
    "# UI2Prompt — Loop mode",
    "",
    "Use the `ui2prompt-loop` skill now. A human is annotating UI problems in their",
    "browser; keep fixing them until they tell you to stop. Setup is automatic — the",
    "skill's CLI auto-starts the local broker (no MCP). CLI (use whichever exists):",
    "  ~/.claude/skills/ui2prompt-loop/loop.mjs",
    "  ~/.cursor/skills/ui2prompt-loop/loop.mjs",
    "",
    "Pick the scheduling mode so your context stays small (a single session must NOT",
    "accumulate every task):",
    "  `node <cli> up` then `node <cli> detect`.",
    "",
    "• Daemon mode (preferred when a coding-agent CLI like claude/cursor-agent exists):",
    "  run `node <cli> daemon`. It pulls each task, launches a FRESH agent session to",
    "  fix+review just that task, prints a summary, and exits — so no context piles up.",
    "  It stays resident and loops until you `node <cli> stop` (or the Loop panel Stop),",
    "  or the session ends. Your main session only schedules — it does NOT fix tasks.",
    "",
    "• In-session mode (no spawnable CLI, e.g. zcode): loop yourself, but dispatch a",
    "  SUBAGENT per task so your main context stays lean: `node <cli> next` → hand the",
    "  task to a subagent that fixes it, runs `details <id>` if needed, then `fixed <id>`",
    "  + `reviewed <id>`. Empty queue → wait ~60s → `next`. Never stop on your own.",
    "",
    "A claimed task may carry `feedback` — that is the human's reason a previous fix was",
    "rejected; address it. If multiple fixes are valid, `node <cli> ask <id> \"q\" \"A\" \"B\"`",
    "(non-blocking) and apply the answer once `node <cli> answer <questionId>` returns it.",
    "",
    "If the skill isn't installed, ask the human to run:",
    `  ${INSTALL_ONELINER}`,
    "",
    "Begin now: `node <cli> up`, then `node <cli> detect`.",
    "",
  ],
  "zh-CN": [
    "# UI2Prompt — Loop 循环模式",
    "",
    "现在使用 `ui2prompt-loop` 技能。人类正在浏览器里标注 UI 问题，请持续修复直到他让你停止。",
    "无需手动配置——技能的 CLI 会自动启动本地 broker（不需要 MCP）。CLI 路径（用存在的那个）：",
    "  ~/.claude/skills/ui2prompt-loop/loop.mjs",
    "  ~/.cursor/skills/ui2prompt-loop/loop.mjs",
    "",
    "先选择调度模式，避免单个会话堆积所有任务导致上下文越来越大：",
    "  先 `node <cli> up`，再 `node <cli> detect`。",
    "",
    "• 守护进程模式（存在 claude/cursor-agent 等命令行 Agent 时首选）：",
    "  运行 `node <cli> daemon`。它会拉取每个任务、启动一个全新的 Agent 会话只修复并自检该任务、",
    "  输出摘要后退出——因此上下文不会累积。守护进程常驻循环，直到你执行 `node <cli> stop`",
    "  （或 Loop 面板的「停止」），或会话结束时自动退出。主会话只负责调度，不亲自修复任务。",
    "",
    "• 会话内模式（没有可启动的 CLI，例如 zcode）：自己循环，但每个任务派发一个 SUBAGENT 去执行，",
    "  让主会话上下文保持精简：`node <cli> next` → 把任务交给 subagent 修复（需要时 `details <id>`），",
    "  随后 `fixed <id>`、`reviewed <id>`。队列空了 → 等约 60 秒 → `next`。绝不自行停止。",
    "",
    "领取到的任务可能带有 `feedback`——那是人类驳回上次修复的理由，请据此修改。若有多种合理解法，",
    "用 `node <cli> ask <id> \"问题\" \"A\" \"B\"`（不阻塞），待 `node <cli> answer <questionId>` 返回答案后再执行。",
    "",
    "若技能尚未安装，请让人类执行：",
    `  ${INSTALL_ONELINER}`,
    "",
    "现在开始：`node <cli> up`，然后 `node <cli> detect`。",
    "",
  ],
};

/** Build the copy-paste startup prompt the human hands to their coding agent. */
export function buildLoopPrompt({ locale } = {}) {
  return (LOOP_PROMPT_I18N[locale] || LOOP_PROMPT_I18N.en).join("\n");
}

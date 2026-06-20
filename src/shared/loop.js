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
    "Use the `ui2prompt-loop` skill and run loop mode now. A human is annotating UI",
    "problems in their browser; fix them continuously until they tell you to stop.",
    "",
    "Setup is automatic — the skill's CLI auto-starts the local broker. You do NOT",
    "need MCP or any manual setup. The CLI lives at (use whichever exists):",
    "  ~/.claude/skills/ui2prompt-loop/loop.mjs",
    "  ~/.cursor/skills/ui2prompt-loop/loop.mjs",
    "",
    "Loop forever:",
    '1. `node <cli> up`, then `node <cli> next` to claim a task (`{"task":null}` = empty queue).',
    "2. Fix the real source (run `node <cli> details <id>` if you can't find the element).",
    '3. Multiple valid fixes? `node <cli> ask <id> "question" "A" "B"` — do NOT wait; keep',
    "   working other tasks and poll `node <cli> answer <questionId>` each loop, then apply it.",
    '4. `node <cli> fixed <id> "summary"`, then self-review and `node <cli> reviewed <id> "summary"`.',
    '5. Empty queue? Wait ~60s, then `next` again. Never stop on your own.',
    "",
    "If the skill isn't installed, ask the human to run:",
    `  ${INSTALL_ONELINER}`,
    "",
    "Begin now.",
    "",
  ],
  "zh-CN": [
    "# UI2Prompt — Loop 循环模式",
    "",
    "请使用 `ui2prompt-loop` 技能，现在开始 loop 模式。人类正在浏览器里标注 UI 问题，",
    "你的职责是持续修复它们，直到人类让你停止。",
    "",
    "无需任何手动配置——技能的 CLI 会自动启动本地 broker，你不需要 MCP 或手动启动服务。",
    "CLI 路径（用存在的那个）：",
    "  ~/.claude/skills/ui2prompt-loop/loop.mjs",
    "  ~/.cursor/skills/ui2prompt-loop/loop.mjs",
    "",
    "持续循环：",
    '1. 先 `node <cli> up`，再 `node <cli> next` 领取任务（`{"task":null}` 表示队列为空）。',
    "2. 定位并修改真实源码（找不到元素时用 `node <cli> details <id>` 获取 4 层 DOM）。",
    '3. 有多种合理解法？`node <cli> ask <id> "问题" "方案A" "方案B"`——不要等待；继续做其他',
    "   任务，每轮用 `node <cli> answer <questionId>` 复查，拿到答案再执行。",
    '4. `node <cli> fixed <id> "summary"`，随后自查并 `node <cli> reviewed <id> "summary"`。',
    "5. 队列空了？等待约 60 秒再 `next`。绝不自行停止。",
    "",
    "若技能尚未安装，请让人类执行：",
    `  ${INSTALL_ONELINER}`,
    "",
    "现在开始。",
    "",
  ],
};

/** Build the copy-paste startup prompt the human hands to their coding agent. */
export function buildLoopPrompt({ locale } = {}) {
  return (LOOP_PROMPT_I18N[locale] || LOOP_PROMPT_I18N.en).join("\n");
}

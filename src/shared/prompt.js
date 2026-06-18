import { STATUS, STATUS_ORDER, LOCATOR_QUALITY } from "./constants.js";

const STATUS_TAG = {
  [STATUS.OPEN]: "待修复",
  [STATUS.FIXED_PENDING]: "已修复待回归",
  [STATUS.CONFIRMED]: "已确认",
  [STATUS.REJECTED]: "重开待修复",
};

function oneLine(text, max = 160) {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Build the "location" hint for one annotation. Strategy (requirements 1/2/9):
 *   1. Vue source file + component when known (strongest, points at real code)
 *   2. A strong/medium semantic selector
 *   3. The element's text/class label
 * Weak (positional-only) selectors are intentionally omitted to avoid noise.
 */
function locationLine(a) {
  const parts = [];
  const fw = a.framework || {};
  const hasCode = fw.type === "vue" && (fw.file || fw.component);
  if (hasCode) {
    const comp = fw.component ? `组件 ${fw.component}` : "Vue 组件";
    parts.push(fw.file ? `${comp}（${fw.file}）` : comp);
  }
  const usableSelector = a.selector && a.locatorQuality && a.locatorQuality !== LOCATOR_QUALITY.WEAK;
  if (usableSelector) parts.push(`选择器 \`${a.selector}\``);

  // `label` is the element's visible text, or a class fallback when it has none.
  // Surface it as “文本” for real text; for a class fallback only keep it when it
  // is the sole locator (otherwise it just duplicates the selector / component).
  const label = a.label ? oneLine(a.label, 40) : "";
  const isClassFallback = label.startsWith(".");
  if (label && (!isClassFallback || (!hasCode && !usableSelector))) {
    parts.push(isClassFallback ? `元素 \`${label}\`` : `文本“${label}”`);
  }

  if (!parts.length) parts.push("（无稳定定位，请结合标注截图人工定位）");
  return parts.join(" · ");
}

function hasWeakOnly(annotations) {
  return annotations.some((a) => {
    const fw = a.framework || {};
    const hasCode = fw.type === "vue" && (fw.file || fw.component);
    const hasSelector = a.selector && a.locatorQuality !== LOCATOR_QUALITY.WEAK;
    return !hasCode && !hasSelector;
  });
}

function renderAnnotation(a, index) {
  const tag = STATUS_TAG[a.status] || a.status;
  const note = oneLine(a.userNote, 240) || "(无描述)";
  return [`${index}. [${tag}] ${note}`, `   - 位置: ${locationLine(a)}`].join("\n");
}

function renderPageSection(page, options) {
  const lines = [];
  if (options.multi) {
    if (page.title) lines.push(`### 页面：${page.title}`);
    lines.push(`URL: ${page.url}`);
  } else {
    lines.push("## 页面");
    if (page.title) lines.push(`- 标题: ${page.title}`);
    lines.push(`- URL: ${page.url}`);
  }
  lines.push("");
  lines.push("## 问题列表");
  page.annotations.forEach((a, i) => lines.push(renderAnnotation(a, i + 1)));
  if (hasWeakOnly(page.annotations)) {
    lines.push("");
    lines.push("> 注：部分问题无法稳定取得选择器，请结合导出的标注截图人工定位。");
  }
  return lines.join("\n");
}

function compactJson(pages) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      pages: pages.map((p) => ({
        title: p.title || "",
        url: p.url,
        annotations: p.annotations.map((a) => ({
          status: a.status,
          problem: a.userNote,
          component: a.framework?.component || "",
          file: a.framework?.file || "",
          selector: a.locatorQuality !== LOCATOR_QUALITY.WEAK ? a.selector : "",
          label: a.label || "",
        })),
      })),
    },
    null,
    2,
  );
}

/**
 * Build a concise LLM prompt from one or more pages of annotations.
 * Goal: tell the AI *where* (locate) and *what* (problem) — nothing else.
 */
export function buildPrompt(pages, options = {}) {
  const list = (Array.isArray(pages) ? pages : [pages]).filter(
    (p) => p && p.annotations && p.annotations.length,
  );
  const multi = list.length > 1;

  const header = [
    "# UI 修复任务（由 UI2Prompt 导出）",
    "",
    "你是资深前端工程师。以下是页面上标注的 UI 问题，请定位到对应源码并修复。每条包含「问题」与「位置」。状态含义：待修复=需修改；已修复待回归=已改待验证；重开待修复=上次修复被驳回需重做。",
    "",
  ];

  const body = list.length
    ? list.map((p) => renderPageSection(p, { multi })).join("\n\n---\n\n")
    : "_（当前没有任何标注数据）_";

  const jsonBlock = options.includeJson
    ? ["", "---", "", "## 结构化数据 (JSON)", "", "```json", compactJson(list), "```"].join("\n")
    : "";

  return `${header.join("\n")}${body}\n${jsonBlock}`.trimEnd() + "\n";
}

/** Status counts kept for callers that still summarise (popup uses its own). */
export function countByStatus(annotations) {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  for (const a of annotations) counts[a.status] = (counts[a.status] || 0) + 1;
  return counts;
}

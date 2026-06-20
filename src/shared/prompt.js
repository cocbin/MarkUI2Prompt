import { STATUS, STATUS_ORDER, LOCATOR_QUALITY } from "./constants.js";

/**
 * Prompt copy per locale (requirements item 7). Kept self-contained here rather
 * than reusing the UI i18n module so the background service worker can build a
 * prompt in any language without mutating shared i18n state.
 */
const PROMPT_I18N = {
  en: {
    title: "# UI fix task (exported by UI2Prompt)",
    intro:
      "You are a senior front-end engineer. Below are UI problems annotated on the page — locate the matching source code and fix each one. Every item has a “problem” and a “location”. Statuses: Open = needs fixing; Fixed·pending = changed, awaiting verification; Reopened = a previous fix was rejected and must be redone.",
    page: "## Page",
    titleLabel: "Title",
    urlLabel: "URL",
    pageWord: "Page",
    sep: ": ",
    problems: "## Problems",
    location: "Location",
    path: "Path",
    noNote: "(no description)",
    noLocate: "(no stable locator — use the exported screenshot to locate manually)",
    weakNote:
      "> Note: some items have no stable selector. Use the exported annotated screenshot to locate them manually.",
    uiDialog: "dialog",
    uiTab: "tab",
    uiSep: " › ",
    domRefNote:
      "> Full 4-layer DOM details (Raw DOM / Semantic DOM / Accessibility Tree / Visual Layout) for every item are in the companion file `{file}` — match each item by its `#id`.",
    domDocTitle: "# UI annotation — full 4-layer DOM details",
    domDocIntro:
      "Companion to the prompt. Each section matches a problem item by its `#id`. Layers: L1 Raw DOM (tag/attributes/outerHTML), L2 Semantic DOM (button/input/text/link), L3 Accessibility Tree (role/name/description), L4 Visual Layout (x/y/width/height/z-index).",
    json: "## Structured data (JSON)",
    empty: "_(No annotation data yet)_",
    comp: "Component",
    vue: "Vue component",
    selector: "selector",
    element: "element",
    text: "text",
    quoteL: "“",
    quoteR: "”",
    parenL: " (",
    parenR: ")",
    status: {
      open: "Open",
      fixed_pending: "Fixed·pending",
      confirmed: "Confirmed",
      rejected: "Reopened",
    },
  },
  "zh-CN": {
    title: "# UI 修复任务（由 UI2Prompt 导出）",
    intro:
      "你是资深前端工程师。以下是页面上标注的 UI 问题，请定位到对应源码并修复。每条包含「问题」与「位置」。状态含义：待修复=需修改；已修复待回归=已改待验证；重开待修复=上次修复被驳回需重做。",
    page: "## 页面",
    titleLabel: "标题",
    urlLabel: "URL",
    pageWord: "页面",
    sep: "：",
    problems: "## 问题列表",
    location: "位置",
    path: "路径",
    noNote: "（无描述）",
    noLocate: "（无稳定定位，请结合导出的标注截图人工定位）",
    weakNote: "> 注：部分问题无法稳定取得选择器，请结合导出的标注截图人工定位。",
    uiDialog: "对话框",
    uiTab: "标签页",
    uiSep: " › ",
    domRefNote:
      "> 每条标注的完整 4 层 DOM 详情（Raw DOM / Semantic DOM / Accessibility Tree / Visual Layout）见配套文件 `{file}`，按各条目的 `#id` 对应。",
    domDocTitle: "# UI 标注 — 完整 4 层 DOM 详情",
    domDocIntro:
      "提示词的配套文件。每个小节通过 `#id` 与一条问题对应。层级：L1 Raw DOM（标签/属性/outerHTML）、L2 Semantic DOM（按钮/输入框/文本/链接）、L3 Accessibility Tree（role/name/description）、L4 Visual Layout（x/y/width/height/z-index）。",
    json: "## 结构化数据 (JSON)",
    empty: "_（当前没有任何标注数据）_",
    comp: "组件",
    vue: "Vue 组件",
    selector: "选择器",
    element: "元素",
    text: "文本",
    quoteL: "“",
    quoteR: "”",
    parenL: "（",
    parenR: "）",
    status: {
      open: "待修复",
      fixed_pending: "已修复待回归",
      confirmed: "已确认",
      rejected: "重开待修复",
    },
  },
  "zh-TW": {
    title: "# UI 修復任務（由 UI2Prompt 匯出）",
    intro:
      "你是資深前端工程師。以下是頁面上標註的 UI 問題，請定位到對應原始碼並修復。每條包含「問題」與「位置」。狀態含義：待修復=需修改；已修復待回歸=已改待驗證；重開待修復=上次修復被駁回需重做。",
    page: "## 頁面",
    titleLabel: "標題",
    urlLabel: "URL",
    pageWord: "頁面",
    sep: "：",
    problems: "## 問題列表",
    location: "位置",
    path: "路徑",
    noNote: "（無描述）",
    noLocate: "（無穩定定位，請結合匯出的標註截圖人工定位）",
    weakNote: "> 註：部分問題無法穩定取得選擇器，請結合匯出的標註截圖人工定位。",
    uiDialog: "對話框",
    uiTab: "標籤頁",
    uiSep: " › ",
    domRefNote:
      "> 每條標註的完整 4 層 DOM 詳情（Raw DOM / Semantic DOM / Accessibility Tree / Visual Layout）見配套檔案 `{file}`，按各條目的 `#id` 對應。",
    domDocTitle: "# UI 標註 — 完整 4 層 DOM 詳情",
    domDocIntro:
      "提示詞的配套檔案。每個小節透過 `#id` 與一條問題對應。層級：L1 Raw DOM（標籤/屬性/outerHTML）、L2 Semantic DOM（按鈕/輸入框/文字/連結）、L3 Accessibility Tree（role/name/description）、L4 Visual Layout（x/y/width/height/z-index）。",
    json: "## 結構化資料 (JSON)",
    empty: "_（目前沒有任何標註資料）_",
    comp: "元件",
    vue: "Vue 元件",
    selector: "選擇器",
    element: "元素",
    text: "文字",
    quoteL: "“",
    quoteR: "”",
    parenL: "（",
    parenR: "）",
    status: {
      open: "待修復",
      fixed_pending: "已修復待回歸",
      confirmed: "已確認",
      rejected: "重開待修復",
    },
  },
  ja: {
    title: "# UI 修正タスク（UI2Prompt による出力）",
    intro:
      "あなたはシニアフロントエンドエンジニアです。以下はページ上で注釈された UI の問題です。該当するソースコードを特定して修正してください。各項目には「問題」と「位置」があります。ステータス：未対応=要修正、修正済み・確認待ち=変更済み未検証、再オープン=前回の修正が却下され再対応が必要。",
    page: "## ページ",
    titleLabel: "タイトル",
    urlLabel: "URL",
    pageWord: "ページ",
    sep: "：",
    problems: "## 問題一覧",
    location: "位置",
    path: "パス",
    noNote: "（説明なし）",
    noLocate: "（安定したロケーターなし。出力したスクショで手動特定してください）",
    weakNote:
      "> 注：一部の項目は安定したセレクターがありません。出力した注釈付きスクショで手動特定してください。",
    uiDialog: "ダイアログ",
    uiTab: "タブ",
    uiSep: " › ",
    domRefNote:
      "> 各項目の完全な 4 層 DOM 詳細（Raw DOM / Semantic DOM / Accessibility Tree / Visual Layout）は付属ファイル `{file}` にあります。各項目の `#id` で対応します。",
    domDocTitle: "# UI 注釈 — 完全な 4 層 DOM 詳細",
    domDocIntro:
      "プロンプトの付属ファイルです。各セクションは `#id` で問題項目に対応します。層：L1 Raw DOM（タグ/属性/outerHTML）、L2 Semantic DOM（ボタン/入力/テキスト/リンク）、L3 Accessibility Tree（role/name/description）、L4 Visual Layout（x/y/width/height/z-index）。",
    json: "## 構造化データ (JSON)",
    empty: "_（注釈データがありません）_",
    comp: "コンポーネント",
    vue: "Vue コンポーネント",
    selector: "セレクター",
    element: "要素",
    text: "テキスト",
    quoteL: "「",
    quoteR: "」",
    parenL: "（",
    parenR: "）",
    status: {
      open: "未対応",
      fixed_pending: "修正済み・確認待ち",
      confirmed: "確認済み",
      rejected: "再オープン",
    },
  },
  ko: {
    title: "# UI 수정 작업 (UI2Prompt로 내보냄)",
    intro:
      "당신은 시니어 프런트엔드 엔지니어입니다. 다음은 페이지에 주석된 UI 문제입니다. 해당 소스 코드를 찾아 각 항목을 수정하세요. 각 항목에는 '문제'와 '위치'가 있습니다. 상태: 미처리=수정 필요, 수정됨·확인 대기=변경됨 미검증, 다시 열림=이전 수정이 거부되어 재작업 필요.",
    page: "## 페이지",
    titleLabel: "제목",
    urlLabel: "URL",
    pageWord: "페이지",
    sep: ": ",
    problems: "## 문제 목록",
    location: "위치",
    path: "경로",
    noNote: "(설명 없음)",
    noLocate: "(안정적인 로케이터 없음 — 내보낸 캡처로 수동 위치 확인)",
    weakNote:
      "> 참고: 일부 항목은 안정적인 선택자가 없습니다. 내보낸 주석 캡처로 수동으로 위치를 찾으세요.",
    uiDialog: "대화상자",
    uiTab: "탭",
    uiSep: " › ",
    domRefNote:
      "> 각 항목의 전체 4계층 DOM 세부정보(Raw DOM / Semantic DOM / Accessibility Tree / Visual Layout)는 동봉 파일 `{file}`에 있습니다. 각 항목의 `#id`로 대응합니다.",
    domDocTitle: "# UI 주석 — 전체 4계층 DOM 세부정보",
    domDocIntro:
      "프롬프트의 동봉 파일입니다. 각 섹션은 `#id`로 문제 항목과 대응합니다. 계층: L1 Raw DOM(태그/속성/outerHTML), L2 Semantic DOM(버튼/입력/텍스트/링크), L3 Accessibility Tree(role/name/description), L4 Visual Layout(x/y/width/height/z-index).",
    json: "## 구조화 데이터 (JSON)",
    empty: "_(아직 주석 데이터가 없습니다)_",
    comp: "컴포넌트",
    vue: "Vue 컴포넌트",
    selector: "선택자",
    element: "요소",
    text: "텍스트",
    quoteL: "'",
    quoteR: "'",
    parenL: " (",
    parenR: ")",
    status: {
      open: "미처리",
      fixed_pending: "수정됨·확인 대기",
      confirmed: "확인됨",
      rejected: "다시 열림",
    },
  },
};

function resolvePromptLocale(locale) {
  return PROMPT_I18N[locale] ? locale : "en";
}

function oneLine(text, max = 160) {
  if (!text) return "";
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/**
 * Render the user's note in full — it is the most important content and must
 * never be truncated (requirements item 4). Internal newlines are kept and the
 * continuation lines indented so the Markdown list item stays well-formed.
 */
function fullNote(text, indent = "   ") {
  const clean = String(text == null ? "" : text).replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
  return clean ? clean.replace(/\n/g, `\n${indent}`) : "";
}

/** Short, stable cross-reference id linking a prompt item to its DOM section. */
function refId(a) {
  return String(a.id || "").replace(/-/g, "").slice(0, 8) || "item";
}

/**
 * Human "where in the UI" trail (requirements item 5): which dialog/drawer and
 * which active tab(s) the element sits in, outermost → innermost. This is what
 * lets an Agent understand "the Headers tab of the HTTP-request tab inside the
 * Project-data-source dialog" rather than a bare selector.
 */
function uiContextLine(a, L) {
  const ctx = Array.isArray(a.uiContext) ? a.uiContext : [];
  if (!ctx.length) return "";
  return ctx
    .map((s) => {
      const word = s.kind === "dialog" ? L.uiDialog : L.uiTab;
      return s.name ? `${word}${L.quoteL}${s.name}${L.quoteR}` : word;
    })
    .join(L.uiSep);
}

/**
 * Build the "location" hint for one annotation. Strategy (requirements §一):
 *   1. The full Vue/DOM stack — names *which usage* of a component to edit, and
 *      stays stable even when the visible text is dynamic. This is the lead.
 *   2. Vue source file + component when known (points at the component file).
 *   3. A strong/medium semantic selector (a precise CSS hook for relocation).
 * The raw visible text is only used as a last resort, because dynamic text
 * ("1 当 单击") is an unreliable anchor.
 */
function locationLine(a, L) {
  const parts = [];
  // Lead with the human UI trail (dialog/tab) — it is the most intuitive anchor.
  const ui = uiContextLine(a, L);
  if (ui) parts.push(ui);

  // Track the *code* locators separately so the visible-text fallback still
  // kicks in when only a UI trail (but no stable selector/stack) exists.
  const locators = [];
  const fw = a.framework || {};
  if (fw.domStack) locators.push(`${L.path} \`${fw.domStack}\``);

  const hasCode = fw.type === "vue" && (fw.file || fw.component);
  if (hasCode) {
    const comp = fw.component ? `${L.comp} ${fw.component}` : L.vue;
    locators.push(fw.file ? `${comp}${L.parenL}${fw.file}${L.parenR}` : comp);
  }
  const usableSelector =
    a.selector && a.locatorQuality && a.locatorQuality !== LOCATOR_QUALITY.WEAK;
  if (usableSelector) locators.push(`${L.selector} \`${a.selector}\``);

  // Fall back to the raw visible text when no stable code locator was found.
  if (!locators.length) {
    const label = a.label ? oneLine(a.label, 40) : "";
    if (label) {
      const isClassFallback = label.startsWith(".");
      locators.push(
        isClassFallback ? `${L.element} \`${label}\`` : `${L.text}${L.quoteL}${label}${L.quoteR}`,
      );
    }
  }

  parts.push(...locators);
  if (!parts.length) parts.push(L.noLocate);
  return parts.join(" · ");
}

/**
 * Public "where in the UI" description for one annotation in a given locale —
 * reused by loop mode so a task's `location` matches the prompt exactly.
 */
export function describeLocation(annotation, locale) {
  const L = PROMPT_I18N[resolvePromptLocale(locale)];
  return locationLine(annotation, L);
}

function hasWeakOnly(annotations) {
  return annotations.some((a) => {
    const fw = a.framework || {};
    const hasCode = fw.type === "vue" && (fw.file || fw.component);
    const hasSelector = a.selector && a.locatorQuality !== LOCATOR_QUALITY.WEAK;
    const hasStack = !!fw.domStack;
    return !hasCode && !hasSelector && !hasStack;
  });
}

function renderAnnotation(a, index, L, opts = {}) {
  const tag = L.status[a.status] || a.status;
  const note = fullNote(a.userNote) || L.noNote;
  const ref = opts.withRef ? ` \`#${refId(a)}\`` : "";
  return [`${index}. [${tag}]${ref} ${note}`, `   - ${L.location}: ${locationLine(a, L)}`].join("\n");
}

function renderPageSection(page, options, L) {
  const lines = [];
  if (options.multi) {
    if (page.title) lines.push(`### ${L.pageWord}${L.sep}${page.title}`);
    lines.push(`URL: ${page.url}`);
  } else {
    lines.push(L.page);
    if (page.title) lines.push(`- ${L.titleLabel}: ${page.title}`);
    lines.push(`- ${L.urlLabel}: ${page.url}`);
  }
  lines.push("");
  lines.push(L.problems);
  page.annotations.forEach((a, i) =>
    lines.push(renderAnnotation(a, i + 1, L, { withRef: options.withRef })),
  );
  if (hasWeakOnly(page.annotations)) {
    lines.push("");
    lines.push(L.weakNote);
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
          path: a.framework?.domStack || "",
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
 * Build a concise Agent prompt from one or more pages of annotations.
 * Goal: tell the Agent *where* (locate) and *what* (problem) — nothing else.
 * @param {object|object[]} pages
 * @param {{ includeJson?: boolean, locale?: string }} [options]
 */
export function buildPrompt(pages, options = {}) {
  const L = PROMPT_I18N[resolvePromptLocale(options.locale)];
  const list = (Array.isArray(pages) ? pages : [pages]).filter(
    (p) => p && p.annotations && p.annotations.length,
  );
  const multi = list.length > 1;
  const withRef = !!options.domFile;

  const header = [L.title, "", L.intro, ""];
  if (withRef) header.push(L.domRefNote.replace("{file}", options.domFile), "");

  const body = list.length
    ? list.map((p) => renderPageSection(p, { multi, withRef }, L)).join("\n\n---\n\n")
    : L.empty;

  const jsonBlock = options.includeJson
    ? ["", "---", "", L.json, "", "```json", compactJson(list), "```"].join("\n")
    : "";

  return `${header.join("\n")}${body}\n${jsonBlock}`.trimEnd() + "\n";
}

// ---- Full 4-layer DOM details document (requirements item 5) -------------

function renderLayers(a, L) {
  const layers = a.layers;
  const lines = [];
  if (!layers) {
    lines.push("```", "(no captured DOM layers for this item)", "```");
    return lines.join("\n");
  }
  const block = (heading, value) => {
    lines.push(`**${heading}**`, "", "```json", JSON.stringify(value, null, 2), "```", "");
  };
  block("L1 Raw DOM", layers.raw);
  block("L2 Semantic DOM", layers.semantic);
  block("L3 Accessibility Tree", layers.a11y);
  block("L4 Visual Layout", layers.layout);
  return lines.join("\n").trimEnd();
}

function renderDomItem(a, index, L) {
  const note = fullNote(a.userNote, "") || L.noNote;
  const lines = [
    `### #${refId(a)} · ${index}. ${oneLine(note, 120)}`,
    "",
    `- ${L.location}: ${locationLine(a, L)}`,
    "",
    renderLayers(a, L),
  ];
  return lines.join("\n");
}

/**
 * Build the companion "full 4-layer DOM details" document. It mirrors the
 * prompt's page/item structure and is linked back to it by each item's `#id`.
 */
export function buildDomDetails(pages, options = {}) {
  const L = PROMPT_I18N[resolvePromptLocale(options.locale)];
  const list = (Array.isArray(pages) ? pages : [pages]).filter(
    (p) => p && p.annotations && p.annotations.length,
  );
  const multi = list.length > 1;

  const out = [L.domDocTitle, "", L.domDocIntro, ""];
  if (!list.length) {
    out.push(L.empty);
    return out.join("\n").trimEnd() + "\n";
  }
  const sections = list.map((p) => {
    const head = multi
      ? [`## ${L.pageWord}${L.sep}${p.title || p.url}`, `URL: ${p.url}`, ""]
      : [`## ${p.title || p.url}`, `URL: ${p.url}`, ""];
    const items = p.annotations.map((a, i) => renderDomItem(a, i + 1, L));
    return head.concat(items.join("\n\n")).join("\n");
  });
  return out.join("\n") + sections.join("\n\n---\n\n") + "\n";
}

/** Status counts kept for callers that still summarise (popup uses its own). */
export function countByStatus(annotations) {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  for (const a of annotations) counts[a.status] = (counts[a.status] || 0) + 1;
  return counts;
}

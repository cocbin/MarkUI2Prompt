/**
 * Describe *where in the live UI* an element sits — which dialog/drawer and
 * which active tab(s) it is nested under (requirements item 5). This is the
 * piece a coding Agent needs to understand "the Headers tab of the HTTP request
 * tab inside the Project Data Source dialog", which a DOM/Vue stack alone does
 * not convey. Pure DOM, framework-agnostic (Element Plus / Ant / ARIA / etc.).
 *
 * Returns an ordered list (outermost → innermost), e.g.
 *   [{kind:"dialog", name:"项目数据源池"}, {kind:"tab", name:"HTTP 请求"},
 *    {kind:"tab", name:"Headers"}]
 */

const MAX_NAME = 60;

export const DIALOG_SEL = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  ".el-dialog",
  ".el-drawer",
  ".el-message-box",
  ".ant-modal",
  ".ant-drawer",
  ".n-modal",
  ".n-drawer",
  ".v-dialog__content",
  ".MuiDialog-paper",
  ".ivu-modal",
  ".arco-modal",
  ".arco-drawer",
  ".t-dialog",
  ".t-drawer",
  ".modal.show",
  ".modal-dialog",
].join(",");

// Tab *containers* that wrap both the tab headers and the panels, so they are
// ancestors of the annotated element.
export const TABS_SEL = [
  ".el-tabs",
  ".ant-tabs",
  ".van-tabs",
  ".n-tabs",
  ".ivu-tabs",
  ".arco-tabs",
  ".t-tabs",
].join(",");

export function clean(text) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  return s.length > MAX_NAME ? `${s.slice(0, MAX_NAME)}…` : s;
}

/**
 * Normalise a tab label: drop a leading step index ("02 ", "01.") and a trailing
 * badge count ("Headers 1" → "Headers") so the context reads like a human label.
 */
export function cleanTabLabel(text) {
  let s = clean(text);
  s = s.replace(/^(?:\d{2}[.):、:\s]*|\d{1,2}[.):、:\s]+)(?=\S)/, "");
  const m = s.match(/^(.*\D)\s*\d{1,3}$/);
  if (m && m[1].trim()) s = m[1].trim();
  return clean(s);
}

function matches(el, sel) {
  try {
    return el.matches && el.matches(sel);
  } catch {
    return false;
  }
}

export function textOf(node) {
  if (!node) return "";
  return clean(node.innerText || node.textContent || "");
}

function byIds(doc, ids) {
  return (ids || "")
    .split(/\s+/)
    .map((id) => id && doc.getElementById(id))
    .filter(Boolean)
    .map((n) => textOf(n))
    .filter(Boolean)
    .join(" ");
}

/** Best human title for a dialog/drawer container. */
function dialogTitle(node) {
  const aria = node.getAttribute && node.getAttribute("aria-label");
  if (aria) return clean(aria);
  const labelledby = node.getAttribute && node.getAttribute("aria-labelledby");
  if (labelledby) {
    const t = byIds(node.ownerDocument || document, labelledby);
    if (t) return clean(t);
  }
  const titleSel = [
    ".el-dialog__title",
    ".el-drawer__title",
    ".el-message-box__title",
    ".ant-modal-title",
    ".ant-drawer-title",
    ".n-card-header__main",
    ".ivu-modal-header-inner",
    ".arco-modal-header .arco-modal-title",
    ".t-dialog__header",
    ".modal-title",
    ".MuiDialogTitle-root",
  ].join(",");
  const hit = node.querySelector && node.querySelector(titleSel);
  if (hit) {
    const t = textOf(hit);
    if (t) return t;
  }
  const heading = node.querySelector && node.querySelector("h1,h2,h3,h4,[class*='title' i]");
  return heading ? textOf(heading) : "";
}

/** Active tab label inside a tabs container that wraps the annotated element. */
export function activeTabLabel(node) {
  const activeSel = [
    ".el-tabs__item.is-active",
    ".ant-tabs-tab-active .ant-tabs-tab-btn",
    ".ant-tabs-tab-active",
    ".van-tab--active",
    ".n-tabs-tab--active",
    ".ivu-tabs-tab-active",
    ".arco-tabs-tab-active",
    ".t-tabs__nav-item.t-is-active",
    '[role="tab"][aria-selected="true"]',
  ].join(",");
  const hit = node.querySelector && node.querySelector(activeSel);
  return hit ? textOf(hit) : "";
}

/** Tab label for an ARIA tabpanel via aria-labelledby (headless tab systems). */
function panelTabLabel(panel) {
  const labelledby = panel.getAttribute("aria-labelledby");
  if (labelledby) {
    const t = byIds(panel.ownerDocument || document, labelledby);
    if (t) return clean(t);
  }
  const id = panel.id;
  if (id) {
    const doc = panel.ownerDocument || document;
    const tab = doc.querySelector(`[role="tab"][aria-controls="${CSS.escape(id)}"]`);
    if (tab) return textOf(tab);
  }
  return "";
}

// Custom (non-ARIA, non-framework) tab systems: BEM-style content panes such as
// `bs-http__pane` / `bs-dsm__pane`, whose active tab is a sibling marked
// `is-active` / `active` (e.g. `bs-http__tab.is-active`). Very common in hand-
// rolled component libraries (requirements item 5 example).
export const PANE_RE = /(?:^|[\s_-])(?:pane|panel|tabpane|tab-pane|tab-content)$/i;
export const TABISH_RE = /(?:tab|step|seg|nav|pill)/i;
export const ACTIVE_RE = /(?:^|[\s_-])(?:is-active|active|is-selected|selected|is-checked)(?:$|[\s_-])/i;

export function classesOf(el) {
  const c = el.className;
  if (typeof c === "string") return c.split(/\s+/).filter(Boolean);
  if (c && typeof c.baseVal === "string") return c.baseVal.split(/\s+/).filter(Boolean);
  return [];
}

/**
 * If `node` is a BEM-style tab content pane (`{block}__pane`), find the active
 * tab of the same block (`{block}__…tab….is-active`) and return its label, plus
 * the block-root element so callers can de-duplicate per tab widget.
 */
export function customPaneTab(node) {
  const cls = classesOf(node);
  let block = "";
  for (const c of cls) {
    if (PANE_RE.test(c)) {
      const m = c.match(/^(.+?)__/);
      if (m) {
        block = m[1];
        break;
      }
    }
  }
  if (!block) return null;
  let root = null;
  try {
    root = node.closest(`.${CSS.escape(block)}`);
  } catch {
    root = null;
  }
  root = root || node.parentElement;
  if (!root) return null;
  let candidates = [];
  try {
    candidates = [...root.querySelectorAll(`[class*="${block}__"]`)];
  } catch {
    return null;
  }
  for (const el of candidates) {
    if (el === node || el.contains(node)) continue;
    const ec = classesOf(el);
    const isTabish = ec.some((c) => c.startsWith(`${block}__`) && TABISH_RE.test(c));
    const isActive = ec.some((c) => ACTIVE_RE.test(` ${c} `)) || el.getAttribute("aria-selected") === "true";
    if (isTabish && isActive && el.offsetParent !== null) {
      const label = cleanTabLabel(el.innerText || el.textContent || "");
      if (label) return { label, root };
    }
  }
  return { label: "", root };
}

export function describeUiContext(el) {
  if (!el || el.nodeType !== 1) return [];
  const segments = [];
  const seenTabs = new Set();
  const pushTab = (name, key) => {
    if (name && !seenTabs.has(key)) {
      seenTabs.add(key);
      segments.unshift({ kind: "tab", name });
    }
  };
  let node = el;
  let guard = 0;
  while (node && node.nodeType === 1 && node !== document.body && guard < 80) {
    if (matches(node, DIALOG_SEL)) {
      segments.unshift({ kind: "dialog", name: dialogTitle(node) || "" });
    } else if (matches(node, TABS_SEL)) {
      pushTab(activeTabLabel(node), node);
    } else if (node.getAttribute && node.getAttribute("role") === "tabpanel") {
      pushTab(panelTabLabel(node), node);
    } else {
      const custom = customPaneTab(node);
      if (custom) pushTab(custom.label, custom.root);
    }
    node = node.parentElement;
    guard += 1;
  }
  // Drop nameless dialog markers that add no information.
  return segments.filter((s) => s.kind !== "dialog" || s.name);
}

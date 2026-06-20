/**
 * Tab-aware re-localisation (requirement: a marker made inside one tab must NOT
 * linger at a wrong position when another tab is active, and "locate" must be
 * able to switch back to the recorded tab).
 *
 * At capture time we record the chain of *active tabs* an element sits under
 * (outermost → innermost) as `tabPath` entries:
 *     { kind:"tab", containerSelector, label, block }
 *   - containerSelector : best selector for the tab widget root (to re-find it)
 *   - label             : the active tab's normalised text at capture time
 *   - block             : BEM block name for custom panes ("" for framework tabs)
 *
 * At display time `isOnRecordedTab` tells the marker whether every recorded tab
 * is *currently* active; if not, the marker hides itself. At locate time
 * `activateTabPath` clicks the recorded tabs back into view.
 */
import { analyzeSelector } from "./locator.js";
import {
  TABS_SEL,
  PANE_RE,
  TABISH_RE,
  ACTIVE_RE,
  activeTabLabel,
  cleanTabLabel,
  classesOf,
  customPaneTab,
  textOf,
} from "./ui-context.js";

const FRAMEWORK_TAB_ITEM = [
  ".el-tabs__item",
  ".ant-tabs-tab",
  ".van-tab",
  ".n-tabs-tab",
  ".ivu-tabs-tab",
  ".arco-tabs-tab",
  ".t-tabs__nav-item",
  '[role="tab"]',
].join(",");

function matches(el, sel) {
  try {
    return !!(el && el.matches && el.matches(sel));
  } catch {
    return false;
  }
}

function selectorOf(el) {
  try {
    return analyzeSelector(el).selector || "";
  } catch {
    return "";
  }
}

/** BEM block of a content pane node (`bs-http__pane` → `bs-http`). */
function paneBlock(node) {
  for (const cls of classesOf(node)) {
    if (PANE_RE.test(cls)) {
      const m = cls.match(/^(.+?)__/);
      if (m) return m[1];
    }
  }
  return "";
}

function isActiveEl(el) {
  return classesOf(el).some((c) => ACTIVE_RE.test(` ${c} `)) || el.getAttribute("aria-selected") === "true";
}

/** Active tab label of a custom BEM tab widget rooted at `root`. */
function activeCustomLabel(root, block) {
  let candidates = [];
  try {
    candidates = [...root.querySelectorAll(`[class*="${block}__"]`)];
  } catch {
    return "";
  }
  for (const el of candidates) {
    const ec = classesOf(el);
    const isTabish = ec.some((c) => c.startsWith(`${block}__`) && TABISH_RE.test(c));
    if (isTabish && isActiveEl(el) && el.offsetParent !== null) return cleanTabLabel(textOf(el));
  }
  return "";
}

/** Current active tab label of a recorded container (framework or custom). */
function currentActiveLabel(seg, container) {
  if (!seg.block) return cleanTabLabel(activeTabLabel(container));
  return activeCustomLabel(container, seg.block);
}

/** Find the clickable tab header matching `label` inside `container`. */
function findTabHeader(seg, container, label) {
  if (!seg.block) {
    let items = [];
    try {
      items = [...container.querySelectorAll(FRAMEWORK_TAB_ITEM)];
    } catch {
      items = [];
    }
    return items.find((el) => cleanTabLabel(textOf(el)) === label) || null;
  }
  let candidates = [];
  try {
    candidates = [...container.querySelectorAll(`[class*="${seg.block}__"]`)];
  } catch {
    return null;
  }
  return (
    candidates.find((el) => {
      const ec = classesOf(el);
      const isTabish = ec.some((c) => c.startsWith(`${seg.block}__`) && TABISH_RE.test(c));
      return isTabish && cleanTabLabel(textOf(el)) === label;
    }) || null
  );
}

/** Record the active-tab chain an element is nested under (outer → inner). */
export function captureTabPath(el) {
  if (!el || el.nodeType !== 1) return [];
  const segs = [];
  const seen = new Set();
  let node = el;
  let guard = 0;
  while (node && node.nodeType === 1 && node !== document.body && guard < 80) {
    if (matches(node, TABS_SEL)) {
      if (!seen.has(node)) {
        seen.add(node);
        const label = cleanTabLabel(activeTabLabel(node));
        if (label) segs.unshift({ kind: "tab", containerSelector: selectorOf(node), label, block: "" });
      }
    } else {
      const custom = customPaneTab(node);
      if (custom && custom.root && custom.label && !seen.has(custom.root)) {
        seen.add(custom.root);
        segs.unshift({
          kind: "tab",
          containerSelector: selectorOf(custom.root),
          label: custom.label,
          block: paneBlock(node),
        });
      }
    }
    node = node.parentElement;
    guard += 1;
  }
  return segs;
}

/** Are all of an annotation's recorded tabs currently active/visible? */
export function isOnRecordedTab(annotation) {
  const path = annotation && annotation.tabPath;
  if (!Array.isArray(path) || !path.length) return true;
  for (const seg of path) {
    if (!seg || !seg.containerSelector) continue;
    let container = null;
    try {
      container = document.querySelector(seg.containerSelector);
    } catch {
      container = null;
    }
    if (!container) return false;
    if (currentActiveLabel(seg, container) !== seg.label) return false;
  }
  return true;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Click the recorded tabs back into view (outermost first so inner widgets
 * exist before we switch them). Returns the number of tabs switched.
 */
export async function activateTabPath(annotation) {
  const path = annotation && annotation.tabPath;
  if (!Array.isArray(path) || !path.length) return 0;
  let switched = 0;
  for (const seg of path) {
    if (!seg || !seg.containerSelector) continue;
    let container = null;
    try {
      container = document.querySelector(seg.containerSelector);
    } catch {
      container = null;
    }
    if (!container) continue;
    if (currentActiveLabel(seg, container) === seg.label) continue;
    const header = findTabHeader(seg, container, seg.label);
    if (header) {
      header.click();
      switched += 1;
      await delay(160);
    }
  }
  return switched;
}

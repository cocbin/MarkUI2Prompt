import { LOCATE_METHOD, LOCATOR_QUALITY } from "../shared/constants.js";

// Test-id style attributes give the strongest, intent-revealing anchors.
const TESTID_ATTRS = [
  "data-testid",
  "data-test",
  "data-test-id",
  "data-cy",
  "data-qa",
  "data-automation-id",
];
// Other attributes that are semantic enough to anchor on.
const SEMANTIC_ATTRS = ["name", "aria-label", "title", "placeholder", "alt", "role", "for"];

// Framework-injected / noisy data-* attributes that are NOT semantic anchors:
// Vue scoped-style ids (data-v-xxxx), React internals, etc.
const DATA_ATTR_DENY_RE = /^data-(v-|reactid|react-|sentry-|n-)/i;

// Class fragments that flip with UI state (tab switches, hover, etc.) and must
// never be used as a stable anchor.
const STATE_CLASS_RE =
  /(^|[-_])(active|selected|current|open|opened|show|shown|hidden|hide|visible|invisible|disabled|focus|focused|hover|hovered|checked|expanded|collapsed|loading|error|success|warning|dragging|sticky|fixed|highlight|highlighted)([-_]|$)/i;

function cssEscape(value) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return String(value).replace(/([^\w-])/g, "\\$1");
}

function isUnique(selector, el) {
  try {
    const nodes = document.querySelectorAll(selector);
    return nodes.length === 1 && nodes[0] === el;
  } catch {
    return false;
  }
}

/** A data-* attribute value is "stable" if it is not numeric/positional or a hash. */
function isStableAttrValue(val) {
  if (!val || typeof val !== "string") return false;
  if (val.length < 1 || val.length > 40) return false;
  if (/^\d+$/.test(val)) return false; // pure index, volatile
  if (/\d{4,}/.test(val)) return false; // embedded long number / id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(val)) return false; // uuid-ish
  return true;
}

/** Semantic data-* attributes (excludes framework noise), as {name,value}. */
function semanticDataAttrs(el) {
  const out = [];
  const attrs = el.attributes || [];
  for (const attr of attrs) {
    const name = attr.name;
    if (!name.startsWith("data-")) continue;
    if (DATA_ATTR_DENY_RE.test(name)) continue;
    if (TESTID_ATTRS.includes(name)) continue; // already covered by strongAnchor
    if (!isStableAttrValue(attr.value)) continue;
    out.push({ name, value: attr.value });
  }
  return out;
}

/** An id is "stable" if unique and not obviously auto-generated. */
function isStableId(el) {
  const id = el.id;
  if (!id || typeof id !== "string") return false;
  if (/\s/.test(id) || id.length > 50) return false;
  if (/\d{5,}/.test(id)) return false;
  if (/[:.]/.test(id)) return false;
  return isUnique(`#${cssEscape(id)}`, el);
}

/** A class is "meaningful" if it reads like a hand-written, non-stateful name. */
function isMeaningfulClass(cls) {
  if (!cls || cls.length < 2 || cls.length > 40) return false;
  if (!/^[a-zA-Z]/.test(cls)) return false;
  if (/\d{4,}/.test(cls)) return false;
  if (/^(css|sc|jsx|svelte|emotion|chakra|MuiButtonBase)-/i.test(cls)) return false;
  if (/^_[A-Za-z0-9]{4,}/.test(cls)) return false;
  // Random hash: long, mixed-case AND containing digits.
  if (cls.length >= 10 && /[a-z]/.test(cls) && /[A-Z]/.test(cls) && /\d/.test(cls)) return false;
  if (STATE_CLASS_RE.test(cls)) return false;
  return true;
}

export function meaningfulClasses(el) {
  return [...(el.classList || [])].filter(isMeaningfulClass);
}

/** Strongest local anchor for one element: `#id` or `tag[data-testid=…]`. */
function strongAnchor(el) {
  if (isStableId(el)) return `#${cssEscape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  for (const attr of TESTID_ATTRS) {
    const val = el.getAttribute && el.getAttribute(attr);
    if (!val) continue;
    const sel = `${tag}[${attr}="${cssEscape(val)}"]`;
    if (isUnique(sel, el)) return sel;
  }
  return null;
}

/**
 * A unique selector built only from semantic attributes/classes (no position).
 * Tries the most descriptive, human-readable anchors first and only returns a
 * selector that matches *exactly one* element on the page.
 */
function semanticLocal(el) {
  const tag = el.tagName.toLowerCase();
  const classSel = meaningfulClasses(el)
    .slice(0, 3)
    .map((c) => `.${cssEscape(c)}`)
    .join("");
  const dataAttrs = semanticDataAttrs(el);
  const namedAttrs = SEMANTIC_ATTRS.map((name) => ({
    name,
    value: el.getAttribute && el.getAttribute(name),
  })).filter((a) => a.value && a.value.length <= 60);

  const attr = (a) => `[${a.name}="${cssEscape(a.value)}"]`;
  const candidates = [];

  // 1) tag + class(es) — cleanest semantic anchor when unique.
  if (classSel) candidates.push(tag + classSel);
  // 2) tag + class(es) + a semantic attribute — descriptive *and* specific.
  for (const a of dataAttrs) candidates.push(`${tag}${classSel}${attr(a)}`);
  for (const a of namedAttrs) candidates.push(`${tag}${classSel}${attr(a)}`);
  // 3) tag + a single semantic attribute (no class).
  for (const a of dataAttrs) candidates.push(`${tag}${attr(a)}`);
  for (const a of namedAttrs) candidates.push(`${tag}${attr(a)}`);
  // 4) bare class(es) as a last semantic resort.
  if (classSel) candidates.push(classSel);

  for (const sel of candidates) {
    if (isUnique(sel, el)) return sel;
  }
  return null;
}

/** A class/tag descriptor (no positional index) for use inside a path. */
function localDescriptor(el) {
  const tag = el.tagName.toLowerCase();
  const classes = meaningfulClasses(el).slice(0, 2).map((c) => `.${cssEscape(c)}`);
  return classes.length ? tag + classes.join("") : tag;
}

/**
 * Try to anchor the element under a nearby strong/semantic ancestor using the
 * descendant combinator (robust against wrapper churn). No nth-of-type.
 */
function anchoredSemantic(el) {
  const local = semanticLocal(el) || localDescriptor(el);
  let node = el.parentElement;
  let depth = 0;
  while (node && node !== document.documentElement && depth < 6) {
    const anchor = strongAnchor(node) || semanticLocal(node);
    if (anchor) {
      const sel = `${anchor} ${local}`;
      if (isUnique(sel, el)) return sel;
    }
    node = node.parentElement;
    depth++;
  }
  return null;
}

function nthOfType(el) {
  const tag = el.tagName;
  let index = 1;
  let sib = el.previousElementSibling;
  let hasSameTagSibling = false;
  while (sib) {
    if (sib.tagName === tag) {
      index++;
      hasSameTagSibling = true;
    }
    sib = sib.previousElementSibling;
  }
  if (!hasSameTagSibling) {
    let next = el.nextElementSibling;
    while (next) {
      if (next.tagName === tag) {
        hasSameTagSibling = true;
        break;
      }
      next = next.nextElementSibling;
    }
  }
  return hasSameTagSibling ? `:nth-of-type(${index})` : "";
}

/** Full positional path from a stable ancestor (or <html>); always unique. */
function positionalPath(el) {
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== document.documentElement) {
    if (isStableId(node)) {
      parts.unshift(`#${cssEscape(node.id)}`);
      return parts.join(" > ");
    }
    parts.unshift(node.tagName.toLowerCase() + nthOfType(node));
    node = node.parentElement;
  }
  parts.unshift("html");
  return parts.join(" > ");
}

/**
 * Analyse an element into the best selector + a quality rating.
 * @returns {{selector:string, quality:string}}
 */
export function analyzeSelector(el) {
  if (!el || el.nodeType !== 1) return { selector: "", quality: LOCATOR_QUALITY.WEAK };
  if (el === document.body) return { selector: "body", quality: LOCATOR_QUALITY.MEDIUM };
  if (el === document.documentElement) return { selector: "html", quality: LOCATOR_QUALITY.MEDIUM };

  const strong = strongAnchor(el);
  if (strong) return { selector: strong, quality: LOCATOR_QUALITY.STRONG };

  const local = semanticLocal(el);
  if (local) return { selector: local, quality: LOCATOR_QUALITY.MEDIUM };

  const anchored = anchoredSemantic(el);
  if (anchored) return { selector: anchored, quality: LOCATOR_QUALITY.MEDIUM };

  return { selector: positionalPath(el), quality: LOCATOR_QUALITY.WEAK };
}

/** Build the most stable CSS selector available for an element. */
export function buildSelector(el) {
  return analyzeSelector(el).selector;
}

/** Build an XPath for an element (id-anchored when possible). Relocation only. */
export function buildXPath(el) {
  if (!el || el.nodeType !== 1) return "";
  if (isStableId(el)) return `//*[@id="${el.id}"]`;
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1) {
    let index = 1;
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.tagName === node.tagName) index++;
      sib = sib.previousElementSibling;
    }
    parts.unshift(`${node.tagName.toLowerCase()}[${index}]`);
    if (node.parentElement && isStableId(node.parentElement)) {
      parts.unshift(`//*[@id="${node.parentElement.id}"]`);
      return parts.join("/");
    }
    node = node.parentElement;
  }
  return `/${parts.join("/")}`;
}

function evaluateXPath(xpath) {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    const node = result.singleNodeValue;
    return node && node.nodeType === 1 ? node : null;
  } catch {
    return null;
  }
}

/** Element rect in page (document) coordinates. */
export function getPageBox(el) {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

export function boxCenter(box) {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Re-locate an annotation's element after possible DOM changes.
 * Priority: CSS selector -> XPath -> coordinate fallback (degraded).
 * @returns {{element: Element|null, method: string}}
 */
export function relocate(annotation) {
  if (annotation.selector) {
    try {
      const el = document.querySelector(annotation.selector);
      if (el) return { element: el, method: LOCATE_METHOD.SELECTOR };
    } catch {
      /* invalid selector */
    }
  }
  if (annotation.xpath) {
    const el = evaluateXPath(annotation.xpath);
    if (el) return { element: el, method: LOCATE_METHOD.XPATH };
  }
  return { element: null, method: LOCATE_METHOD.FALLBACK };
}

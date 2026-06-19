import {
  analyzeSelector,
  buildXPath,
  getPageBox,
  boxCenter,
  meaningfulClasses,
} from "./locator.js";
import { describeUiContext } from "./ui-context.js";
import { captureLayers } from "./dom-model.js";

const MAX_OUTER_HTML = 4000;
const MAX_INNER_TEXT = 2000;
const MAX_LABEL = 42;

/** Semantic, human-readable label for an element: its text, else its class. */
export function elementLabel(el) {
  const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return text.length > MAX_LABEL ? `${text.slice(0, MAX_LABEL)}…` : text;
  const cls = meaningfulClasses(el)[0] || (el.classList && el.classList[0]);
  if (cls) return `.${cls}`;
  return el.tagName ? el.tagName.toLowerCase() : "";
}

/** Capture stable locating info + DOM snapshot for an element (page coords). */
export function captureElement(el) {
  const box = getPageBox(el);
  const { selector, quality } = analyzeSelector(el);
  return {
    selector,
    locatorQuality: quality,
    xpath: buildXPath(el),
    label: elementLabel(el),
    title: typeof document !== "undefined" ? document.title : "",
    bbox: box,
    fallbackPosition: boxCenter(box),
    uiContext: describeUiContext(el),
    layers: captureLayers(el),
    dom: {
      outerHTML: (el.outerHTML || "").slice(0, MAX_OUTER_HTML),
      innerText: (el.innerText || el.textContent || "").trim().slice(0, MAX_INNER_TEXT),
    },
  };
}

/** Short human label for the hover highlight tag (tag + id/class). */
export function shortLabel(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls =
    !id && el.classList && el.classList.length
      ? `.${[...el.classList].slice(0, 2).join(".")}`
      : "";
  return `${tag}${id}${cls}`;
}

/**
 * Build a concise, semantic reference string for an element, preferring a Vue
 * source location, then a strong/medium selector, then the element's text. The
 * full Vue/DOM stack is appended in parentheses so a referenced element is tied
 * to *where* it is used, not just its component file (requirements §一/item 13).
 */
export function describeElementRef(el, framework) {
  const { selector, quality } = analyzeSelector(el);
  const label = elementLabel(el);
  const stack = framework && framework.domStack ? ` (${framework.domStack})` : "";
  if (framework && framework.type === "vue" && (framework.file || framework.component)) {
    const where = framework.file || framework.component;
    const comp = framework.component ? `<${framework.component}>` : "";
    return `${comp}${comp && where ? " " : ""}${where}${label ? ` “${label}”` : ""}${stack}`.trim();
  }
  if (quality !== "weak" && selector) {
    return `${selector}${label ? ` “${label}”` : ""}${stack}`;
  }
  return `${label || selector}${stack}`.trim();
}

import { uuid } from "./id.js";
import { STATUS, LOCATOR_QUALITY } from "./constants.js";

/**
 * @typedef {Object} Annotation
 * @property {string} id
 * @property {string} url
 * @property {string} title  document.title at capture time
 * @property {string} selector
 * @property {string} xpath
 * @property {string} locatorQuality  strong | medium | weak
 * @property {string} label  short semantic label (element text or class)
 * @property {{outerHTML:string, innerText:string}} dom
 * @property {{x:number,y:number,width:number,height:number}} bbox  page-space coords
 * @property {{x:number,y:number}} fallbackPosition  page-space center coords
 * @property {Array<{kind:string, name:string}>} uiContext  dialog/tab nesting (outer→inner)
 * @property {{raw:object, semantic:object, a11y:object, layout:object}} layers  4-layer DOM model
 * @property {string} userNote
 * @property {{type:string, component:string, file:string, vuePath:string, vnodePath?:string, domStack?:string}} framework
 * @property {Array<{containerSelector:string,label:string,kind:string}>} tabPath  active tab chain at capture (for cross-tab relocation)
 * @property {string} loopState  agent progress axis: ""|in_progress|ai_fixed|ai_reviewed
 * @property {string} agentSummary  latest agent note from loop mode
 * @property {"open"|"fixed_pending"|"confirmed"|"rejected"} status
 * @property {Array<{status:string, note?:string, timestamp:number}>} history
 * @property {number} timestamp
 * @property {number} updatedAt
 */

/** Build a fully-formed annotation from captured DOM info. */
export function createAnnotation(parts) {
  const now = Date.now();
  const status = parts.status || STATUS.OPEN;
  return {
    id: parts.id || uuid(),
    url: parts.url || "",
    title: parts.title || "",
    selector: parts.selector || "",
    xpath: parts.xpath || "",
    locatorQuality: parts.locatorQuality || LOCATOR_QUALITY.WEAK,
    label: parts.label || "",
    dom: {
      outerHTML: parts.dom?.outerHTML || "",
      innerText: parts.dom?.innerText || "",
    },
    bbox: normalizeBox(parts.bbox),
    fallbackPosition: {
      x: Number(parts.fallbackPosition?.x) || 0,
      y: Number(parts.fallbackPosition?.y) || 0,
    },
    uiContext: Array.isArray(parts.uiContext) ? parts.uiContext : [],
    tabPath: Array.isArray(parts.tabPath) ? parts.tabPath : [],
    layers: parts.layers || null,
    loopState: parts.loopState || "",
    agentSummary: parts.agentSummary || "",
    userNote: parts.userNote || "",
    framework: {
      type: parts.framework?.type || "unknown",
      component: parts.framework?.component || "",
      file: parts.framework?.file || "",
      vuePath: parts.framework?.vuePath || "",
      vnodePath: parts.framework?.vnodePath || "",
      domStack: parts.framework?.domStack || "",
    },
    status,
    history: parts.history?.length
      ? parts.history
      : [{ status, timestamp: now }],
    timestamp: parts.timestamp || now,
    updatedAt: parts.updatedAt || now,
  };
}

/** Backfill any missing fields on a loaded annotation (forward-compatible). */
export function normalizeAnnotation(raw) {
  return createAnnotation(raw || {});
}

function normalizeBox(b) {
  return {
    x: Number(b?.x) || 0,
    y: Number(b?.y) || 0,
    width: Number(b?.width) || 0,
    height: Number(b?.height) || 0,
  };
}

/**
 * Apply a status transition, recording history. Per requirements §7, a Reject
 * moves the annotation back to `open` after recording the rejection.
 *
 * For a Reject the `note` is the human's *rejection reason* (what the agent
 * should do differently), so it is logged to history rather than overwriting
 * the original problem description (`userNote`). The reason is also propagated
 * to the loop broker as the task's `feedback` so a re-claiming agent reads it.
 */
export function applyStatus(annotation, nextStatus, note) {
  const now = Date.now();
  const history = [...(annotation.history || [])];
  history.push({ status: nextStatus, note: note || "", timestamp: now });

  let resolvedStatus = nextStatus;
  let userNote = annotation.userNote;
  if (nextStatus === STATUS.REJECTED) {
    // Reject is recorded (with its reason in history), then the annotation
    // re-opens for another pass — the original problem text is kept intact.
    resolvedStatus = STATUS.OPEN;
    history.push({ status: STATUS.OPEN, timestamp: now + 1 });
  } else if (note !== undefined && note !== null) {
    userNote = note;
  }

  return {
    ...annotation,
    status: resolvedStatus,
    userNote,
    history,
    updatedAt: now,
  };
}

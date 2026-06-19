/** Annotation lifecycle states (see requirements §5). */
export const STATUS = {
  OPEN: "open",
  FIXED_PENDING: "fixed_pending",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
};

export const STATUS_ORDER = [
  STATUS.OPEN,
  STATUS.FIXED_PENDING,
  STATUS.CONFIRMED,
  STATUS.REJECTED,
];

export const STATUS_LABEL = {
  [STATUS.OPEN]: "未处理",
  [STATUS.FIXED_PENDING]: "已修复待确认",
  [STATUS.CONFIRMED]: "已确认",
  [STATUS.REJECTED]: "已拒绝",
};

export const STATUS_COLOR = {
  [STATUS.OPEN]: "#ef4444",
  [STATUS.FIXED_PENDING]: "#f59e0b",
  [STATUS.CONFIRMED]: "#10b981",
  [STATUS.REJECTED]: "#6b7280",
};

/** How a marker was re-located after a DOM change (see requirements §6.1). */
export const LOCATE_METHOD = {
  SELECTOR: "selector",
  XPATH: "xpath",
  FALLBACK: "fallback",
  NONE: "none",
};

/**
 * How trustworthy a selector is for pointing an AI at real source code:
 *  - strong: unique id / test-id attribute (or a Vue source file is known)
 *  - medium: unique semantic class / attribute selector (no positional parts)
 *  - weak:   only a positional nth-of-type path (unstable across states) — such
 *            selectors are kept for runtime relocation but omitted from prompts.
 */
export const LOCATOR_QUALITY = {
  STRONG: "strong",
  MEDIUM: "medium",
  WEAK: "weak",
};

/** Message types exchanged between popup / content / background. */
export const MSG = {
  PING: "PING",
  GET_PAGE: "GET_PAGE",
  LIST_PAGES: "LIST_PAGES",
  UPSERT_ANNOTATION: "UPSERT_ANNOTATION",
  DELETE_ANNOTATION: "DELETE_ANNOTATION",
  SET_STATUS: "SET_STATUS",
  UPDATE_NOTE: "UPDATE_NOTE",
  CLEAR_PAGE: "CLEAR_PAGE",
  EXPORT_PAGE: "EXPORT_PAGE",
  EXPORT_ALL: "EXPORT_ALL",
  EXPORT_PAGE_FULL: "EXPORT_PAGE_FULL",
  EXPORT_ALL_FULL: "EXPORT_ALL_FULL",
  CHANGED: "CHANGED",
  SET_MODE: "SET_MODE",
  GET_MODE: "GET_MODE",
  LOCATE: "LOCATE",
  REFRESH: "REFRESH",
  VERIFY: "VERIFY",
  GET_STATS: "GET_STATS",
  CAPTURE_TAB: "CAPTURE_TAB",
  SNAPSHOT: "SNAPSHOT",
};

export const STORAGE_KEYS = {
  PAGES_INDEX: "ui2prompt:pages",
  pageKey: (url) => `ui2prompt:page:${url}`,
};

/** A page URL is normalised before use as a storage key (drops the hash by default off? keep hash for SPA). */
export function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // Keep hash so SPA routes (e.g. #/orch/...) are treated as distinct pages.
    return `${u.origin}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return rawUrl;
  }
}

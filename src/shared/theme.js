import { resolveTheme } from "./settings.js";

/**
 * Single source of truth for design tokens. The same palette powers the popup
 * (`:root`) and the in-page overlay shadow DOM (`:host`). Dark mode uses the
 * "Developer Tool / IDE" slate palette; light mode an indigo-on-slate system.
 */
export const BASE_TOKENS = `
  --u-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", "Hiragino Sans", sans-serif;
  --u-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --u-radius-sm: 7px;
  --u-radius: 10px;
  --u-radius-lg: 14px;
  --u-dur: 160ms;
  --u-ease: cubic-bezier(.2,.6,.2,1);
`;

const LIGHT_TOKENS = `
  --u-bg: #f1f5f9;
  --u-surface: #ffffff;
  --u-surface-2: #f8fafc;
  --u-elev: #ffffff;
  --u-border: #e2e8f0;
  --u-border-strong: #cbd5e1;
  --u-text: #0f172a;
  --u-text-2: #475569;
  --u-text-3: #94a3b8;
  --u-primary: #4f46e5;
  --u-primary-hover: #4338ca;
  --u-on-primary: #ffffff;
  --u-primary-soft: rgba(79,70,229,0.12);
  --u-success: #16a34a;
  --u-warning: #d97706;
  --u-danger: #dc2626;
  --u-on-color: #ffffff;
  --u-ring: rgba(79,70,229,0.45);
  --u-scrim: rgba(15,23,42,0.5);
  --u-shadow: 0 1px 2px rgba(15,23,42,.06), 0 10px 28px rgba(15,23,42,.10);
  --u-shadow-sm: 0 1px 2px rgba(15,23,42,.08);
  --u-st-open: #ef4444;
  --u-st-fixed_pending: #f59e0b;
  --u-st-confirmed: #10b981;
  --u-st-rejected: #6b7280;
`;

const DARK_TOKENS = `
  --u-bg: #0f172a;
  --u-surface: #1e293b;
  --u-surface-2: #162132;
  --u-elev: #1e293b;
  --u-border: #334155;
  --u-border-strong: #475569;
  --u-text: #f1f5f9;
  --u-text-2: #94a3b8;
  --u-text-3: #64748b;
  --u-primary: #6366f1;
  --u-primary-hover: #818cf8;
  --u-on-primary: #ffffff;
  --u-primary-soft: rgba(99,102,241,0.22);
  --u-success: #22c55e;
  --u-warning: #fbbf24;
  --u-danger: #f87171;
  --u-on-color: #0b1020;
  --u-ring: rgba(129,140,248,0.55);
  --u-scrim: rgba(2,6,23,0.66);
  --u-shadow: 0 1px 2px rgba(0,0,0,.5), 0 12px 34px rgba(0,0,0,.55);
  --u-shadow-sm: 0 1px 2px rgba(0,0,0,.5);
  --u-st-open: #f87171;
  --u-st-fixed_pending: #fbbf24;
  --u-st-confirmed: #34d399;
  --u-st-rejected: #94a3b8;
`;

/** Build the token CSS for a given root + dark selector pair. */
export function buildThemeCss(rootSelector, darkSelector) {
  return `${rootSelector}{${BASE_TOKENS}${LIGHT_TOKENS}}
${darkSelector}{${DARK_TOKENS}}`;
}

/** Apply a theme preference to a host element via the `data-theme` attribute. */
export function applyThemeAttr(el, theme) {
  if (el) el.setAttribute("data-theme", resolveTheme(theme));
}

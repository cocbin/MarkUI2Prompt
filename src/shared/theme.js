import { resolveTheme } from "./settings.js";

/**
 * Single source of truth for design tokens. The same palette powers the popup
 * (`:root`) and the in-page overlay shadow DOM (`:host`).
 *
 * The dark theme follows a Photoshop / pro-tool panel aesthetic: layered
 * neutral greys (no blue tint) with a single bright-blue accent and hairline
 * highlights for depth. Light mode mirrors it with a clean neutral-grey system.
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
  --u-bg: #e9e9ec;
  --u-surface: #f6f6f8;
  --u-surface-2: #e7e7ec;
  --u-elev: #ffffff;
  --u-border: #d3d3da;
  --u-border-strong: #b6b6c0;
  --u-hairline: rgba(255,255,255,0.85);
  --u-shade: rgba(0,0,0,0.04);
  --u-text: #1d1d22;
  --u-text-2: #5b5b66;
  --u-text-3: #8a8a96;
  --u-primary: #2f80ed;
  --u-primary-hover: #1f6fe0;
  --u-on-primary: #ffffff;
  --u-primary-soft: rgba(47,128,237,0.14);
  --u-success: #2f9e5f;
  --u-warning: #c77d12;
  --u-danger: #d8483f;
  --u-on-color: #ffffff;
  --u-ring: rgba(47,128,237,0.45);
  --u-scrim: rgba(20,20,24,0.42);
  --u-shadow: 0 1px 2px rgba(20,20,30,.08), 0 14px 36px rgba(20,20,30,.16);
  --u-shadow-sm: 0 1px 2px rgba(20,20,30,.10);
  --u-mark: #e5322a;
  --u-st-open: #e5322a;
  --u-st-fixed_pending: #c77d12;
  --u-st-confirmed: #2f9e5f;
  --u-st-rejected: #8a8a96;
`;

const DARK_TOKENS = `
  --u-bg: #1c1c1e;
  --u-surface: #2a2a2d;
  --u-surface-2: #38383c;
  --u-elev: #303033;
  --u-border: #161618;
  --u-border-strong: #4a4a50;
  --u-hairline: rgba(255,255,255,0.055);
  --u-shade: rgba(0,0,0,0.28);
  --u-text: #d7d7da;
  --u-text-2: #9a9aa2;
  --u-text-3: #6c6c74;
  --u-primary: #3b8eff;
  --u-primary-hover: #5aa0ff;
  --u-on-primary: #ffffff;
  --u-primary-soft: rgba(59,142,255,0.18);
  --u-success: #43b581;
  --u-warning: #d9a330;
  --u-danger: #e5534b;
  --u-on-color: #ffffff;
  --u-ring: rgba(59,142,255,0.5);
  --u-scrim: rgba(0,0,0,0.62);
  --u-shadow: 0 1px 2px rgba(0,0,0,.45), 0 14px 34px rgba(0,0,0,.55);
  --u-shadow-sm: 0 1px 2px rgba(0,0,0,.45);
  --u-mark: #ff4d4d;
  --u-st-open: #e5534b;
  --u-st-fixed_pending: #d9a330;
  --u-st-confirmed: #43b581;
  --u-st-rejected: #8a8a92;
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

import { STATUS, STATUS_COLOR } from "../shared/constants.js";
import { buildThemeCss } from "../shared/theme.js";

const TOKENS = buildThemeCss(":host", ':host([data-theme="dark"])');

/** CSS injected into the overlay shadow root (isolated from page styles). */
export const OVERLAY_CSS = `
${TOKENS}
:host { all: initial; }
* { box-sizing: border-box; }

.layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147483646;
  font-family: var(--u-font);
}

/* ---- hover highlight ---- */
.highlight {
  position: fixed;
  border: 2px solid var(--u-primary);
  background: var(--u-primary-soft);
  border-radius: 6px;
  pointer-events: none;
  display: none;
  z-index: 1;
  transition: all 60ms linear;
}
.highlight.visible { display: block; }
.highlight .tag {
  position: absolute;
  left: -2px;
  top: -22px;
  max-width: 360px;
  padding: 2px 7px;
  background: var(--u-primary);
  color: var(--u-on-primary);
  font-size: 11px;
  line-height: 16px;
  border-radius: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--u-mono);
}

/* ---- markers ---- */
.marker {
  position: fixed;
  top: 0;
  left: 0;
  transform: translate3d(-9999px, -9999px, 0);
  will-change: transform;
  pointer-events: none;
  z-index: 2;
}
.marker .dot {
  position: absolute;
  left: -13px;
  top: -13px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid #fff;
  background: ${STATUS_COLOR[STATUS.OPEN]};
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transition: transform 120ms var(--u-ease);
  user-select: none;
}
.marker .dot:hover { transform: scale(1.15); }
.marker.degraded .dot { border-style: dashed; border-color: #fbbf24; }
.marker.selected .dot {
  box-shadow: 0 0 0 3px var(--u-ring), 0 2px 6px rgba(0, 0, 0, 0.35);
}

.tooltip {
  position: absolute;
  left: 16px;
  top: -12px;
  width: 230px;
  padding: 9px 11px;
  background: var(--u-elev);
  color: var(--u-text);
  border: 1px solid var(--u-border);
  font-size: 12px;
  line-height: 1.45;
  border-radius: var(--u-radius);
  box-shadow: var(--u-shadow);
  display: none;
  pointer-events: none;
  z-index: 3;
}
.marker .dot:hover ~ .tooltip { display: block; }
.tooltip .t-status { font-weight: 700; margin-bottom: 2px; }
.tooltip .t-note { white-space: pre-wrap; word-break: break-word; }
.tooltip .t-meta { margin-top: 5px; color: var(--u-text-2); font-size: 11px; font-family: var(--u-mono); word-break: break-all; }
.tooltip .t-degraded { margin-top: 5px; color: var(--u-warning); font-size: 11px; }
.tooltip .t-degraded:empty { display: none; }

/* ---- popover (editor) ---- */
.popover {
  position: fixed;
  width: 320px;
  max-width: calc(100vw - 24px);
  background: var(--u-elev);
  color: var(--u-text);
  border: 1px solid var(--u-border);
  border-radius: var(--u-radius-lg);
  box-shadow: var(--u-shadow);
  padding: 14px;
  pointer-events: auto;
  z-index: 10;
  display: none;
  animation: pop-in 140ms var(--u-ease);
}
.popover.visible { display: block; }
.popover h4 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 7px;
}
.popover .badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  margin-left: auto;
}
.popover textarea {
  width: 100%;
  min-height: 76px;
  resize: vertical;
  border: 1px solid var(--u-border-strong);
  border-radius: var(--u-radius-sm);
  padding: 9px;
  font-size: 13px;
  font-family: inherit;
  background: var(--u-surface);
  color: var(--u-text);
  outline: none;
  transition: border-color var(--u-dur), box-shadow var(--u-dur);
}
.popover textarea:focus { border-color: var(--u-primary); box-shadow: 0 0 0 3px var(--u-primary-soft); }
.popover textarea.picking { border-color: var(--u-primary); box-shadow: 0 0 0 3px var(--u-primary-soft); }
.popover .meta {
  margin: 9px 0;
  font-size: 11px;
  color: var(--u-text-2);
  line-height: 1.55;
  word-break: break-all;
}
.popover .meta b { color: var(--u-text); font-weight: 600; }
.popover .meta code { font-family: var(--u-mono); color: var(--u-text); }
.popover .note-view {
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 4px;
}
.popover .row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.popover button {
  flex: 1 1 auto;
  min-width: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: var(--u-radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: filter var(--u-dur), background var(--u-dur);
}
.popover button .icon { width: 14px; height: 14px; }
.popover button.primary { background: var(--u-primary); color: var(--u-on-primary); }
.popover button.ghost { background: var(--u-surface-2); color: var(--u-text); border-color: var(--u-border); }
.popover button.success { background: var(--u-success); color: #fff; }
.popover button.danger { background: var(--u-danger); color: #fff; }
.popover button.warn { background: var(--u-warning); color: #fff; }
.popover button:hover { filter: brightness(1.06); }
.popover button:active { filter: brightness(0.94); }
.popover button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--u-ring); }

/* ---- floating toolbar ---- */
.toolbar {
  position: fixed;
  left: 50%;
  bottom: 26px;
  transform: translateX(-50%) translateY(10px);
  display: none;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 16px;
  background: var(--u-elev);
  color: var(--u-text);
  border: 1px solid var(--u-border);
  border-radius: 999px;
  box-shadow: var(--u-shadow);
  pointer-events: auto;
  z-index: 12;
  opacity: 0;
  font-family: var(--u-font);
  transition: opacity var(--u-dur) var(--u-ease), transform var(--u-dur) var(--u-ease);
}
.toolbar.visible { display: flex; opacity: 1; transform: translateX(-50%) translateY(0); }
.toolbar .tb-status { display: flex; align-items: center; gap: 9px; }
.toolbar .tb-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--u-st-open);
  box-shadow: 0 0 0 4px var(--u-primary-soft);
  animation: tb-pulse 1.8s ease-in-out infinite;
}
.toolbar .tb-title { font-weight: 700; font-size: 13px; }
.toolbar .tb-count { color: var(--u-text-2); font-size: 12px; }
.toolbar .tb-hint { color: var(--u-text-3); font-size: 12px; }
.toolbar .tb-sep { width: 1px; height: 20px; background: var(--u-border); }
.toolbar button {
  display: inline-flex; align-items: center; gap: 6px;
  border: none; cursor: pointer;
  padding: 8px 14px; border-radius: 999px;
  font-size: 12px; font-weight: 600; font-family: inherit;
  transition: filter var(--u-dur), background var(--u-dur);
}
.toolbar button .icon { width: 15px; height: 15px; }
.toolbar .tb-shot { background: var(--u-surface-2); color: var(--u-text); border: 1px solid var(--u-border); }
.toolbar .tb-exit { background: var(--u-danger); color: #fff; }
.toolbar button:hover { filter: brightness(1.06); }
.toolbar button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--u-ring); }

/* ---- snapshot legend + arrows ---- */
.snap { position: fixed; inset: 0; display: none; pointer-events: none; z-index: 11; }
.snap.visible { display: block; }
.snap-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.snap-box {
  position: fixed;
  border: 2px solid var(--u-primary);
  border-radius: 4px;
  background: var(--u-primary-soft);
  box-shadow: 0 0 0 2px rgba(255,255,255,0.5);
}
.snap-chip {
  position: fixed;
  max-width: 280px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 7px 10px;
  background: var(--u-elev);
  color: var(--u-text);
  border: 1px solid var(--u-border);
  border-left: 3px solid var(--u-primary);
  border-radius: var(--u-radius-sm);
  box-shadow: var(--u-shadow);
  font-size: 12px;
  line-height: 1.4;
}
.snap-chip .n {
  flex: 0 0 auto;
  width: 18px; height: 18px; border-radius: 50%;
  background: var(--u-primary); color: var(--u-on-primary);
  font-size: 11px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.snap-chip .tx { word-break: break-word; }

@keyframes tb-pulse {
  0%, 100% { box-shadow: 0 0 0 3px var(--u-primary-soft); }
  50% { box-shadow: 0 0 0 6px transparent; }
}
@keyframes pop-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .popover, .toolbar, .marker .dot { animation: none !important; transition: none !important; }
  .toolbar .tb-dot { animation: none !important; }
}
`;

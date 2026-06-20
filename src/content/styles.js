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
.tooltip .t-loop { margin-top: 4px; font-size: 11px; font-weight: 700; }
.tooltip .t-loop:empty { display: none; }

/* Loop-mode agent progress rings (requirement: see agents working live). */
.marker.loop-in_progress .dot { box-shadow: 0 0 0 3px rgba(59, 142, 255, 0.6), 0 2px 6px rgba(0, 0, 0, 0.35); animation: lp-pulse 1.4s ease-in-out infinite; }
.marker.loop-ai_fixed .dot { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.65), 0 2px 6px rgba(0, 0, 0, 0.35); }
.marker.loop-ai_reviewed .dot { box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.65), 0 2px 6px rgba(0, 0, 0, 0.35); }
.marker.loop-in_progress .t-loop { color: #3b8eff; }
.marker.loop-ai_fixed .t-loop { color: var(--u-warning); }
.marker.loop-ai_reviewed .t-loop { color: #8b5cf6; }
/* Hidden when the recorded tab is not the active one (tab-aware display fix). */
.marker.off-tab { display: none !important; }
@keyframes lp-pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(59, 142, 255, 0.6), 0 2px 6px rgba(0, 0, 0, 0.35); }
  50% { box-shadow: 0 0 0 6px rgba(59, 142, 255, 0.18), 0 2px 6px rgba(0, 0, 0, 0.35); }
}

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
.popover .meta.hint-center { text-align: center; margin-top: 8px; margin-bottom: 0; color: var(--u-text-3); }
.popover .note-view {
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 4px;
}
.popover .row { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
.popover .kbd-hint {
  margin-top: 10px;
  font-size: 11px;
  color: var(--u-text-3);
  text-align: center;
  line-height: 1.5;
  word-break: keep-all;
}
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
  gap: 10px;
  /* size to content (not the 50%-of-viewport auto cap) so CJK labels never
     collapse into a vertical column when the bar grows wider. */
  width: max-content;
  max-width: calc(100vw - 24px);
  padding: 7px 8px 7px 6px;
  background: var(--u-elev);
  color: var(--u-text);
  border: 1px solid var(--u-border-strong);
  border-radius: 12px;
  box-shadow: var(--u-shadow), inset 0 1px 0 var(--u-hairline);
  pointer-events: auto;
  z-index: 12;
  opacity: 0;
  font-family: var(--u-font);
  transition: opacity var(--u-dur) var(--u-ease), transform var(--u-dur) var(--u-ease);
}
.toolbar.visible { display: flex; opacity: 1; transform: translateX(-50%) translateY(0); }
.toolbar.dragging { transition: none; cursor: grabbing; }
.toolbar .tb-grip {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 30px;
  border: none; background: transparent;
  color: var(--u-text-3);
  border-radius: 8px;
  cursor: grab;
  touch-action: none;
}
.toolbar .tb-grip:hover { color: var(--u-text); background: var(--u-surface-2); }
.toolbar.dragging .tb-grip { cursor: grabbing; }
.toolbar .tb-status { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; }
.toolbar .tb-dot {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--u-st-open);
  box-shadow: 0 0 0 4px var(--u-primary-soft);
  animation: tb-pulse 1.8s ease-in-out infinite;
}
.toolbar .tb-title { font-weight: 700; font-size: 13px; white-space: nowrap; }
.toolbar .tb-count { color: var(--u-text-2); font-size: 12px; white-space: nowrap; }
.toolbar .tb-hint { color: var(--u-text-3); font-size: 12px; white-space: nowrap; }
.toolbar .tb-sep { width: 1px; height: 20px; background: var(--u-border-strong); }
.toolbar button {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid transparent; cursor: pointer;
  padding: 7px 12px; border-radius: 9px;
  font-size: 12px; font-weight: 600; font-family: inherit;
  white-space: nowrap;
  transition: filter var(--u-dur), background var(--u-dur);
}
.toolbar button .icon { width: 15px; height: 15px; }
.toolbar .tb-shot { padding: 7px; background: var(--u-surface-2); color: var(--u-text); border-color: var(--u-border); }
.toolbar .tb-exitshot { background: linear-gradient(180deg, var(--u-primary-hover), var(--u-primary)); color: var(--u-on-primary); box-shadow: inset 0 1px 0 rgba(255,255,255,.18); }
.toolbar .tb-exit { background: var(--u-surface-2); color: var(--u-text); border-color: var(--u-border); }
.toolbar button:hover { filter: brightness(1.08); }
.toolbar button:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--u-ring); }

/* select / normal sub-mode switch */
.toolbar .tb-modes {
  display: inline-flex; gap: 4px;
  flex: 0 0 auto;
  padding: 3px; border-radius: 10px;
  background: var(--u-surface); border: 1px solid var(--u-border);
}
.toolbar .tb-mode {
  padding: 5px 9px; border-radius: 7px;
  background: transparent; border: 1px solid transparent;
  color: var(--u-text-2);
}
.toolbar .tb-mode .tb-mode-label { font-size: 12px; white-space: nowrap; }
.toolbar .tb-mode kbd {
  font-family: var(--u-mono); font-size: 10px; font-weight: 700;
  line-height: 1; padding: 2px 4px; border-radius: 4px;
  background: var(--u-surface-2); color: var(--u-text-3);
  border: 1px solid var(--u-border);
}
.toolbar .tb-mode:hover { color: var(--u-text); background: var(--u-surface-2); }
.toolbar .tb-mode.active {
  background: var(--u-primary); color: var(--u-on-primary);
  border-color: var(--u-primary);
}
.toolbar .tb-mode.active kbd { background: rgba(255,255,255,.22); color: var(--u-on-primary); border-color: transparent; }

/* ---- snapshot legend + arrows (unified red, transparent labels) ---- */
.snap { position: fixed; inset: 0; display: none; pointer-events: none; z-index: 11; }
.snap.visible { display: block; }
.snap-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.snap-svg line { stroke: var(--u-mark); }
.snap-svg circle { fill: var(--u-mark); }
.snap-svg marker path { fill: var(--u-mark); }
.snap-box {
  position: fixed;
  border: 2px solid var(--u-mark);
  border-radius: 4px;
  background: rgba(229, 50, 42, 0.06);
  /* Soft, blurred separation instead of a hard 1px white ring, which sampled
   * into a jagged stair-stepped outline in the captured PNG (requirements §六). */
  box-shadow: 0 0 5px rgba(255, 255, 255, 0.55), 0 1px 6px rgba(0, 0, 0, 0.18);
}
.snap-chip {
  position: fixed;
  max-width: 250px;
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: 3px 8px 3px 4px;
  /* A readable translucent-white plate keeps the red text crisp without a hard
   * faux outline, while still letting the underlying UI show through. */
  background: rgba(255, 255, 255, 0.78);
  border: 1.5px solid var(--u-mark);
  border-radius: 9px;
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  color: var(--u-mark);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.35;
}
.snap-chip .n {
  flex: 0 0 auto;
  width: 19px; height: 19px; border-radius: 50%;
  background: var(--u-mark); color: #fff;
  font-size: 11px; font-weight: 800;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
.snap-chip .tx {
  word-break: break-word;
  padding-top: 1px;
  /* Single soft halo (blurred, so it anti-aliases cleanly) rather than four
   * hard 1px offsets that produced the jagged white edges. */
  text-shadow: 0 0 3px rgba(255, 255, 255, 0.95);
}

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

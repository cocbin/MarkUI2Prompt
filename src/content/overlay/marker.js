import { STATUS_COLOR, LOCATE_METHOD, LOCATOR_QUALITY } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { relocate } from "../locator.js";
import { isOnRecordedTab } from "../tab-path.js";

/** Best one-line "where" hint for the marker tooltip. */
function metaText(a) {
  const fw = a.framework || {};
  if (fw.type === "vue" && (fw.component || fw.file)) {
    return [fw.component, fw.file].filter(Boolean).join(" · ");
  }
  if (a.selector && a.locatorQuality && a.locatorQuality !== LOCATOR_QUALITY.WEAK) {
    return a.selector;
  }
  return a.label || "";
}

/** A single on-page annotation marker (dot + tooltip) within the overlay. */
export class Marker {
  constructor(annotation, index) {
    this.annotation = annotation;
    this.index = index;
    this.el = null; // resolved page element
    this.method = LOCATE_METHOD.NONE;
    this.degraded = false;
    this.selected = false;
    this.loopState = annotation.loopState || "";
    this.onRecordedTab = true;
    this.hidden = false;
    this.lastX = -99999;
    this.lastY = -99999;
    this._build();
    this.resolve();
    this.update(annotation, index);
  }

  _build() {
    const wrapper = document.createElement("div");
    wrapper.className = "marker";

    const dot = document.createElement("div");
    dot.className = "dot";
    dot.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onSelect && this.onSelect(this.annotation, this.dotRect());
    });

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.innerHTML =
      '<div class="t-status"></div><div class="t-loop"></div><div class="t-note"></div><div class="t-meta"></div><div class="t-degraded"></div>';

    wrapper.appendChild(dot);
    wrapper.appendChild(tooltip);
    this.node = wrapper;
    this.dot = dot;
    this.tooltip = tooltip;
    this._applyLoopState();
  }

  /** Loop-mode agent progress ring + tooltip line (in_progress/ai_fixed/ai_reviewed). */
  setLoopState(state) {
    if (state === this.loopState) return;
    this.loopState = state || "";
    this._applyLoopState();
  }

  _applyLoopState() {
    const cls = ["in_progress", "ai_fixed", "ai_reviewed"];
    for (const c of cls) this.node.classList.toggle(`loop-${c}`, this.loopState === c);
    this.node.classList.toggle("loop-active", cls.includes(this.loopState));
    const line = this.tooltip && this.tooltip.querySelector(".t-loop");
    if (line) line.textContent = cls.includes(this.loopState) ? t(`loop.state.${this.loopState}`) : "";
  }

  /** Re-bind to a page element using selector -> xpath -> fallback. */
  resolve() {
    const { element, method } = relocate(this.annotation);
    this.el = element;
    this.method = method;
    this.degraded = !element;
    this.node.classList.toggle("degraded", this.degraded);
    this.recheckTab();
    if (this.dot) this.update(this.annotation, this.index); // refresh degraded tooltip
    return method;
  }

  /** Tab-aware: are we currently viewing the tab this was annotated under? */
  recheckTab() {
    this.onRecordedTab = isOnRecordedTab(this.annotation);
  }

  /** Laid-out check: display:none / detached → no rects (so hide the marker). */
  _isLaidOut(el) {
    return el.getClientRects().length > 0;
  }

  update(annotation, index) {
    this.annotation = annotation;
    if (typeof index === "number") this.index = index;
    this.dot.textContent = String(this.index);
    this.dot.style.background = STATUS_COLOR[annotation.status] || STATUS_COLOR.open;

    this.tooltip.querySelector(".t-status").textContent = t(`status.${annotation.status}`);
    this.tooltip.querySelector(".t-note").textContent =
      annotation.userNote || t("item.noNote");
    this.tooltip.querySelector(".t-meta").textContent = metaText(annotation);
    this.tooltip.querySelector(".t-degraded").textContent = this.degraded
      ? t("tooltip.degraded")
      : "";
  }

  setSelected(value) {
    this.selected = value;
    this.node.classList.toggle("selected", value);
  }

  dotRect() {
    return this.dot.getBoundingClientRect();
  }

  /** Compute the marker's viewport position from its current binding. */
  computePosition() {
    if (this.el && this.el.isConnected) {
      const rect = this.el.getBoundingClientRect();
      if (this.degraded) {
        this.degraded = false;
        this.node.classList.remove("degraded");
        this.update(this.annotation, this.index);
      }
      return { x: rect.right, y: rect.top };
    }
    if (!this.degraded) {
      this.degraded = true;
      this.node.classList.add("degraded");
      this.update(this.annotation, this.index);
    }
    const fb = this.annotation.fallbackPosition || { x: 0, y: 0 };
    return { x: fb.x - window.scrollX, y: fb.y - window.scrollY };
  }

  applyPosition() {
    // Hide when the recorded tab is not active, or when the bound element is in
    // a hidden (display:none) tab pane — never leave a marker at a stale spot.
    const connected = this.el && this.el.isConnected;
    const hide = !this.onRecordedTab || (connected && !this._isLaidOut(this.el));
    if (hide !== this.hidden) {
      this.hidden = hide;
      this.node.classList.toggle("off-tab", hide);
      this.lastX = -99999; // force a reposition when it reappears
    }
    if (hide) return;
    const { x, y } = this.computePosition();
    if (x === this.lastX && y === this.lastY) return;
    this.lastX = x;
    this.lastY = y;
    this.node.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  destroy() {
    this.node.remove();
  }
}

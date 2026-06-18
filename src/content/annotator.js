import { createAnnotation } from "../shared/annotation.js";
import { t } from "../shared/i18n.js";
import { captureElement, shortLabel, describeElementRef } from "./capture.js";
import { probeFramework } from "./framework-bridge.js";
import { HOST_ID } from "./overlay/overlay.js";

/**
 * Annotation mode: hover to highlight a DOM element, click to create a marker
 * and capture its problem description. While active it also suppresses the host
 * page's own keyboard shortcuts (requirements item 3) and supports an inline
 * "reference element" picker (requirements item 13).
 */
export class Annotator {
  constructor(overlay, { onCreate, getUrl, onExit }) {
    this.overlay = overlay;
    this.onCreate = onCreate;
    this.getUrl = getUrl;
    this.onExit = onExit;
    this.active = false;
    this.creating = false;
    this.picking = false;
    this.hoverEl = null;
    this.onMove = this.onMove.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onKeyCapture = this.onKeyCapture.bind(this);
    overlay.onPopoverClose = () => {
      this.creating = false;
    };
  }

  isActive() {
    return this.active;
  }

  enable() {
    if (this.active) return;
    this.active = true;
    document.addEventListener("mousemove", this.onMove, true);
    document.addEventListener("click", this.onClick, true);
    // Capture-phase key blockers stop the page's own shortcut handlers.
    document.addEventListener("keydown", this.onKeyCapture, true);
    document.addEventListener("keyup", this.onKeyCapture, true);
    document.addEventListener("keypress", this.onKeyCapture, true);
    if (document.body) {
      this._prevCursor = document.body.style.cursor;
      document.body.style.cursor = "crosshair";
    }
    this.overlay.showToolbar();
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    this.creating = false;
    this.picking = false;
    document.removeEventListener("mousemove", this.onMove, true);
    document.removeEventListener("click", this.onClick, true);
    document.removeEventListener("keydown", this.onKeyCapture, true);
    document.removeEventListener("keyup", this.onKeyCapture, true);
    document.removeEventListener("keypress", this.onKeyCapture, true);
    this.overlay.clearHighlight();
    this.overlay.closePopover();
    this.overlay.hideToolbar();
    if (document.body) document.body.style.cursor = this._prevCursor || "";
  }

  _isInOverlay(e) {
    const path = e.composedPath ? e.composedPath() : [];
    return path.some((n) => n && n.id === HOST_ID);
  }

  onKeyCapture(e) {
    // Cmd/Ctrl+M (handled by a separate always-on listener) must pass through.
    if ((e.metaKey || e.ctrlKey) && (e.key === "m" || e.key === "M")) return;

    if (e.type === "keydown" && e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (this.picking) return; // pick mode handles its own Escape
      if (this.overlay.isPopoverOpen()) this.overlay.closePopover();
      else if (this.onExit) this.onExit();
      return;
    }
    // Let typing inside our own overlay (textarea) work normally.
    if (this._isInOverlay(e)) return;
    // Otherwise swallow the key so page shortcuts don't fire.
    e.stopImmediatePropagation();
  }

  _target(e) {
    const t2 = e.target;
    if (!t2 || t2.nodeType !== 1) return null;
    if (t2.id === HOST_ID) return null;
    if (t2 === document.documentElement) return null;
    return t2;
  }

  onMove(e) {
    if (!this.active || this.creating || this.picking) return;
    const el = this._target(e);
    if (!el) {
      this.overlay.clearHighlight();
      return;
    }
    this.hoverEl = el;
    this.overlay.setHighlight(el.getBoundingClientRect(), shortLabel(el));
  }

  onClick(e) {
    if (!this.active || this.creating || this.picking) return;
    const el = this._target(e);
    if (!el) return; // clicks on existing markers fall through to detail view
    e.preventDefault();
    e.stopPropagation();
    this._beginCreate(el, { x: e.clientX, y: e.clientY });
  }

  _beginCreate(el, point) {
    this.creating = true;
    this.overlay.clearHighlight();
    const parts = captureElement(el);
    const anchorRect = {
      left: point.x,
      top: point.y,
      right: point.x,
      bottom: point.y,
      width: 0,
      height: 0,
    };
    this.overlay.openCreate(anchorRect, {
      onSave: async (note) => {
        const framework = await probeFramework(el);
        const annotation = createAnnotation({
          ...parts,
          url: this.getUrl(),
          userNote: note,
          framework,
        });
        this.creating = false;
        this.overlay.closePopover();
        await this.onCreate(annotation);
      },
      onCancel: () => {
        this.creating = false;
        this.overlay.closePopover();
      },
      onPick: (insert, onDone) => this._pickReference(insert, onDone),
    });
  }

  /** Sub-mode: click another element to insert its semantic reference. */
  _pickReference(insert, onDone) {
    if (this.picking) return;
    this.picking = true;
    this.overlay.setPicking(true);
    this.overlay.toolbarBusy(t("create.pickHint"));

    const finish = () => {
      this.picking = false;
      this.overlay.setPicking(false);
      this.overlay.clearHighlight();
      this.overlay.toolbarBusy(null);
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      onDone && onDone();
    };

    const move = (e) => {
      const el = this._target(e);
      if (el) this.overlay.setHighlight(el.getBoundingClientRect(), shortLabel(el));
      else this.overlay.clearHighlight();
    };
    const click = async (e) => {
      if (this._isInOverlay(e)) return; // let popover buttons work
      const el = this._target(e);
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      finish();
      const framework = await probeFramework(el);
      insert(describeElementRef(el, framework));
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        finish();
      }
    };

    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
  }
}

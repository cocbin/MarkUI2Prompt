import { createAnnotation } from "../shared/annotation.js";
import { t } from "../shared/i18n.js";
import {
  captureElement,
  shortLabel,
  describeElementRef,
  describeElementLocation,
} from "./capture.js";
import { probeFramework } from "./framework-bridge.js";
import { HOST_ID } from "./overlay/overlay.js";

export const ANNOTATE_MODE = { SELECT: "select", NORMAL: "normal" };

/** The deepest (pre-retarget) node of an event, even across the shadow boundary. */
function deepTarget(e) {
  const path = e.composedPath ? e.composedPath() : null;
  return (path && path[0]) || e.target || null;
}

/** True when a node is a text-input surface (so letter keys must type, not act). */
function isEditable(node) {
  if (!node || node.nodeType !== 1) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!node.isContentEditable;
}

/**
 * Annotation mode: hover to highlight a DOM element, click to create a marker
 * and capture its problem description.
 *
 * Two sub-modes (requirements item 6):
 *   - SELECT: pick elements to annotate (default).
 *   - NORMAL: hands-off, the host page works normally so the user can navigate,
 *     open dialogs, switch tabs, etc. before switching back to annotate.
 * `M` switches to SELECT, `N` to NORMAL.
 *
 * A single capture-phase key guard at `window` (the earliest node in the capture
 * order) keeps the host page's own shortcuts from firing in SELECT mode and,
 * crucially, stops keystrokes typed into our own popover from penetrating to the
 * page — so Delete/Backspace edit our textarea instead of deleting page content,
 * and Esc closes our popover instead of a host dialog (requirements item 1).
 */
export class Annotator {
  constructor(overlay, { onCreate, getUrl, onExit, getLocale, onCopyLocation }) {
    this.overlay = overlay;
    this.onCreate = onCreate;
    this.getUrl = getUrl;
    this.onExit = onExit;
    this.getLocale = getLocale || (() => undefined);
    this.onCopyLocation = onCopyLocation;
    this.active = false;
    this.creating = false;
    this.picking = false;
    this.mode = ANNOTATE_MODE.SELECT;
    this.lockHostKeys = true;
    this.hoverEl = null;
    this._cancelPick = null;
    this._prevCursor = undefined;
    this.onMove = this.onMove.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onKey = this.onKey.bind(this);
    overlay.onPopoverClose = () => {
      this.creating = false;
    };
    overlay.setModeHandlers({
      onSelectMode: () => this.setMode(ANNOTATE_MODE.SELECT),
      onNormalMode: () => this.setMode(ANNOTATE_MODE.NORMAL),
      onGetLocation: () => this.pickLocationToClipboard(),
    });
  }

  isActive() {
    return this.active;
  }

  setLockHostKeys(value) {
    this.lockHostKeys = value !== false;
  }

  enable() {
    if (this.active) return;
    this.active = true;
    this.mode = ANNOTATE_MODE.SELECT;
    document.addEventListener("mousemove", this.onMove, true);
    document.addEventListener("click", this.onClick, true);
    // Capture-phase, at window so it precedes the page's own handlers.
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("keyup", this.onKey, true);
    window.addEventListener("keypress", this.onKey, true);
    if (document.body) this._prevCursor = document.body.style.cursor;
    this._applyCursor();
    this.overlay.setAnnotationActive(true);
    this.overlay.showToolbar();
    this.overlay.setToolbarMode(this.mode);
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    this.creating = false;
    this.picking = false;
    this._cancelPick = null;
    document.removeEventListener("mousemove", this.onMove, true);
    document.removeEventListener("click", this.onClick, true);
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("keyup", this.onKey, true);
    window.removeEventListener("keypress", this.onKey, true);
    this.overlay.clearHighlight();
    this.overlay.closePopover();
    this.overlay.hideToolbar();
    this.overlay.setAnnotationActive(false);
    if (document.body) document.body.style.cursor = this._prevCursor || "";
    this._prevCursor = undefined;
  }

  /** Switch between element-select and normal-click sub-modes. */
  setMode(mode) {
    if (mode !== ANNOTATE_MODE.SELECT && mode !== ANNOTATE_MODE.NORMAL) return;
    if (!this.active || this.mode === mode) return;
    this.mode = mode;
    if (mode === ANNOTATE_MODE.NORMAL) {
      // Hands off: drop the hover highlight and any half-finished annotation so
      // the user can freely operate the host page.
      this.creating = false;
      this.overlay.clearHighlight();
      this.overlay.closePopover();
    }
    this._applyCursor();
    this.overlay.setToolbarMode(mode);
  }

  _applyCursor() {
    if (!document.body) return;
    document.body.style.cursor =
      this.active && this.mode === ANNOTATE_MODE.SELECT ? "crosshair" : this._prevCursor || "";
  }

  _isInOverlay(e) {
    const path = e.composedPath ? e.composedPath() : [];
    return path.some((n) => n && n.id === HOST_ID);
  }

  _consume(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  /**
   * Single keyboard guard for annotation mode. Order matters: reference-picking
   * and our popover are served first, then host-page suppression.
   */
  onKey(e) {
    if (!this.active) return;
    const type = e.type;

    // 1) Reference-picking sub-mode: block the page entirely; Esc cancels.
    if (this.picking) {
      if (type === "keydown" && e.key === "Escape") {
        this._consume(e);
        this._cancelPick && this._cancelPick();
        return;
      }
      e.stopImmediatePropagation();
      if (type === "keydown") e.preventDefault();
      return;
    }

    const deep = deepTarget(e);
    const editableFocused = isEditable(deep);
    const inOverlay = this._isInOverlay(e);

    // 2) Mode switch hotkeys M / N — only when not typing and unmodified.
    if (
      type === "keydown" &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !editableFocused
    ) {
      if (e.key === "m" || e.key === "M") {
        this._consume(e);
        this.setMode(ANNOTATE_MODE.SELECT);
        return;
      }
      if (e.key === "n" || e.key === "N") {
        this._consume(e);
        this.setMode(ANNOTATE_MODE.NORMAL);
        return;
      }
    }

    // 3) Popover keyboard control (Enter/Esc/Del/S) — delegated to the editor.
    if (this.overlay.isPopoverOpen() && this.overlay.editor.handleKey(e)) {
      this._consume(e);
      return;
    }

    // 4) Normal-click mode: let the host page receive keys so the user can drive it.
    if (this.mode === ANNOTATE_MODE.NORMAL) return;

    // ---- element-select mode below ----

    // 5) Escape with no popover open → leave annotation mode, and stop it from
    //    reaching the page (so a host dialog the user is annotating stays open).
    if (type === "keydown" && e.key === "Escape") {
      this._consume(e);
      if (this.onExit) this.onExit();
      return;
    }

    // 6) Keystrokes inside our own overlay (the description textarea): let the
    //    default action edit the field, but stop the event reaching the page.
    //    stopImmediatePropagation does NOT cancel the textarea's default input.
    if (inOverlay) {
      e.stopImmediatePropagation();
      return;
    }

    // 7) Otherwise suppress the host page's shortcuts while locking is enabled.
    if (this.lockHostKeys) this._consume(e);
  }

  _target(e) {
    const t2 = e.target;
    if (!t2 || t2.nodeType !== 1) return null;
    if (t2.id === HOST_ID) return null;
    if (t2 === document.documentElement) return null;
    return t2;
  }

  onMove(e) {
    if (!this.active || this.mode !== ANNOTATE_MODE.SELECT || this.creating || this.picking) return;
    const el = this._target(e);
    if (!el) {
      this.overlay.clearHighlight();
      return;
    }
    this.hoverEl = el;
    this.overlay.setHighlight(el.getBoundingClientRect(), shortLabel(el));
  }

  onClick(e) {
    if (!this.active || this.mode !== ANNOTATE_MODE.SELECT || this.creating || this.picking) return;
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
      onPickLocation: (insert, onDone) => this._pickLocation(insert, onDone),
    });
  }

  /** Sub-mode: click another element to insert its semantic reference. */
  _pickReference(insert, onDone) {
    this._pick(
      (el, framework) => describeElementRef(el, framework),
      insert,
      onDone,
      t("create.pickHint"),
    );
  }

  /**
   * Sub-mode: click an element to insert its prompt-style *location* (UI path /
   * component / selector) — the same string the export prompt shows, so users
   * can grab a component path and hand-write the requirement (requirements
   * item 6).
   */
  _pickLocation(insert, onDone) {
    this._pick(
      (el, framework) => describeElementLocation(el, framework, this.getLocale()),
      insert,
      onDone,
      t("create.locHint"),
    );
  }

  /**
   * Toolbar action: pick an element and copy its location string straight to
   * the clipboard (no create form open). Used by the bottom bar's "get element
   * location" button (requirements item 6).
   */
  pickLocationToClipboard() {
    if (this.picking || this.creating) return;
    this._pick(
      (el, framework) => describeElementLocation(el, framework, this.getLocale()),
      (text) => this.onCopyLocation && this.onCopyLocation(text),
      null,
      t("create.locHint"),
    );
  }

  /**
   * Shared element-picking flow: enter pick mode, highlight on hover, and on the
   * next click resolve the framework + hand `describe(el, framework)` to `emit`.
   * `describe` may be async-free; framework probing is awaited here.
   */
  _pick(describe, emit, onDone, hint) {
    if (this.picking) return;
    this.picking = true;
    this.overlay.setPicking(true);
    this.overlay.toolbarBusy(hint || t("create.pickHint"));

    const finish = () => {
      this.picking = false;
      this._cancelPick = null;
      this.overlay.setPicking(false);
      this.overlay.clearHighlight();
      this.overlay.toolbarBusy(null);
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("click", click, true);
      onDone && onDone();
    };
    this._cancelPick = finish;

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
      emit(describe(el, framework));
    };

    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    // Escape during picking is handled by the global key guard (onKey).
  }
}

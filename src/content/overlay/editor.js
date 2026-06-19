import { STATUS, STATUS_COLOR, LOCATOR_QUALITY } from "../../shared/constants.js";
import { t } from "../../shared/i18n.js";
import { icon } from "../../shared/icons.js";

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/** Best "where" line for the detail view. */
function locationHtml(a) {
  const fw = a.framework || {};
  const parts = [];
  if (fw.type === "vue" && (fw.component || fw.file)) {
    const comp = fw.component ? escapeHtml(fw.component) : "Vue";
    parts.push(fw.file ? `${comp} <code>${escapeHtml(fw.file)}</code>` : comp);
  }
  if (a.selector && a.locatorQuality && a.locatorQuality !== LOCATOR_QUALITY.WEAK) {
    parts.push(`<code>${escapeHtml(a.selector)}</code>`);
  }
  if (a.label) parts.push(`“${escapeHtml(a.label)}”`);
  return parts.length ? parts.join(" · ") : t("detail.none");
}

/** A single reusable popover for creating, viewing and editing annotations. */
export class EditorPopover {
  constructor(layer) {
    this.node = document.createElement("div");
    this.node.className = "popover";
    layer.appendChild(this.node);
    this.handlers = {};
    this.current = null;
    this.anchorRect = null;
    this.mode = ""; // create | detail | edit | reject | confirmDelete
    this._create = null; // { onSave, onCancel, onPick, textarea }
    this.onRequestClose = null; // set by the overlay to fully close + deselect
  }

  isOpen() {
    return this.node.classList.contains("visible");
  }

  contains(target) {
    return this.node.contains(target);
  }

  close() {
    this.node.classList.remove("visible");
    this.node.innerHTML = "";
    this.current = null;
    this.mode = "";
    this._create = null;
  }

  /**
   * Keyboard control for the open popover (requirements items 1 & 8). Returns
   * true when the key was handled so the caller can block it from the page.
   *   create: Enter=save · Shift+Enter=newline · Esc=cancel · S=reference
   *   edit:   Enter=save · Esc=back
   *   detail: Del/Backspace=delete · Esc=close
   *   confirmDelete: Enter=confirm · Esc=back
   */
  handleKey(e) {
    if (e.type !== "keydown" || !this.isOpen()) return false;
    const mode = this.mode;
    const key = e.key;
    const deep = (e.composedPath && e.composedPath()[0]) || e.target;
    const inTextarea = deep && deep.tagName === "TEXTAREA";

    if (key === "Escape") {
      if (mode === "create") this._create && this._create.onCancel && this._create.onCancel();
      else if (mode === "edit" || mode === "reject" || mode === "confirmDelete")
        this._renderDetail(this.current, this.anchorRect);
      else if (this.onRequestClose) this.onRequestClose();
      return true;
    }
    if (key === "Enter" && !e.shiftKey && !e.isComposing) {
      if (mode === "create") return this.saveCreate(), true;
      if (mode === "edit") return this.saveEdit(), true;
      if (mode === "confirmDelete") return this.confirmDelete(), true;
    }
    if ((key === "Delete" || key === "Backspace") && mode === "detail") {
      this.askDelete();
      return true;
    }
    if ((key === "s" || key === "S") && mode === "create" && (e.altKey || !inTextarea)) {
      this.triggerPick();
      return true;
    }
    return false;
  }

  _show(anchorRect) {
    this.node.classList.add("visible");
    this._position(anchorRect);
  }

  _position(rect) {
    const margin = 12;
    const pop = this.node.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + pop.width > window.innerWidth - margin) {
      left = window.innerWidth - pop.width - margin;
    }
    if (left < margin) left = margin;
    if (top + pop.height > window.innerHeight - margin) {
      top = rect.top - pop.height - 8;
    }
    if (top < margin) top = margin;
    this.node.style.left = `${left}px`;
    this.node.style.top = `${top}px`;
  }

  _insertAtCaret(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const prefix = before && !/\s$/.test(before) ? " " : "";
    const chunk = `${prefix}${text} `;
    textarea.value = before + chunk + after;
    const pos = (before + chunk).length;
    textarea.setSelectionRange(pos, pos);
    textarea.focus();
  }

  /** Creation form for a brand new annotation. */
  openCreate(anchorRect, { onSave, onCancel, onPick }) {
    this.mode = "create";
    this.node.innerHTML = `
      <h4>${icon("plus", { size: 15 })} <span>${t("create.title")}</span></h4>
      <textarea placeholder="${t("create.placeholder")}"></textarea>
      <div class="row">
        <button class="ghost" data-act="pick">${icon("pointer", { size: 14 })}<span>${t("create.pick")}</span></button>
      </div>
      <div class="row">
        <button class="primary" data-act="save">${icon("check", { size: 14 })}<span>${t("create.save")}</span></button>
        <button class="ghost" data-act="cancel">${icon("x", { size: 14 })}<span>${t("create.cancel")}</span></button>
      </div>
      <div class="kbd-hint">${t("create.hint")}</div>`;
    const textarea = this.node.querySelector("textarea");
    this._create = { onSave, onCancel, onPick, textarea };
    this.node.querySelector('[data-act="save"]').onclick = () => this.saveCreate();
    this.node.querySelector('[data-act="cancel"]').onclick = () => onCancel && onCancel();
    this.node.querySelector('[data-act="pick"]').onclick = () => this.triggerPick();
    this._show(anchorRect);
    setTimeout(() => textarea.focus(), 0);
  }

  /** Save the create form (Save button or Enter). User text is never trimmed-away. */
  saveCreate() {
    if (this.mode !== "create" || !this._create) return;
    this._create.onSave((this._create.textarea.value || "").trim());
  }

  /** Enter reference-pick mode for the create form (Reference button or S). */
  triggerPick() {
    if (this.mode !== "create" || !this._create || !this._create.onPick) return;
    const { textarea, onPick } = this._create;
    textarea.classList.add("picking");
    onPick(
      (text) => {
        this._insertAtCaret(textarea, text);
        textarea.classList.remove("picking");
      },
      () => textarea.classList.remove("picking"),
    );
  }

  /** Save the edit form (Save button or Enter). */
  saveEdit() {
    if (this.mode !== "edit" || !this._edit) return;
    this.handlers.onUpdateNote &&
      this.handlers.onUpdateNote(this._edit.annotation, (this._edit.textarea.value || "").trim());
  }

  /** Detail / action view for an existing annotation. */
  openDetail(annotation, anchorRect, handlers) {
    this.current = annotation;
    this.anchorRect = anchorRect;
    this.handlers = handlers || {};
    this._renderDetail(annotation, anchorRect);
  }

  _renderDetail(annotation, anchorRect) {
    this.mode = "detail";
    this.anchorRect = anchorRect;
    this.node.innerHTML = `
      <h4>${icon("info", { size: 15 })} <span>${t("detail.title")}</span>
        <span class="badge" style="background:${STATUS_COLOR[annotation.status]}">${t(`status.${annotation.status}`)}</span>
      </h4>
      <div class="note-view">${escapeHtml(annotation.userNote) || t("item.noNote")}</div>
      <div class="meta"><b>${t("detail.location")}:</b> ${locationHtml(annotation)}</div>
      <div class="row">${this._statusButtons(annotation)}</div>
      <div class="row">
        <button class="ghost" data-act="edit">${icon("pencil", { size: 14 })}<span>${t("detail.edit")}</span></button>
        <button class="ghost" data-act="locate">${icon("crosshair", { size: 14 })}<span>${t("detail.locate")}</span></button>
        <button class="danger" data-act="delete">${icon("trash", { size: 14 })}<span>${t("detail.delete")}</span></button>
      </div>`;
    this._wireDetail(annotation, anchorRect);
    this._show(anchorRect);
  }

  _statusButtons(annotation) {
    if (annotation.status === STATUS.FIXED_PENDING) {
      return (
        `<button class="success" data-act="status" data-status="confirmed">${icon("check", { size: 14 })}<span>${t("detail.confirm")}</span></button>` +
        `<button class="danger" data-act="reject">${icon("x", { size: 14 })}<span>${t("detail.reject")}</span></button>`
      );
    }
    if (annotation.status === STATUS.CONFIRMED) {
      return `<button class="ghost" data-act="status" data-status="open">${icon("reopen", { size: 14 })}<span>${t("detail.reopen")}</span></button>`;
    }
    return `<button class="warn" data-act="status" data-status="fixed_pending">${icon("check", { size: 14 })}<span>${t("detail.markFixed")}</span></button>`;
  }

  _wireDetail(annotation, anchorRect) {
    const h = this.handlers;
    this.node.querySelector('[data-act="edit"]').onclick = () =>
      this._renderEdit(annotation, anchorRect);
    this.node.querySelector('[data-act="locate"]').onclick = () =>
      h.onLocate && h.onLocate(annotation);
    this.node.querySelector('[data-act="delete"]').onclick = () =>
      this._renderDeleteConfirm(annotation, anchorRect);
    this.node.querySelectorAll('[data-act="status"]').forEach((btn) => {
      btn.onclick = () => h.onSetStatus && h.onSetStatus(annotation, btn.dataset.status);
    });
    const rejectBtn = this.node.querySelector('[data-act="reject"]');
    if (rejectBtn) rejectBtn.onclick = () => this._renderReject(annotation, anchorRect);
  }

  /** Secondary delete confirmation (requirements item 2). Enter confirms. */
  _renderDeleteConfirm(annotation, anchorRect) {
    this.mode = "confirmDelete";
    this.anchorRect = anchorRect;
    this.node.innerHTML = `
      <h4>${icon("trash", { size: 15 })} <span>${t("confirm.deleteTitle")}</span></h4>
      <div class="note-view">${escapeHtml(annotation.userNote) || t("item.noNote")}</div>
      <div class="meta">${t("confirm.deleteHint")}</div>
      <div class="row">
        <button class="danger" data-act="confirm">${icon("trash", { size: 14 })}<span>${t("confirm.delete")}</span></button>
        <button class="ghost" data-act="cancel">${icon("x", { size: 14 })}<span>${t("confirm.cancel")}</span></button>
      </div>
      <div class="meta hint-center">${t("confirm.enterHint")}</div>`;
    this.node.querySelector('[data-act="confirm"]').onclick = () => this.confirmDelete();
    this.node.querySelector('[data-act="cancel"]').onclick = () =>
      this._renderDetail(annotation, anchorRect);
    this._position(anchorRect);
    setTimeout(() => this.node.querySelector('[data-act="confirm"]').focus(), 0);
  }

  /** Open the delete confirmation for the current annotation (Del shortcut). */
  askDelete() {
    if (this.current) this._renderDeleteConfirm(this.current, this.anchorRect);
  }

  /** Execute the pending delete (confirm button or Enter). */
  confirmDelete() {
    if (this.mode === "confirmDelete" && this.current && this.handlers.onDelete) {
      this.handlers.onDelete(this.current);
    }
  }

  _renderEdit(annotation, anchorRect) {
    this.mode = "edit";
    this.node.innerHTML = `
      <h4>${icon("pencil", { size: 15 })} <span>${t("detail.editTitle")}</span></h4>
      <textarea>${escapeHtml(annotation.userNote)}</textarea>
      <div class="row">
        <button class="primary" data-act="save">${icon("check", { size: 14 })}<span>${t("detail.save")}</span></button>
        <button class="ghost" data-act="back">${icon("x", { size: 14 })}<span>${t("detail.back")}</span></button>
      </div>
      <div class="kbd-hint">${t("create.hint")}</div>`;
    const textarea = this.node.querySelector("textarea");
    this._edit = { annotation, anchorRect, textarea };
    this.node.querySelector('[data-act="save"]').onclick = () => this.saveEdit();
    this.node.querySelector('[data-act="back"]').onclick = () =>
      this._renderDetail(annotation, anchorRect);
    this._position(anchorRect);
    setTimeout(() => textarea.focus(), 0);
  }

  _renderReject(annotation, anchorRect) {
    this.mode = "reject";
    this.node.innerHTML = `
      <h4>${icon("x", { size: 15 })} <span>${t("reject.title")}</span></h4>
      <div class="meta">${t("reject.hint")}</div>
      <textarea>${escapeHtml(annotation.userNote)}</textarea>
      <div class="row">
        <button class="danger" data-act="confirm">${icon("reopen", { size: 14 })}<span>${t("reject.confirm")}</span></button>
        <button class="ghost" data-act="back">${icon("x", { size: 14 })}<span>${t("reject.back")}</span></button>
      </div>`;
    const textarea = this.node.querySelector("textarea");
    this.node.querySelector('[data-act="confirm"]').onclick = () =>
      this.handlers.onSetStatus &&
      this.handlers.onSetStatus(annotation, STATUS.REJECTED, (textarea.value || "").trim());
    this.node.querySelector('[data-act="back"]').onclick = () =>
      this._renderDetail(annotation, anchorRect);
    this._position(anchorRect);
    setTimeout(() => textarea.focus(), 0);
  }
}

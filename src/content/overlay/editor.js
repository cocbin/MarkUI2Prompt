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
    this.node.innerHTML = `
      <h4>${icon("plus", { size: 15 })} <span>${t("create.title")}</span></h4>
      <textarea placeholder="${t("create.placeholder")}"></textarea>
      <div class="row">
        <button class="ghost" data-act="pick">${icon("pointer", { size: 14 })}<span>${t("create.pick")}</span></button>
      </div>
      <div class="row">
        <button class="primary" data-act="save">${icon("check", { size: 14 })}<span>${t("create.save")}</span></button>
        <button class="ghost" data-act="cancel">${icon("x", { size: 14 })}<span>${t("create.cancel")}</span></button>
      </div>`;
    const textarea = this.node.querySelector("textarea");
    this.node.querySelector('[data-act="save"]').onclick = () =>
      onSave((textarea.value || "").trim());
    this.node.querySelector('[data-act="cancel"]').onclick = () => onCancel && onCancel();
    this.node.querySelector('[data-act="pick"]').onclick = () => {
      if (!onPick) return;
      textarea.classList.add("picking");
      onPick((text) => {
        this._insertAtCaret(textarea, text);
        textarea.classList.remove("picking");
      }, () => textarea.classList.remove("picking"));
    };
    this._show(anchorRect);
    setTimeout(() => textarea.focus(), 0);
  }

  /** Detail / action view for an existing annotation. */
  openDetail(annotation, anchorRect, handlers) {
    this.current = annotation;
    this.handlers = handlers || {};
    this._renderDetail(annotation, anchorRect);
  }

  _renderDetail(annotation, anchorRect) {
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
      h.onDelete && h.onDelete(annotation);
    this.node.querySelectorAll('[data-act="status"]').forEach((btn) => {
      btn.onclick = () => h.onSetStatus && h.onSetStatus(annotation, btn.dataset.status);
    });
    const rejectBtn = this.node.querySelector('[data-act="reject"]');
    if (rejectBtn) rejectBtn.onclick = () => this._renderReject(annotation, anchorRect);
  }

  _renderEdit(annotation, anchorRect) {
    this.node.innerHTML = `
      <h4>${icon("pencil", { size: 15 })} <span>${t("detail.editTitle")}</span></h4>
      <textarea>${escapeHtml(annotation.userNote)}</textarea>
      <div class="row">
        <button class="primary" data-act="save">${icon("check", { size: 14 })}<span>${t("detail.save")}</span></button>
        <button class="ghost" data-act="back">${icon("x", { size: 14 })}<span>${t("detail.back")}</span></button>
      </div>`;
    const textarea = this.node.querySelector("textarea");
    this.node.querySelector('[data-act="save"]').onclick = () =>
      this.handlers.onUpdateNote &&
      this.handlers.onUpdateNote(annotation, (textarea.value || "").trim());
    this.node.querySelector('[data-act="back"]').onclick = () =>
      this._renderDetail(annotation, anchorRect);
    this._position(anchorRect);
    setTimeout(() => textarea.focus(), 0);
  }

  _renderReject(annotation, anchorRect) {
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

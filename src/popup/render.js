import { STATUS, STATUS_ORDER } from "../shared/constants.js";
import { t } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { renderLoopExtras } from "./loop-item.js";

const FILTERS = [
  { key: "all", label: () => t("filter.all") },
  { key: STATUS.OPEN, label: () => t("status.open") },
  { key: STATUS.FIXED_PENDING, label: () => t("status.fixed_pending") },
  { key: STATUS.CONFIRMED, label: () => t("status.confirmed") },
];

function statusColor(status) {
  return `var(--u-st-${status})`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function iconBtn(cls, iconName, label, onClick) {
  const b = el("button", `btn ${cls}`);
  b.innerHTML = `${icon(iconName, { size: 14 })}<span></span>`;
  b.querySelector("span").textContent = label;
  b.onclick = onClick;
  return b;
}

export function countByStatus(annotations) {
  const counts = { all: annotations.length };
  for (const s of STATUS_ORDER) counts[s] = 0;
  for (const a of annotations) counts[a.status] = (counts[a.status] || 0) + 1;
  return counts;
}

export function renderFilters(container, counts, current, onSelect) {
  container.innerHTML = "";
  for (const f of FILTERS) {
    const chip = el("button", "chip" + (current === f.key ? " active" : ""));
    chip.append(document.createTextNode(f.label()));
    chip.appendChild(el("span", "count", String(counts[f.key] || 0)));
    chip.onclick = () => onSelect(f.key);
    container.appendChild(chip);
  }
}

/** Element text or class for the semantic label (requirements item 12). */
function displayLabel(a) {
  if (a.label) return a.label;
  const text = (a.dom && a.dom.innerText ? a.dom.innerText : "").replace(/\s+/g, " ").trim();
  if (text) return text.length > 42 ? `${text.slice(0, 42)}…` : text;
  return a.selector || "";
}

function metaText(a) {
  const fw = a.framework || {};
  if (fw.type === "vue" && (fw.component || fw.file)) {
    return [fw.component, fw.file].filter(Boolean).join(" · ");
  }
  if (a.selector && a.locatorQuality && a.locatorQuality !== "weak") return a.selector;
  return "";
}

function statusActions(a, handlers) {
  const wrap = el("div", "item-actions");
  if (a.status === STATUS.OPEN) {
    wrap.appendChild(iconBtn("warn", "check", t("detail.markFixed"), () => handlers.onStatus(a.id, STATUS.FIXED_PENDING)));
  } else if (a.status === STATUS.FIXED_PENDING) {
    wrap.appendChild(iconBtn("success", "check", t("detail.confirm"), () => handlers.onStatus(a.id, STATUS.CONFIRMED)));
    wrap.appendChild(iconBtn("danger", "x", t("detail.reject"), () => handlers.onStatus(a.id, STATUS.REJECTED)));
  } else if (a.status === STATUS.CONFIRMED) {
    wrap.appendChild(iconBtn("ghost", "reopen", t("detail.reopen"), () => handlers.onStatus(a.id, STATUS.OPEN)));
  }
  wrap.appendChild(iconBtn("ghost", "crosshair", t("detail.locate"), () => handlers.onLocate(a.id)));
  wrap.appendChild(iconBtn("ghost", "pencil", t("detail.edit"), () => handlers.onEdit(a.id)));
  wrap.appendChild(iconBtn("danger-text", "trash", t("detail.delete"), () => handlers.onDelete(a.id)));
  return wrap;
}

/** Collapse a status history into a readable chain, deduping consecutive repeats. */
function statusHistoryChain(history) {
  if (!history || history.length < 2) return "";
  const labels = [];
  for (const h of history) {
    const label = t(`status.${h.status}`);
    if (labels[labels.length - 1] !== label) labels.push(label);
  }
  return labels.length > 1 ? labels.join(" → ") : "";
}

function buildItem(a, index, handlers, editing, loop) {
  const item = el("div", "item");
  const head = el("div", "item-head");

  const idx = el("div", "item-index", String(index));
  idx.style.background = statusColor(a.status);

  const body = el("div", "item-body");
  const top = el("div", "item-top");
  const label = displayLabel(a);
  const labelEl = el("div", "item-label" + (label.startsWith(".") ? " is-class" : ""), label || t("item.noNote"));
  const badge = el("span", "badge", t(`status.${a.status}`));
  badge.style.background = statusColor(a.status);
  top.append(labelEl, badge);

  const note = el("div", "item-note" + (a.userNote ? "" : " empty-note"), a.userNote || t("item.noNote"));
  body.append(top, note);

  const meta = metaText(a);
  if (meta) body.appendChild(el("div", "item-meta", meta));

  const chain = statusHistoryChain(a.history);
  if (chain) body.appendChild(el("div", "item-meta history", `${t("item.history")}: ${chain}`));

  head.append(idx, body);
  item.appendChild(head);

  if (editing === a.id) item.appendChild(buildEditArea(a, handlers));
  else item.appendChild(statusActions(a, handlers));

  const extras = renderLoopExtras(a, loop, handlers);
  if (extras) item.appendChild(extras);
  return item;
}

function buildEditArea(a, handlers) {
  const wrap = el("div", "edit-area");
  const textarea = el("textarea");
  textarea.value = a.userNote || "";
  const actions = el("div", "item-actions");
  actions.append(
    iconBtn("primary", "check", t("detail.save"), () => handlers.onEditSave(a.id, textarea.value.trim())),
    iconBtn("ghost", "x", t("detail.back"), () => handlers.onEditCancel()),
  );
  wrap.append(textarea, actions);
  setTimeout(() => textarea.focus(), 0);
  return wrap;
}

export function renderList(container, annotations, filter, handlers, editing, loop) {
  container.innerHTML = "";
  const filtered = annotations.filter((a) => filter === "all" || a.status === filter);
  if (!filtered.length) {
    container.appendChild(
      el("div", "empty", annotations.length ? t("list.emptyFiltered") : t("list.empty")),
    );
    return;
  }
  const indexById = new Map();
  [...annotations]
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((a, i) => indexById.set(a.id, i + 1));
  filtered
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach((a) => container.appendChild(buildItem(a, indexById.get(a.id), handlers, editing, loop)));
}

export function renderProjects(container, pages, currentUrl, onOpen) {
  container.innerHTML = "";
  const others = pages.filter((p) => p.url !== currentUrl && p.annotations.length);
  if (!others.length) return;
  container.appendChild(el("h3", "", t("projects.others")));
  for (const p of others) {
    const row = el("div", "proj-item");
    row.appendChild(el("div", "proj-url", p.title || p.url));
    const active = p.annotations.filter(
      (a) => a.status === STATUS.OPEN || a.status === STATUS.FIXED_PENDING,
    ).length;
    row.appendChild(el("div", "proj-count", t("projects.count", { total: p.annotations.length, active })));
    row.onclick = () => onOpen(p.url);
    container.appendChild(row);
  }
}

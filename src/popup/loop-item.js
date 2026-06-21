import { t } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { STATUS } from "../shared/constants.js";
import { loopBadge, esc } from "./loop-board.js";

/**
 * Per-annotation loop extras shown in the popup's main list (requirements items
 * 1 & 2): the live AI badge (animated robot while in-progress), the agent's
 * summary, any human rejection feedback, inline confirm / reject-with-reason
 * actions and a reply box for pending agent questions — so the human can drive
 * the loop without opening the dedicated panel.
 */

const AWAITING = new Set(["ai_fixed", "ai_reviewed"]);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/** @returns {HTMLElement|null} extras node, or null when there's nothing loopy. */
export function renderLoopExtras(a, loop, handlers) {
  if (!loop) return null;
  const task = loop.byId.get(a.id);
  const questions = loop.questionsByTask.get(a.id) || [];
  if (!task && !questions.length) return null;

  const wrap = el("div", "item-loop");
  if (task) appendTask(wrap, task, handlers);
  for (const q of questions) appendQuestion(wrap, q, handlers);
  return wrap;
}

function appendTask(wrap, task, handlers) {
  const head = el("div", "il-head");
  head.innerHTML = loopBadge(task.status);
  if (task.lockedBy) head.appendChild(el("span", "il-lock", t("loop.lockedBy", { agent: task.lockedBy })));
  wrap.appendChild(head);

  if (task.agentSummary) {
    const sum = el("div", "il-summary");
    sum.innerHTML = `${icon("bot", { size: 12 })}<span>${esc(task.agentSummary)}</span>`;
    wrap.appendChild(sum);
  }

  if (task.feedback) {
    const fb = el("div", "il-feedback");
    fb.innerHTML = `${icon("message", { size: 12 })}<span>${esc(task.feedback)}</span>`;
    wrap.appendChild(fb);
  }

  if (AWAITING.has(task.status)) {
    const actions = el("div", "item-actions il-actions");
    const confirmBtn = el("button", "btn success");
    confirmBtn.innerHTML = `${icon("check", { size: 13 })}<span>${esc(t("detail.confirm"))}</span>`;
    confirmBtn.onclick = () => handlers.onStatus(task.id, STATUS.CONFIRMED);
    const rejectBtn = el("button", "btn danger");
    rejectBtn.innerHTML = `${icon("reopen", { size: 13 })}<span>${esc(t("detail.reject"))}</span>`;
    rejectBtn.onclick = () => openReject(actions, task, handlers);
    actions.append(confirmBtn, rejectBtn);
    wrap.appendChild(actions);
  }
}

/** Inline reject-reason box (requirements item 4). */
function openReject(actions, task, handlers) {
  if (actions.querySelector(".il-reject")) return;
  const box = el("div", "il-reject");
  const ta = el("textarea");
  ta.placeholder = t("reject.placeholder");
  const row = el("div", "il-reject-row");
  const doBtn = el("button", "btn danger");
  doBtn.innerHTML = `${icon("reopen", { size: 13 })}<span>${esc(t("reject.confirm"))}</span>`;
  doBtn.onclick = () => handlers.onStatus(task.id, STATUS.REJECTED, ta.value.trim());
  const cancelBtn = el("button", "btn ghost", t("reject.back"));
  cancelBtn.onclick = () => box.remove();
  row.append(doBtn, cancelBtn);
  box.append(ta, row);
  actions.appendChild(box);
  setTimeout(() => ta.focus(), 0);
}

function appendQuestion(wrap, q, handlers) {
  const card = el("div", "il-question");
  const text = el("div", "il-q-text");
  text.innerHTML = `${icon("message", { size: 12 })}<span>${esc(q.question)}</span>`;
  card.appendChild(text);

  const answer = (val) => {
    const v = (val || "").trim();
    if (v) handlers.onLoopAnswer(q.id, v);
  };

  if ((q.options || []).length) {
    const opts = el("div", "il-q-opts");
    q.options.forEach((o) => {
      const b = el("button", "btn il-opt", o);
      b.onclick = () => answer(o);
      opts.appendChild(b);
    });
    card.appendChild(opts);
  }

  const custom = el("div", "il-q-custom");
  const input = el("input");
  input.type = "text";
  input.placeholder = t("loop.customAnswer");
  input.onkeydown = (e) => {
    if (e.key === "Enter") answer(input.value);
  };
  const send = el("button", "btn primary", t("loop.send"));
  send.onclick = () => answer(input.value);
  custom.append(input, send);
  card.appendChild(custom);
  wrap.appendChild(card);
}

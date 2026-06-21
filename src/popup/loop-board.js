import { t } from "../shared/i18n.js";
import { icon, botWorking } from "../shared/icons.js";
import { STATUS } from "../shared/constants.js";
import { Api } from "./api.js";

/**
 * Shared loop-mode board: live broker status, pending agent questions (with a
 * reply box) and the task list with AI states, agent summaries, editable
 * rejection feedback and confirm/reject actions. Used by both the popup dialog
 * (`loop-panel.js`) and the standalone page (`loop-page.js`) so the board lives
 * in exactly one place (requirements items 1, 2, 4).
 */

const DEFAULT_POLL_MS = 2000;

/** AI/loop badge styling per broker task status. */
const LOOP_BADGE = {
  in_progress: { key: "loop.state.in_progress", cls: "lp-b-progress", bot: true },
  ai_fixed: { key: "loop.state.ai_fixed", cls: "lp-b-fixed" },
  ai_reviewed: { key: "loop.state.ai_reviewed", cls: "lp-b-reviewed" },
  confirmed: { key: "loop.state.confirmed", cls: "lp-b-confirmed" },
  rejected: { key: "loop.state.open", cls: "lp-b-open" },
  open: { key: "loop.state.open", cls: "lp-b-open" },
};

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

/** A status badge; the in-progress one carries the animated "robot working" SVG. */
export function loopBadge(status) {
  const b = LOOP_BADGE[status] || LOOP_BADGE.open;
  const art = b.bot ? botWorking({ size: 13, cls: "lp-bot" }) : "";
  return `<span class="lp-badge ${b.cls}">${art}${esc(t(b.key))}</span>`;
}

function taskTitle(task) {
  return task.title || (task.url ? task.url.replace(/^https?:\/\//, "") : "");
}

const AWAITING = new Set(["ai_fixed", "ai_reviewed"]);

/**
 * @param {HTMLElement} root   container to render the board into
 * @param {object} ctx         { toast, onChanged, pollMs }
 * @returns {{ refresh:Function, destroy:Function }}
 */
export function createLoopBoard(root, ctx = {}) {
  const pollMs = ctx.pollMs || DEFAULT_POLL_MS;
  root.classList.add("lp-board");
  root.innerHTML = `
    <div class="lp-statusbar" data-el="status"></div>
    <div class="lp-section" data-el="questionsWrap" hidden>
      <div class="lp-section-head"><span>${esc(t("loop.questions"))}</span></div>
      <div data-el="questions"></div>
    </div>
    <div class="lp-section">
      <div class="lp-section-head">
        <span data-el="tasksTitle">${esc(t("loop.tasks"))}</span>
        <div class="lp-head-actions">
          <button class="btn ghost" data-el="stop" type="button" hidden>${icon("stop", { size: 13 })}<span>${esc(t("loop.stop"))}</span></button>
          <button class="btn ghost" data-el="reset" type="button">${icon("trash", { size: 13 })}<span>${esc(t("loop.reset"))}</span></button>
        </div>
      </div>
      <div data-el="tasks" class="lp-tasks"></div>
    </div>`;

  const el = (name) => root.querySelector(`[data-el="${name}"]`);
  const statusEl = el("status");
  const questionsWrap = el("questionsWrap");
  const questionsEl = el("questions");
  const tasksEl = el("tasks");
  const tasksTitle = el("tasksTitle");
  const stopBtn = el("stop");
  const resetBtn = el("reset");

  // While the human is typing into a reply / feedback / reject box, pause the
  // poll-driven re-render so their text isn't wiped from under them.
  let editing = false;
  let timer = 0;
  let destroyed = false;

  const holdEditing = (node) => {
    node.addEventListener("focus", () => (editing = true), true);
    node.addEventListener("blur", () => (editing = false), true);
  };

  resetBtn.onclick = async () => {
    if (!confirm(t("loop.resetConfirm"))) return;
    try {
      await Api.loopReset();
    } catch {
      /* offline */
    }
    refresh();
  };
  stopBtn.onclick = async () => {
    try {
      await Api.loopStop();
      ctx.toast && ctx.toast(t("loop.stopSent"));
    } catch {
      ctx.toast && ctx.toast(t("loop.verdictFail"));
    }
    refresh();
  };

  function renderStatus(snap, online) {
    if (!online) {
      statusEl.className = "lp-statusbar lp-off";
      statusEl.innerHTML = `${icon("info", { size: 14 })}<span>${esc(t("loop.offline"))}</span>`;
      stopBtn.hidden = true;
      return;
    }
    const agents = (snap.agents || []).filter((a) => a.online);
    const open = (snap.tasks || []).filter((tk) => ["open", "in_progress"].includes(tk.status)).length;
    const working = (snap.tasks || []).some((tk) => tk.status === "in_progress");
    statusEl.className = "lp-statusbar lp-on";
    statusEl.innerHTML =
      `${icon("bot", { size: 14 })}<span>${esc(t("loop.online", { agents: agents.length, tasks: open }))}</span>`;
    // Offer Stop whenever a scheduler could be running (agents online or work in flight).
    stopBtn.hidden = !(agents.length || working);
  }

  function renderQuestions(snap) {
    const pending = (snap.questions || []).filter((q) => q.answer == null);
    questionsWrap.hidden = pending.length === 0;
    questionsEl.innerHTML = "";
    for (const q of pending) {
      const card = document.createElement("div");
      card.className = "lp-question";
      const opts = (q.options || [])
        .map((o, i) => `<button class="btn lp-opt" data-i="${i}" type="button">${esc(o)}</button>`)
        .join("");
      card.innerHTML = `
        <div class="lp-q-text">${icon("message", { size: 13 })}<span>${esc(q.question)}</span></div>
        <div class="lp-q-opts">${opts}</div>
        <div class="lp-q-custom">
          <input type="text" placeholder="${esc(t("loop.customAnswer"))}" />
          <button class="btn primary" type="button" data-act="send">${esc(t("loop.send"))}</button>
        </div>`;
      const answer = async (text) => {
        if (!text) return;
        try {
          await Api.loopAnswer(q.id, text);
          refresh();
        } catch {
          ctx.toast && ctx.toast(t("loop.answerFail"));
        }
      };
      card.querySelectorAll(".lp-opt").forEach((b) => {
        b.onclick = () => answer(q.options[Number(b.dataset.i)]);
      });
      const input = card.querySelector("input");
      holdEditing(input);
      card.querySelector('[data-act="send"]').onclick = () => answer(input.value.trim());
      input.onkeydown = (e) => {
        if (e.key === "Enter") answer(input.value.trim());
      };
      questionsEl.appendChild(card);
    }
  }

  async function verdict(task, status, note) {
    try {
      await Api.setStatus(task.url, task.id, status, note);
      ctx.onChanged && ctx.onChanged();
      refresh();
    } catch {
      ctx.toast && ctx.toast(t("loop.verdictFail"));
    }
  }

  async function saveFeedback(task, note) {
    try {
      await Api.loopFeedback(task.id, note);
      ctx.toast && ctx.toast(t("loop.feedbackSaved"));
      refresh();
    } catch {
      ctx.toast && ctx.toast(t("loop.feedbackLocked"));
    }
  }

  function buildTask(task, i) {
    const row = document.createElement("div");
    row.className = "lp-task";
    const awaiting = AWAITING.has(task.status);
    const claimed = !!task.lockedBy && task.status === "in_progress";
    const editableFeedback = task.status === "open" && !task.lockedBy;

    const summary = task.agentSummary
      ? `<div class="lp-task-sum">${icon("bot", { size: 12 })}<span>${esc(task.agentSummary)}</span></div>`
      : "";
    const lock = task.lockedBy
      ? `<span class="lp-lock">${esc(t("loop.lockedBy", { agent: task.lockedBy }))}</span>`
      : "";

    row.innerHTML = `
      <div class="lp-task-top">
        <span class="lp-task-idx">${i + 1}</span>
        ${loopBadge(task.status)}
        <span class="lp-task-page" title="${esc(task.url)}">${esc(taskTitle(task))}</span>
        ${lock}
      </div>
      <div class="lp-task-problem">${esc(task.problem || t("item.noNote"))}</div>
      ${summary}
      <div class="lp-feedback" data-el="fbZone"></div>
      <div class="lp-task-actions" data-el="actions"></div>`;

    const fbZone = row.querySelector('[data-el="fbZone"]');
    renderFeedbackZone(fbZone, task, editableFeedback, claimed);

    const actions = row.querySelector('[data-el="actions"]');
    if (awaiting) {
      const confirmBtn = document.createElement("button");
      confirmBtn.className = "btn primary";
      confirmBtn.type = "button";
      confirmBtn.innerHTML = `${icon("check", { size: 13 })}<span>${esc(t("detail.confirm"))}</span>`;
      confirmBtn.onclick = () => verdict(task, STATUS.CONFIRMED);
      const rejectBtn = document.createElement("button");
      rejectBtn.className = "btn ghost";
      rejectBtn.type = "button";
      rejectBtn.innerHTML = `${icon("reopen", { size: 13 })}<span>${esc(t("detail.reject"))}</span>`;
      rejectBtn.onclick = () => openReject(actions, task);
      actions.append(confirmBtn, rejectBtn);
    }
    return row;
  }

  /** Show a rejected task's feedback; allow editing while it is still unclaimed. */
  function renderFeedbackZone(zone, task, editable, claimed) {
    if (editable) {
      zone.innerHTML = `
        <label class="lp-fb-label">${esc(t("loop.feedbackLabel"))}</label>
        <div class="lp-fb-edit">
          <input type="text" value="${esc(task.feedback || "")}" placeholder="${esc(t("reject.placeholder"))}" />
          <button class="btn ghost" type="button" data-act="save">${esc(t("detail.save"))}</button>
        </div>`;
      const input = zone.querySelector("input");
      holdEditing(input);
      const save = () => saveFeedback(task, input.value.trim());
      zone.querySelector('[data-act="save"]').onclick = save;
      input.onkeydown = (e) => {
        if (e.key === "Enter") save();
      };
    } else if (task.feedback) {
      const locked = claimed ? ` ${esc(t("loop.feedbackFrozen"))}` : "";
      zone.innerHTML = `<div class="lp-fb-view">${icon("message", { size: 12 })}<span>${esc(task.feedback)}${locked}</span></div>`;
    } else {
      zone.remove();
    }
  }

  /** Inline reject-reason box appended to a task's action row (requirements item 4). */
  function openReject(actions, task) {
    if (actions.querySelector(".lp-reject")) return;
    const box = document.createElement("div");
    box.className = "lp-reject";
    box.innerHTML = `
      <textarea placeholder="${esc(t("reject.placeholder"))}"></textarea>
      <div class="lp-reject-row">
        <button class="btn danger" type="button" data-act="do">${icon("reopen", { size: 13 })}<span>${esc(t("reject.confirm"))}</span></button>
        <button class="btn ghost" type="button" data-act="cancel">${esc(t("reject.back"))}</button>
      </div>`;
    const ta = box.querySelector("textarea");
    holdEditing(ta);
    box.querySelector('[data-act="do"]').onclick = () => verdict(task, STATUS.REJECTED, ta.value.trim());
    box.querySelector('[data-act="cancel"]').onclick = () => {
      editing = false;
      box.remove();
    };
    actions.appendChild(box);
    setTimeout(() => ta.focus(), 0);
  }

  function renderTasks(snap) {
    const tasks = snap.tasks || [];
    tasksTitle.textContent = `${t("loop.tasks")} (${tasks.length})`;
    tasksEl.innerHTML = "";
    if (!tasks.length) {
      tasksEl.innerHTML = `<div class="lp-empty">${esc(t("loop.noTasks"))}</div>`;
      return;
    }
    tasks.forEach((task, i) => tasksEl.appendChild(buildTask(task, i)));
  }

  async function refresh() {
    if (destroyed || editing) return;
    let snap = null;
    try {
      snap = await Api.loopState();
    } catch {
      renderStatus(null, false);
      tasksEl.innerHTML = `<div class="lp-empty">${esc(t("loop.offline"))}</div>`;
      questionsWrap.hidden = true;
      return;
    }
    if (destroyed || editing) return;
    renderStatus(snap, true);
    renderQuestions(snap);
    renderTasks(snap);
  }

  function destroy() {
    destroyed = true;
    clearInterval(timer);
  }

  refresh();
  timer = setInterval(refresh, pollMs);
  return { refresh, destroy };
}

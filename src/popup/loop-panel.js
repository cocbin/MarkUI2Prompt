import { t } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { STATUS } from "../shared/constants.js";
import { Api } from "./api.js";

/**
 * Loop-mode control panel (requirement: human ⇄ agent collaboration). Renders
 * the broker status, the copy-paste agent prompt, the live task list and any
 * pending agent questions for the human to answer — polling the broker while
 * open. All task ids equal annotation ids, so confirm/reject reuse SET_STATUS.
 */

const POLL_MS = 2000;

const LOOP_BADGE = {
  in_progress: { key: "loop.state.in_progress", cls: "lp-b-progress" },
  ai_fixed: { key: "loop.state.ai_fixed", cls: "lp-b-fixed" },
  ai_reviewed: { key: "loop.state.ai_reviewed", cls: "lp-b-reviewed" },
  confirmed: { key: "loop.state.confirmed", cls: "lp-b-confirmed" },
  rejected: { key: "loop.state.open", cls: "lp-b-open" },
  open: { key: "loop.state.open", cls: "lp-b-open" },
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
}

function badge(status) {
  const b = LOOP_BADGE[status] || LOOP_BADGE.open;
  return `<span class="lp-badge ${b.cls}">${esc(t(b.key))}</span>`;
}

function taskTitle(task) {
  return task.title || (task.url ? task.url.replace(/^https?:\/\//, "") : "");
}

export function openLoopPanel(dialogEl, ctx) {
  dialogEl.innerHTML = `
    <div class="dialog-card lp-card">
      <div class="dialog-head">
        ${icon("loop", { size: 18 })}
        <span class="dialog-title">${esc(t("loop.title"))}</span>
        <button class="dialog-close" type="button" data-act="close" title="${esc(t("dialog.close"))}">${icon("x", { size: 16 })}</button>
      </div>
      <div class="dialog-body lp-body">
        <div class="lp-statusbar" id="lpStatus"></div>
        <div class="set-row">
          <div class="set-text">
            <div class="set-label">${esc(t("loop.enable"))}</div>
            <div class="set-hint">${esc(t("loop.enableHint"))}</div>
          </div>
          <div class="set-control">
            <label class="switch">
              <input type="checkbox" id="lpToggle"${ctx.loopEnabled ? " checked" : ""} />
              <span class="track"><span class="thumb"></span></span>
            </label>
          </div>
        </div>

        <div class="lp-section">
          <div class="lp-section-head">
            <span>${esc(t("loop.agentPrompt"))}</span>
            <button class="btn ghost lp-copy" id="lpCopy" type="button">${icon("copy", { size: 13 })}<span>${esc(t("loop.copyPrompt"))}</span></button>
          </div>
          <div class="lp-hint">${esc(t("loop.howto"))}</div>
          <pre class="lp-prompt" id="lpPrompt"></pre>
        </div>

        <div class="lp-section" id="lpQuestionsWrap" hidden>
          <div class="lp-section-head"><span>${esc(t("loop.questions"))}</span></div>
          <div id="lpQuestions"></div>
        </div>

        <div class="lp-section">
          <div class="lp-section-head">
            <span id="lpTasksTitle">${esc(t("loop.tasks"))}</span>
            <button class="btn ghost" id="lpReset" type="button">${icon("trash", { size: 13 })}<span>${esc(t("loop.reset"))}</span></button>
          </div>
          <div id="lpTasks" class="lp-tasks"></div>
        </div>
      </div>
    </div>`;

  const el = (id) => dialogEl.querySelector(id);
  const statusEl = el("#lpStatus");
  const tasksEl = el("#lpTasks");
  const tasksTitle = el("#lpTasksTitle");
  const questionsWrap = el("#lpQuestionsWrap");
  const questionsEl = el("#lpQuestions");
  let promptText = "";
  let timer = 0;

  const close = () => {
    clearInterval(timer);
    dialogEl.classList.remove("open");
    ctx.onClose && ctx.onClose();
  };
  dialogEl.querySelectorAll('[data-act="close"]').forEach((b) => (b.onclick = close));
  dialogEl.onclick = (e) => {
    if (e.target === dialogEl) close();
  };

  el("#lpToggle").onchange = async (e) => {
    await ctx.onToggleLoop(e.target.checked);
    refresh();
  };
  el("#lpCopy").onclick = async () => {
    if (promptText) ctx.copy(promptText);
  };
  el("#lpReset").onclick = async () => {
    if (!confirm(t("loop.resetConfirm"))) return;
    try {
      await Api.loopReset();
    } catch {
      /* offline */
    }
    refresh();
  };

  async function loadPrompt() {
    try {
      const res = await Api.loopPrompt();
      promptText = res.prompt || "";
      el("#lpPrompt").textContent = promptText;
    } catch {
      el("#lpPrompt").textContent = "";
    }
  }

  function renderStatus(snap, online) {
    if (!online) {
      statusEl.className = "lp-statusbar lp-off";
      statusEl.innerHTML = `${icon("info", { size: 14 })}<span>${esc(t("loop.offline"))}</span><code>${esc(ctx.brokerUrl)}</code>`;
      return;
    }
    const agents = (snap.agents || []).filter((a) => a.online);
    const open = (snap.tasks || []).filter((tk) => ["open", "in_progress"].includes(tk.status)).length;
    statusEl.className = "lp-statusbar lp-on";
    statusEl.innerHTML =
      `${icon("bot", { size: 14 })}<span>${esc(t("loop.online", { agents: agents.length, tasks: open }))}</span>`;
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
          ctx.toast(t("loop.answerFail"));
        }
      };
      card.querySelectorAll(".lp-opt").forEach((b) => {
        b.onclick = () => answer(q.options[Number(b.dataset.i)]);
      });
      const input = card.querySelector("input");
      card.querySelector('[data-act="send"]').onclick = () => answer(input.value.trim());
      input.onkeydown = (e) => {
        if (e.key === "Enter") answer(input.value.trim());
      };
      questionsEl.appendChild(card);
    }
  }

  async function verdict(task, status) {
    try {
      await Api.setStatus(task.url, task.id, status);
      ctx.onChanged && ctx.onChanged();
      refresh();
    } catch {
      ctx.toast(t("loop.verdictFail"));
    }
  }

  function renderTasks(snap) {
    const tasks = snap.tasks || [];
    tasksTitle.textContent = t("loop.tasks") + ` (${tasks.length})`;
    tasksEl.innerHTML = "";
    if (!tasks.length) {
      tasksEl.innerHTML = `<div class="lp-empty">${esc(t("loop.noTasks"))}</div>`;
      return;
    }
    tasks.forEach((task, i) => {
      const row = document.createElement("div");
      row.className = "lp-task";
      const awaiting = task.status === "ai_fixed" || task.status === "ai_reviewed";
      const summary = task.agentSummary
        ? `<div class="lp-task-sum">${icon("bot", { size: 12 })}<span>${esc(task.agentSummary)}</span></div>`
        : "";
      const lock = task.lockedBy
        ? `<span class="lp-lock">${esc(t("loop.lockedBy", { agent: task.lockedBy }))}</span>`
        : "";
      const actions = awaiting
        ? `<div class="lp-task-actions">
             <button class="btn primary" data-act="confirm" type="button">${icon("check", { size: 13 })}<span>${esc(t("detail.confirm"))}</span></button>
             <button class="btn ghost" data-act="reject" type="button">${icon("reopen", { size: 13 })}<span>${esc(t("detail.reject"))}</span></button>
           </div>`
        : "";
      row.innerHTML = `
        <div class="lp-task-top">
          <span class="lp-task-idx">${i + 1}</span>
          ${badge(task.status)}
          <span class="lp-task-page" title="${esc(task.url)}">${esc(taskTitle(task))}</span>
          ${lock}
        </div>
        <div class="lp-task-problem">${esc(task.problem || t("item.noNote"))}</div>
        ${summary}
        ${actions}`;
      const c = row.querySelector('[data-act="confirm"]');
      const r = row.querySelector('[data-act="reject"]');
      if (c) c.onclick = () => verdict(task, STATUS.CONFIRMED);
      if (r) r.onclick = () => verdict(task, STATUS.REJECTED);
      tasksEl.appendChild(row);
    });
  }

  async function refresh() {
    let snap = null;
    try {
      snap = await Api.loopState();
    } catch {
      renderStatus(null, false);
      tasksEl.innerHTML = "";
      questionsWrap.hidden = true;
      return;
    }
    renderStatus(snap, true);
    renderQuestions(snap);
    renderTasks(snap);
  }

  loadPrompt();
  refresh();
  timer = setInterval(refresh, POLL_MS);
  dialogEl.classList.add("open");
}

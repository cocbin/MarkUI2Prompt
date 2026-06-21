import { t } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";
import { Api } from "./api.js";
import { createLoopBoard, esc } from "./loop-board.js";

/**
 * Loop-mode control dialog (human ⇄ agent collaboration). Owns the enable
 * toggle, the copy-paste agent prompt and an "open standalone page" button;
 * the live status / questions / task board is the shared `loop-board` so the
 * popup dialog and the full page stay in lock-step (requirements items 1, 2).
 */
export function openLoopPanel(dialogEl, ctx) {
  dialogEl.innerHTML = `
    <div class="dialog-card lp-card">
      <div class="dialog-head">
        ${icon("loop", { size: 18 })}
        <span class="dialog-title">${esc(t("loop.title"))}</span>
        <button class="dialog-close" type="button" data-act="expand" title="${esc(t("loop.openPage"))}">${icon("expand", { size: 16 })}</button>
        <button class="dialog-close" type="button" data-act="close" title="${esc(t("dialog.close"))}">${icon("x", { size: 16 })}</button>
      </div>
      <div class="dialog-body lp-body">
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

        <div id="lpBoard"></div>
      </div>
    </div>`;

  const el = (id) => dialogEl.querySelector(id);
  let promptText = "";

  const board = createLoopBoard(el("#lpBoard"), {
    toast: ctx.toast,
    onChanged: ctx.onChanged,
  });

  const close = () => {
    board.destroy();
    dialogEl.classList.remove("open");
    ctx.onClose && ctx.onClose();
  };
  dialogEl.querySelector('[data-act="close"]').onclick = close;
  dialogEl.querySelector('[data-act="expand"]').onclick = () => {
    ctx.onExpand && ctx.onExpand();
    close();
  };
  dialogEl.onclick = (e) => {
    if (e.target === dialogEl) close();
  };

  el("#lpToggle").onchange = async (e) => {
    await ctx.onToggleLoop(e.target.checked);
    board.refresh();
  };
  el("#lpCopy").onclick = () => {
    if (promptText) ctx.copy(promptText);
  };

  (async function loadPrompt() {
    try {
      const res = await Api.loopPrompt();
      promptText = res.prompt || "";
      el("#lpPrompt").textContent = promptText;
    } catch {
      el("#lpPrompt").textContent = "";
    }
  })();

  dialogEl.classList.add("open");
}

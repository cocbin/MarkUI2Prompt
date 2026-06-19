import { t } from "../shared/i18n.js";
import { icon } from "../shared/icons.js";

/** Walkthrough steps. Images are bundled under dist/guide/ (see build.mjs). */
const GUIDE_STEPS = [
  { n: 1, img: "guide/step1.png" },
  { n: 2, img: "guide/step2.png" },
  { n: 3, img: "guide/step3.png" },
  { n: 4, img: "guide/step4.png" },
  { n: 5, img: "guide/step5.png" },
  { n: 6, img: "guide/use_in_agent.png" },
  { n: 7, img: "guide/use_in_agent_result.png" },
];

function headHtml(iconName, title) {
  return `
    <div class="dialog-head">
      ${icon(iconName, { size: 18 })}
      <span class="dialog-title">${title}</span>
      <button class="dialog-close" type="button" data-act="close" title="${t("dialog.close")}">${icon("x", { size: 16 })}</button>
    </div>`;
}

/**
 * Settings dialog: appearance (theme) + display (show resolved). Theme + show
 * resolved persist via callbacks supplied by the popup.
 */
export function openSettings(dialogEl, ctx) {
  const { theme, showResolved, lockHostKeys } = ctx;
  dialogEl.innerHTML = `
    <div class="dialog-card">
      ${headHtml("gear", t("settings.title"))}
      <div class="dialog-body">
        <div class="set-section">${t("settings.appearance")}</div>
        <div class="set-row">
          <div class="set-text"><div class="set-label">${t("settings.theme")}</div></div>
          <div class="set-control">
            <div class="seg" id="setTheme">
              <button type="button" data-v="system"${theme === "system" ? ' class="active"' : ""}>${t("theme.system")}</button>
              <button type="button" data-v="light"${theme === "light" ? ' class="active"' : ""}>${t("theme.light")}</button>
              <button type="button" data-v="dark"${theme === "dark" ? ' class="active"' : ""}>${t("theme.dark")}</button>
            </div>
          </div>
        </div>
        <div class="set-section">${t("settings.display")}</div>
        <div class="set-row">
          <div class="set-text">
            <div class="set-label">${t("settings.showResolved")}</div>
            <div class="set-hint">${t("settings.showResolvedHint")}</div>
          </div>
          <div class="set-control">
            <label class="switch">
              <input type="checkbox" id="setResolved"${showResolved ? " checked" : ""} />
              <span class="track"><span class="thumb"></span></span>
            </label>
          </div>
        </div>
        <div class="set-section">${t("settings.interaction")}</div>
        <div class="set-row">
          <div class="set-text">
            <div class="set-label">${t("settings.lockKeys")}</div>
            <div class="set-hint">${t("settings.lockKeysHint")}</div>
          </div>
          <div class="set-control">
            <label class="switch">
              <input type="checkbox" id="setLockKeys"${lockHostKeys ? " checked" : ""} />
              <span class="track"><span class="thumb"></span></span>
            </label>
          </div>
        </div>
      </div>
      <div class="dialog-foot">
        <button class="btn primary" type="button" data-act="close">${t("settings.done")}</button>
      </div>
    </div>`;

  const close = () => {
    dialogEl.classList.remove("open");
    ctx.onClose && ctx.onClose();
  };
  dialogEl.querySelectorAll('[data-act="close"]').forEach((b) => (b.onclick = close));
  dialogEl.onclick = (e) => {
    if (e.target === dialogEl) close();
  };
  dialogEl.querySelectorAll("#setTheme button").forEach((b) => {
    b.onclick = () => {
      dialogEl.querySelectorAll("#setTheme button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      ctx.onSetTheme && ctx.onSetTheme(b.dataset.v);
    };
  });
  dialogEl.querySelector("#setResolved").onchange = (e) =>
    ctx.onToggleResolved && ctx.onToggleResolved(e.target.checked);
  dialogEl.querySelector("#setLockKeys").onchange = (e) =>
    ctx.onToggleLockKeys && ctx.onToggleLockKeys(e.target.checked);

  dialogEl.classList.add("open");
}

/** Help / usage walkthrough dialog: step list (left) + screenshot (right). */
export function openGuide(dialogEl, ctx) {
  dialogEl.innerHTML = `
    <div class="dialog-card">
      ${headHtml("help", t("guide.title"))}
      <div class="dialog-body guide-body">
        <div class="guide-steps" id="guideSteps"></div>
        <div class="guide-main">
          <div class="guide-figure"><img id="guideImg" alt="" /></div>
          <div class="guide-caption">
            <div class="c-step" id="guideStepNo"></div>
            <div class="c-title" id="guideTitle"></div>
            <div class="c-desc" id="guideDesc"></div>
          </div>
        </div>
      </div>
    </div>`;

  const stepsEl = dialogEl.querySelector("#guideSteps");
  const img = dialogEl.querySelector("#guideImg");
  const stepNo = dialogEl.querySelector("#guideStepNo");
  const titleEl = dialogEl.querySelector("#guideTitle");
  const descEl = dialogEl.querySelector("#guideDesc");

  const select = (n) => {
    stepsEl.querySelectorAll(".guide-step").forEach((el) =>
      el.classList.toggle("active", Number(el.dataset.n) === n),
    );
    const step = GUIDE_STEPS.find((s) => s.n === n) || GUIDE_STEPS[0];
    img.src = step.img;
    stepNo.textContent = `${n} / ${GUIDE_STEPS.length}`;
    titleEl.textContent = t(`guide.step${n}.title`);
    descEl.textContent = t(`guide.step${n}.desc`);
  };

  for (const s of GUIDE_STEPS) {
    const b = document.createElement("button");
    b.className = "guide-step";
    b.type = "button";
    b.dataset.n = String(s.n);
    b.innerHTML = `<span class="num">${s.n}</span><span class="st-title"></span>`;
    b.querySelector(".st-title").textContent = t(`guide.step${s.n}.title`);
    b.onclick = () => select(s.n);
    stepsEl.appendChild(b);
  }

  const close = () => {
    dialogEl.classList.remove("open");
    ctx.onClose && ctx.onClose();
  };
  dialogEl.querySelectorAll('[data-act="close"]').forEach((b) => (b.onclick = close));
  dialogEl.onclick = (e) => {
    if (e.target === dialogEl) close();
  };

  select(1);
  dialogEl.classList.add("open");
}

import { icon } from "../shared/icons.js";

/**
 * A single shared popover-menu element reused for the language picker and the
 * "download all" options. Anchored under a trigger button and dismissed on any
 * outside pointer-down or Escape.
 */
let activeMenu = null;
let outsideHandler = null;
let keyHandler = null;

export function closeMenu() {
  if (!activeMenu) return;
  activeMenu.classList.remove("open");
  activeMenu.innerHTML = "";
  if (outsideHandler) document.removeEventListener("pointerdown", outsideHandler, true);
  if (keyHandler) document.removeEventListener("keydown", keyHandler, true);
  outsideHandler = keyHandler = activeMenu = null;
}

/**
 * @param {HTMLElement} menuEl  the shared `.menu` element
 * @param {HTMLElement} anchorEl trigger button
 * @param {Array<{icon?:string,label:string,active?:boolean,onClick?:Function}>} items
 * @param {{ title?: string }} [opts]
 */
export function openMenu(menuEl, anchorEl, items, opts = {}) {
  const reopening = activeMenu === menuEl;
  closeMenu();
  if (reopening) return; // toggle off when the same trigger is clicked again

  menuEl.innerHTML = "";
  if (opts.title) {
    const h = document.createElement("div");
    h.className = "menu-title";
    h.textContent = opts.title;
    menuEl.appendChild(h);
  }
  for (const it of items) {
    const b = document.createElement("button");
    b.className = "menu-item" + (it.active ? " active" : "");
    b.type = "button";
    const lead = it.icon ? icon(it.icon, { size: 15 }) : "";
    const trail = it.active ? icon("check", { size: 15, cls: "check" }) : "";
    b.innerHTML = `${lead}<span class="label"></span>${trail}`;
    b.querySelector(".label").textContent = it.label;
    b.onclick = () => {
      closeMenu();
      it.onClick && it.onClick();
    };
    menuEl.appendChild(b);
  }

  menuEl.classList.add("open");
  const a = anchorEl.getBoundingClientRect();
  const m = menuEl.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = Math.min(a.left, vw - m.width - 8);
  if (left < 8) left = 8;
  let top = a.bottom + 6;
  if (top + m.height > vh - 8) top = a.top - m.height - 6;
  if (top < 8) top = 8;
  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;

  activeMenu = menuEl;
  outsideHandler = (e) => {
    if (!menuEl.contains(e.target) && !anchorEl.contains(e.target)) closeMenu();
  };
  keyHandler = (e) => {
    if (e.key === "Escape") closeMenu();
  };
  setTimeout(() => {
    document.addEventListener("pointerdown", outsideHandler, true);
    document.addEventListener("keydown", keyHandler, true);
  }, 0);
}

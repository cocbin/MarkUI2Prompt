// Acme Console demo — a small, intentionally-imperfect settings screen used to
// exercise UI2Prompt loop mode and the tab-aware annotation fix. Plain vanilla
// JS so a coding agent can edit the source and see changes on reload.

(function () {
  const tabs = Array.from(document.querySelectorAll(".settings__tab"));
  const panes = Array.from(document.querySelectorAll(".settings__pane"));

  function activate(name) {
    tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === name));
    panes.forEach((pane) => pane.classList.toggle("is-active", pane.dataset.pane === name));
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => activate(tab.dataset.tab));
  });

  // Tiny bit of life so buttons feel real (no real backend in the demo).
  document.querySelectorAll(".btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (btn.type === "submit") e.preventDefault();
    });
  });
})();

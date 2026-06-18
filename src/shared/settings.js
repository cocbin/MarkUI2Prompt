/**
 * User preferences (theme + locale) persisted across extension surfaces.
 * Uses chrome.storage.local in the extension, falling back to localStorage for
 * the injected/page/harness contexts so the engine stays fully testable.
 */
const SETTINGS_KEY = "ui2prompt:settings";
export const DEFAULT_SETTINGS = { theme: "system", locale: "" };

function hasChromeStorage() {
  return (
    typeof chrome !== "undefined" && !!chrome.storage && !!chrome.storage.local
  );
}

export async function getSettings() {
  if (hasChromeStorage()) {
    try {
      const res = await chrome.storage.local.get(SETTINGS_KEY);
      return { ...DEFAULT_SETTINGS, ...(res[SETTINGS_KEY] || {}) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  } else {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* storage disabled */
    }
  }
  return next;
}

/** Subscribe to settings changes; returns an unsubscribe function. */
export function subscribeSettings(callback) {
  if (hasChromeStorage() && chrome.storage.onChanged) {
    const handler = (changes, area) => {
      if (area === "local" && changes[SETTINGS_KEY]) {
        callback({ ...DEFAULT_SETTINGS, ...(changes[SETTINGS_KEY].newValue || {}) });
      }
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
  const handler = (e) => {
    if (e.key === SETTINGS_KEY) {
      try {
        callback({ ...DEFAULT_SETTINGS, ...JSON.parse(e.newValue || "{}") });
      } catch {
        /* ignore */
      }
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", handler);
  return () => {
    if (typeof window !== "undefined") window.removeEventListener("storage", handler);
  };
}

/** Resolve a theme preference (`system` follows the OS) to `light` | `dark`. */
export function resolveTheme(theme) {
  if (theme === "light" || theme === "dark") return theme;
  try {
    return typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

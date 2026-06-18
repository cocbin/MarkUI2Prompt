import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";
import zhTW from "./locales/zh-TW.js";
import ja from "./locales/ja.js";
import ko from "./locales/ko.js";

/** Available locale dictionaries keyed by BCP-47-ish code. */
export const LOCALES = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ja,
  ko,
};

/** Human-readable, self-named labels for the language picker. */
export const LOCALE_NAMES = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  ko: "한국어",
};

const FALLBACK = "en";
let current = FALLBACK;

/** Map any browser/user preference onto a supported locale. */
export function resolveLocale(pref) {
  if (pref && LOCALES[pref]) return pref;
  const nav =
    typeof navigator !== "undefined" ? navigator.language || "en" : "en";
  if (LOCALES[nav]) return nav;
  const base = String(nav).toLowerCase();
  if (base.startsWith("zh")) {
    return base.includes("tw") || base.includes("hk") || base.includes("hant")
      ? "zh-TW"
      : "zh-CN";
  }
  const short = base.split("-")[0];
  const hit = Object.keys(LOCALES).find((l) => l.toLowerCase().startsWith(short));
  return hit || FALLBACK;
}

export function setLocale(locale) {
  current = LOCALES[locale] ? locale : resolveLocale(locale);
  return current;
}

export function getLocale() {
  return current;
}

/** Translate a key, interpolating `{name}` placeholders from `params`. */
export function t(key, params) {
  const dict = LOCALES[current] || LOCALES[FALLBACK];
  let value = dict[key];
  if (value == null) value = LOCALES[FALLBACK][key];
  if (value == null) return key;
  if (params) {
    for (const name of Object.keys(params)) {
      value = value.replace(new RegExp(`\\{${name}\\}`, "g"), String(params[name]));
    }
  }
  return value;
}

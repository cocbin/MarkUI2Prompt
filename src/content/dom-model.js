/**
 * Capture a four-layer description of an element (requirements item 5) so the
 * exported "full info" file gives a coding Agent everything it needs to locate
 * the element even when a selector is fragile:
 *   L1 Raw DOM           — tag, attributes, outerHTML
 *   L2 Semantic DOM      — button / input / link / text role + key props
 *   L3 Accessibility Tree — role / name / description
 *   L4 Visual Layout     — x / y / width / height / z-index
 */

const MAX_OUTER = 6000;
const MAX_TEXT = 400;

function clip(str, max) {
  const s = String(str == null ? "" : str);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function visibleText(el) {
  return clip((el.innerText || el.textContent || "").replace(/\s+/g, " ").trim(), MAX_TEXT);
}

/** All attributes as a plain {name: value} map (values clipped). */
function attributeMap(el) {
  const out = {};
  for (const attr of el.attributes || []) out[attr.name] = clip(attr.value, 200);
  return out;
}

// ---- Layer 2: semantic role of the element ------------------------------

const INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function semanticKind(el) {
  const tag = el.tagName.toLowerCase();
  if (tag === "button" || el.getAttribute("role") === "button") return "button";
  if (tag === "a" && el.hasAttribute("href")) return "link";
  if (INPUT_TAGS.has(el.tagName)) return tag === "select" ? "select" : "input";
  if (tag === "img" || el.getAttribute("role") === "img") return "image";
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "label") return "label";
  if (tag === "table") return "table";
  if (["ul", "ol", "li"].includes(tag)) return "list";
  if (visibleText(el)) return "text";
  return "container";
}

function semanticLayer(el) {
  const kind = semanticKind(el);
  const info = { kind, tag: el.tagName.toLowerCase() };
  const text = visibleText(el);
  if (text) info.text = text;
  if (INPUT_TAGS.has(el.tagName)) {
    if (el.type) info.type = el.type;
    if (el.name) info.name = el.name;
    if (el.placeholder) info.placeholder = el.placeholder;
    if (el.value != null && String(el.value) !== "") info.value = clip(el.value, 120);
  }
  if (el.tagName === "A" && el.getAttribute("href")) info.href = clip(el.getAttribute("href"), 200);
  if (el.tagName === "IMG") {
    if (el.getAttribute("alt") != null) info.alt = el.getAttribute("alt");
    if (el.currentSrc || el.src) info.src = clip(el.currentSrc || el.src, 200);
  }
  // A few key semantic descendants help when the element is a wrapper.
  const kids = [...el.querySelectorAll("button, a[href], input, textarea, select, [role='tab']")]
    .slice(0, 8)
    .map((k) => {
      const t = (k.innerText || k.value || k.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim();
      return `${k.tagName.toLowerCase()}${t ? `「${clip(t, 40)}」` : ""}`;
    });
  if (kids.length) info.descendants = kids;
  return info;
}

// ---- Layer 3: accessibility (role / name / description) -----------------

const IMPLICIT_ROLE = {
  A: "link",
  BUTTON: "button",
  INPUT: "textbox",
  TEXTAREA: "textbox",
  SELECT: "combobox",
  IMG: "img",
  H1: "heading",
  H2: "heading",
  H3: "heading",
  H4: "heading",
  H5: "heading",
  H6: "heading",
  NAV: "navigation",
  TABLE: "table",
  UL: "list",
  OL: "list",
  LI: "listitem",
};

function role(el) {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  if (el.tagName === "INPUT") {
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio";
    if (t === "button" || t === "submit" || t === "reset") return "button";
    if (t === "search") return "searchbox";
    return "textbox";
  }
  return IMPLICIT_ROLE[el.tagName] || "";
}

function accessibleName(el) {
  const label = el.getAttribute("aria-label");
  if (label) return clip(label, 200);
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const doc = el.ownerDocument || document;
    const txt = labelledby
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter(Boolean)
      .map((n) => (n.innerText || n.textContent || "").trim())
      .join(" ")
      .trim();
    if (txt) return clip(txt, 200);
  }
  if (el.id) {
    const doc = el.ownerDocument || document;
    let assoc = null;
    try {
      assoc = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    } catch {
      /* ignore */
    }
    if (assoc) return clip((assoc.innerText || assoc.textContent || "").trim(), 200);
  }
  const closestLabel = el.closest && el.closest("label");
  if (closestLabel) return clip((closestLabel.innerText || "").trim(), 200);
  if (el.tagName === "IMG" && el.getAttribute("alt") != null) return clip(el.getAttribute("alt"), 200);
  if (INPUT_TAGS.has(el.tagName) && el.getAttribute("placeholder")) {
    return clip(el.getAttribute("placeholder"), 200);
  }
  const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  if (text) return clip(text, 200);
  return clip(el.getAttribute("title") || "", 200);
}

function accessibleDescription(el) {
  const desc = el.getAttribute("aria-describedby");
  if (desc) {
    const doc = el.ownerDocument || document;
    const txt = desc
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter(Boolean)
      .map((n) => (n.innerText || n.textContent || "").trim())
      .join(" ")
      .trim();
    if (txt) return clip(txt, 200);
  }
  return clip(el.getAttribute("title") || "", 200);
}

// ---- Layer 4: visual layout ---------------------------------------------

function resolvedZIndex(el) {
  let node = el;
  let guard = 0;
  while (node && node.nodeType === 1 && guard < 30) {
    const cs = getComputedStyle(node);
    if (cs.position !== "static" && cs.zIndex !== "auto") return cs.zIndex;
    node = node.parentElement;
    guard += 1;
  }
  return "auto";
}

function layoutLayer(el) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    x: Math.round(r.left + window.scrollX),
    y: Math.round(r.top + window.scrollY),
    viewportX: Math.round(r.left),
    viewportY: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
    zIndex: cs.zIndex === "auto" ? resolvedZIndex(el) : cs.zIndex,
    position: cs.position,
    display: cs.display,
    visibility: cs.visibility,
  };
}

/** Build the full four-layer model for an element. */
export function captureLayers(el) {
  if (!el || el.nodeType !== 1) return null;
  return {
    raw: {
      tag: el.tagName.toLowerCase(),
      id: el.id || "",
      classes: [...(el.classList || [])],
      attributes: attributeMap(el),
      outerHTML: clip(el.outerHTML || "", MAX_OUTER),
    },
    semantic: semanticLayer(el),
    a11y: {
      role: role(el),
      name: accessibleName(el),
      description: accessibleDescription(el),
    },
    layout: layoutLayer(el),
  };
}

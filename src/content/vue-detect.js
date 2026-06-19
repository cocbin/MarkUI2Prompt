/**
 * Framework detection. MUST run in the page's MAIN world to read framework
 * expando properties (e.g. __vueParentComponent), which are invisible to an
 * isolated-world content script. Implements requirements §四.
 */

import { meaningfulClasses } from "./locator.js";

function fileToName(file) {
  if (!file) return "";
  const base = String(file).split(/[\\/]/).pop() || "";
  return base.replace(/\.(vue|jsx?|tsx?)$/i, "");
}

/** Shorten an absolute __file path to a repo-relative-ish hint. */
function shortFile(file) {
  if (!file) return "";
  const str = String(file).replace(/\\/g, "/");
  const srcIdx = str.lastIndexOf("/src/");
  if (srcIdx >= 0) return str.slice(srcIdx + 1);
  const parts = str.split("/");
  return parts.slice(-2).join("/");
}

function vue3Name(instance) {
  const type = instance.type || {};
  return (
    type.name ||
    type.__name ||
    fileToName(type.__file) ||
    instance.vnode?.type?.name ||
    "Anonymous"
  );
}

function detectVue3(startEl) {
  let node = startEl;
  let instance = null;
  while (node && node.nodeType === 1) {
    if (node.__vueParentComponent) {
      instance = node.__vueParentComponent;
      break;
    }
    if (node.__vue_app__) {
      instance = node.__vueParentComponent || null;
    }
    node = node.parentElement;
  }
  if (!instance) return null;

  const file = shortFile(instance.type && instance.type.__file);
  const names = [];
  let cur = instance;
  let guard = 0;
  while (cur && guard < 50) {
    names.unshift(vue3Name(cur));
    cur = cur.parent;
    guard++;
  }
  return {
    type: "vue",
    component: names[names.length - 1] || "Anonymous",
    file,
    vuePath: names.join(" / "),
    vnodePath: names.join(" > "),
  };
}

function detectVue2(startEl) {
  let node = startEl;
  let vm = null;
  while (node && node.nodeType === 1) {
    if (node.__vue__) {
      vm = node.__vue__;
      break;
    }
    node = node.parentElement;
  }
  if (!vm) return null;

  const nameOf = (v) =>
    v.$options?.name ||
    v.$options?._componentTag ||
    fileToName(v.$options?.__file) ||
    v.$vnode?.componentOptions?.tag ||
    "Anonymous";

  const file = shortFile(vm.$options && vm.$options.__file);
  const names = [];
  let cur = vm;
  let guard = 0;
  while (cur && guard < 50) {
    names.unshift(nameOf(cur));
    cur = cur.$parent;
    guard++;
  }
  return {
    type: "vue",
    component: names[names.length - 1] || "Anonymous",
    file,
    vuePath: names.join(" / "),
    vnodePath: names.join(" > "),
  };
}

function detectReact(startEl) {
  let node = startEl;
  while (node && node.nodeType === 1) {
    const key = Object.keys(node).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"),
    );
    if (key) {
      let fiber = node[key];
      const names = [];
      let guard = 0;
      while (fiber && guard < 60) {
        const t = fiber.type;
        if (typeof t === "function") {
          names.unshift(t.displayName || t.name || "Anonymous");
        } else if (t && typeof t === "object" && (t.displayName || t.render)) {
          names.unshift(t.displayName || "Component");
        }
        fiber = fiber.return;
        guard++;
      }
      return {
        type: "react",
        component: names[names.length - 1] || "",
        file: "",
        vuePath: "",
        vnodePath: names.join(" > "),
      };
    }
    node = node.parentElement;
  }
  return null;
}

/** Heuristic fallback using DOM attributes when no instance is reachable. */
function detectHeuristic(startEl) {
  let node = startEl;
  while (node && node.nodeType === 1) {
    for (const attr of node.getAttributeNames?.() || []) {
      if (attr.startsWith("data-v-")) {
        return { type: "vue", component: "", file: "", vuePath: "", vnodePath: "" };
      }
      if (attr.startsWith("data-reactroot")) {
        return { type: "react", component: "", file: "", vuePath: "", vnodePath: "" };
      }
    }
    node = node.parentElement;
  }
  return null;
}

/** Vue 3: the component name only when `el` is that component's root element. */
function vue3RootName(el) {
  const inst = el.__vueParentComponent;
  if (inst && inst.vnode && inst.vnode.el === el) return vue3Name(inst);
  return "";
}

/** Vue 2: a mounted component exposes its instance on its root element. */
function vue2RootName(el) {
  const vm = el.__vue__;
  if (!vm || !vm.$options) return "";
  return vm.$options.name || vm.$options._componentTag || fileToName(vm.$options.__file) || "";
}

/** An id worth showing in the stack (not obviously auto-generated). */
function isStableishId(id) {
  return !!id && typeof id === "string" && !/\s/.test(id) && id.length <= 50 && !/\d{5,}/.test(id);
}

/**
 * Describe one element for the DOM stack. Component roots become `<Name>`
 * (annotated with their id/class so the *usage site* is unambiguous); other
 * elements use `tag#id.class`. Anonymous wrappers (no name/id/class) collapse
 * away unless they are the annotated leaf itself.
 */
function domSegment(el, isLeaf) {
  let comp = vue3RootName(el) || vue2RootName(el);
  if (comp === "Anonymous") comp = ""; // no real name → fall back to id/class
  const id = isStableishId(el.id) ? `#${el.id}` : "";
  const classes = meaningfulClasses(el)
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join("");
  if (comp) return `<${comp}>${id || classes}`;
  if (id || classes) return `${el.tagName.toLowerCase()}${id}${classes}`;
  return isLeaf ? el.tagName.toLowerCase() : "";
}

/**
 * Walk every ancestor up to the app root, naming each by its Vue component
 * (when it is a component root) or its id/class. The same component used in
 * different places yields a different stack, which is the whole point: the
 * "location" must describe *which usage* of a component to edit, not just the
 * component file. Implements requirements §一.
 */
export function describeDomStack(el, { max = 40 } = {}) {
  if (!el || el.nodeType !== 1) return "";
  const segs = [];
  let node = el;
  let guard = 0;
  let isLeaf = true;
  while (
    node &&
    node.nodeType === 1 &&
    node !== document.body &&
    node !== document.documentElement &&
    guard < max
  ) {
    const seg = domSegment(node, isLeaf);
    if (seg) segs.unshift(seg);
    node = node.parentElement;
    guard += 1;
    isLeaf = false;
  }
  return segs.join(" > ");
}

/**
 * @returns {{type:string, component:string, file:string, vuePath:string, vnodePath:string, domStack:string}}
 */
export function detectFramework(el) {
  if (!el || el.nodeType !== 1) {
    return { type: "unknown", component: "", file: "", vuePath: "", vnodePath: "", domStack: "" };
  }
  const base = detectVue3(el) ||
    detectVue2(el) ||
    detectReact(el) ||
    detectHeuristic(el) || {
      type: "unknown",
      component: "",
      file: "",
      vuePath: "",
      vnodePath: "",
    };
  base.domStack = describeDomStack(el);
  return base;
}

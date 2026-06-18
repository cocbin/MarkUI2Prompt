/**
 * Framework detection. MUST run in the page's MAIN world to read framework
 * expando properties (e.g. __vueParentComponent), which are invisible to an
 * isolated-world content script. Implements requirements §四.
 */

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

/**
 * @returns {{type:string, component:string, file:string, vuePath:string, vnodePath:string}}
 */
export function detectFramework(el) {
  if (!el || el.nodeType !== 1) {
    return { type: "unknown", component: "", file: "", vuePath: "", vnodePath: "" };
  }
  return (
    detectVue3(el) ||
    detectVue2(el) ||
    detectReact(el) ||
    detectHeuristic(el) || {
      type: "unknown",
      component: "",
      file: "",
      vuePath: "",
      vnodePath: "",
    }
  );
}

import { detectFramework } from "./vue-detect.js";
import { BRIDGE } from "./bridge-protocol.js";

// Runs in the page's MAIN world so it can read framework expando properties.
window.addEventListener("message", (event) => {
  const data = event.data;
  if (
    event.source !== window ||
    !data ||
    data.source !== BRIDGE.SOURCE ||
    data.type !== BRIDGE.PROBE_REQUEST
  ) {
    return;
  }
  let info = { type: "unknown", component: "", file: "", vuePath: "", vnodePath: "", domStack: "" };
  try {
    const el = document.querySelector(`[${BRIDGE.TOKEN_ATTR}="${data.token}"]`);
    if (el) info = detectFramework(el);
  } catch {
    /* ignore */
  }
  window.postMessage(
    { source: BRIDGE.SOURCE, type: BRIDGE.PROBE_RESULT, token: data.token, info },
    "*",
  );
});

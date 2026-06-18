import { detectFramework } from "./vue-detect.js";
import { BRIDGE } from "./bridge-protocol.js";

let tokenSeq = 0;

function requestViaBridge(el, timeout) {
  return new Promise((resolve) => {
    const token = `t${Date.now()}_${tokenSeq++}`;
    let done = false;

    const finish = (value) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      try {
        el.removeAttribute(BRIDGE.TOKEN_ATTR);
      } catch {
        /* element detached */
      }
      resolve(value);
    };

    const onMessage = (event) => {
      const data = event.data;
      if (
        event.source === window &&
        data &&
        data.source === BRIDGE.SOURCE &&
        data.type === BRIDGE.PROBE_RESULT &&
        data.token === token
      ) {
        finish(data.info || null);
      }
    };

    window.addEventListener("message", onMessage);
    try {
      el.setAttribute(BRIDGE.TOKEN_ATTR, token);
    } catch {
      finish(null);
      return;
    }
    window.postMessage({ source: BRIDGE.SOURCE, type: BRIDGE.PROBE_REQUEST, token }, "*");
    setTimeout(() => finish(null), timeout);
  });
}

/**
 * Resolve framework info for an element. Tries a direct read first (works when
 * already in the main world, e.g. during injection tests); otherwise asks the
 * main-world helper over postMessage.
 */
export async function probeFramework(el, { timeout = 500 } = {}) {
  const direct = detectFramework(el);
  if (direct.type !== "unknown" && direct.component) return direct;

  const viaBridge = await requestViaBridge(el, timeout);
  if (viaBridge && (viaBridge.component || viaBridge.type !== "unknown")) {
    return viaBridge;
  }
  return direct.type !== "unknown" ? direct : viaBridge || direct;
}

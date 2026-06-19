import { t } from "../../shared/i18n.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MARGIN = 8;
const GAP = 10;

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(v, hi));
}

function overlaps(a, b) {
  return !(
    a.left + a.w <= b.left ||
    b.left + b.w <= a.left ||
    a.top + a.h <= b.top ||
    b.top + b.h <= a.top
  );
}

/**
 * Transient annotated-screenshot layer (requirements item 8 + revised item 3):
 * each numbered red label is placed close to its element, never piled in the
 * corner, with a red arrow connecting the two. Label backgrounds are translucent
 * (outlined red text) so the underlying UI stays visible. Lives in the overlay
 * shadow root so captureVisibleTab includes it.
 */
export class SnapshotLayer {
  constructor(layer) {
    this.root = document.createElement("div");
    this.root.className = "snap";
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("class", "snap-svg");
    this.svg.innerHTML =
      '<defs><marker id="ui2p-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>';
    this.root.appendChild(this.svg);
    layer.appendChild(this.root);
  }

  _reset() {
    [...this.root.querySelectorAll(".snap-chip, .snap-box")].forEach((n) => n.remove());
    [...this.svg.querySelectorAll("line, circle")].forEach((n) => n.remove());
  }

  /**
   * @param {Array<{index:number, note:string, el:Element|null}>} items
   * @returns {Promise<void>} resolves once laid out + painted.
   */
  async render(items) {
    this._reset();
    this.root.classList.add("visible");
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const entries = items.map((it) => {
      const chip = document.createElement("div");
      chip.className = "snap-chip";
      chip.innerHTML = `<span class="n">${it.index}</span><span class="tx"></span>`;
      chip.querySelector(".tx").textContent = it.note || t("item.noNote");
      this.root.appendChild(chip);
      const r = it.el && it.el.isConnected ? it.el.getBoundingClientRect() : null;
      return { chip, rect: r && (r.width || r.height) ? r : null };
    });

    await nextFrame(); // allow chips to measure

    // Every annotated box is a fixed obstacle so a label never lands on a box —
    // not on another element's box, and not inside its own (requirements §四).
    const boxes = entries
      .filter((e) => e.rect)
      .map((e) => ({ left: e.rect.left, top: e.rect.top, w: e.rect.width, h: e.rect.height }));
    entries.forEach((e) => e.rect && this._drawBox(e.rect));

    const placed = [];
    let corner = MARGIN; // stacking position for elements we cannot resolve

    for (const e of entries) {
      const w = e.chip.offsetWidth || 200;
      const h = e.chip.offsetHeight || 26;
      const obstacles = placed.concat(boxes);
      let box;
      if (e.rect) {
        box = this._place(e.rect, w, h, obstacles, vw, vh);
      } else {
        box = this._fit({ left: vw - w - MARGIN, top: corner, w, h }, vw, vh);
        this._resolve(box, obstacles, vw, vh);
        corner = box.top + h + 6;
      }
      placed.push(box);
      e.chip.style.left = `${box.left}px`;
      e.chip.style.top = `${box.top}px`;
      if (e.rect) this._drawArrow(box, e.rect, vw, vh);
    }

    await nextFrame();
    await nextFrame();
  }

  /** Candidate spots hugging the element on all four sides (outside the box). */
  _candidates(r, w, h) {
    const midY = r.top + r.height / 2 - h / 2;
    const midX = r.left + r.width / 2 - w / 2;
    return [
      { left: r.right + GAP, top: r.top },
      { left: r.right + GAP, top: midY },
      { left: r.left - GAP - w, top: r.top },
      { left: r.left - GAP - w, top: midY },
      { left: r.left, top: r.bottom + GAP },
      { left: midX, top: r.bottom + GAP },
      { left: r.left, top: r.top - GAP - h },
      { left: midX, top: r.top - GAP - h },
      { left: r.right + GAP, top: r.bottom + GAP },
      { left: r.left - GAP - w, top: r.bottom + GAP },
    ];
  }

  _inView(box, vw, vh) {
    return (
      box.left >= MARGIN &&
      box.top >= MARGIN &&
      box.left + box.w <= vw - MARGIN &&
      box.top + box.h <= vh - MARGIN
    );
  }

  /** Pick the first adjacent spot that is on-screen and clear of all obstacles. */
  _place(r, w, h, obstacles, vw, vh) {
    const cands = this._candidates(r, w, h);
    for (const c of cands) {
      const box = { left: c.left, top: c.top, w, h };
      if (this._inView(box, vw, vh) && !obstacles.some((o) => overlaps(box, o))) return box;
    }
    const box = this._fit({ left: cands[0].left, top: cands[0].top, w, h }, vw, vh);
    this._resolve(box, obstacles, vw, vh);
    return box;
  }

  _fit(box, vw, vh) {
    box.left = clamp(box.left, MARGIN, vw - box.w - MARGIN);
    box.top = clamp(box.top, MARGIN, vh - box.h - MARGIN);
    return box;
  }

  /** Greedily nudge the box until it clears every obstacle (chips + boxes). */
  _resolve(box, obstacles, vw, vh) {
    let tries = 0;
    while (obstacles.some((p) => overlaps(box, p)) && tries < 400) {
      box.top += 7;
      if (box.top + box.h > vh - MARGIN) {
        box.top = MARGIN;
        box.left += box.w + GAP;
        if (box.left + box.w > vw - MARGIN) box.left = MARGIN;
      }
      this._fit(box, vw, vh);
      tries += 1;
    }
    return box;
  }

  _drawBox(r) {
    const box = document.createElement("div");
    box.className = "snap-box";
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
    this.root.appendChild(box);
  }

  _drawArrow(box, rect, vw, vh) {
    const cx = box.left + box.w / 2;
    const cy = box.top + box.h / 2;
    const ex = clamp(rect.left + rect.width / 2, MARGIN, vw - MARGIN);
    const ey = clamp(rect.top + rect.height / 2, MARGIN, vh - MARGIN);
    const dx = ex - cx;
    const dy = ey - cy;

    let sx;
    let sy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      sx = dx > 0 ? box.left + box.w : box.left;
      sy = cy;
    } else {
      sy = dy > 0 ? box.top + box.h : box.top;
      sx = cx;
    }
    // Land on the element border nearest the chip rather than its dead centre.
    const tx = clamp(sx, rect.left, rect.right);
    const ty = clamp(sy, rect.top, rect.bottom);

    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(sx));
    line.setAttribute("y1", String(sy));
    line.setAttribute("x2", String(tx));
    line.setAttribute("y2", String(ty));
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("marker-end", "url(#ui2p-arrowhead)");

    const start = document.createElementNS(SVG_NS, "circle");
    start.setAttribute("cx", String(sx));
    start.setAttribute("cy", String(sy));
    start.setAttribute("r", "3");
    this.svg.append(line, start);
  }

  clear() {
    this.root.classList.remove("visible");
    this._reset();
  }
}

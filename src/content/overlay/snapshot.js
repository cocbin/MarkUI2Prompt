const SVG_NS = "http://www.w3.org/2000/svg";
const ARROW = "#6366f1";

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/**
 * Transient annotated-screenshot layer (requirements item 8): draws a numbered
 * legend down the right edge with arrows pointing at each annotated element, so
 * the captured image is a self-contained fallback for an AI that cannot resolve
 * a selector. Lives in the overlay shadow root so captureVisibleTab includes it.
 */
export class SnapshotLayer {
  constructor(layer) {
    this.root = document.createElement("div");
    this.root.className = "snap";
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("class", "snap-svg");
    this.svg.innerHTML = `<defs><marker id="ui2p-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${ARROW}"/></marker></defs>`;
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

    const chips = items.map((it) => {
      const chip = document.createElement("div");
      chip.className = "snap-chip";
      chip.innerHTML = `<span class="n">${it.index}</span><span class="tx"></span>`;
      chip.querySelector(".tx").textContent = it.note || "(无描述)";
      this.root.appendChild(chip);
      return { chip, item: it };
    });

    await nextFrame(); // let chips measure

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let y = 16;
    for (const { chip, item } of chips) {
      const h = chip.offsetHeight || 32;
      const w = chip.offsetWidth || 240;
      const left = vw - w - 16;
      const top = Math.min(y, vh - h - 8);
      chip.style.left = `${left}px`;
      chip.style.top = `${top}px`;
      y = top + h + 8;

      if (item.el && item.el.isConnected) {
        const r = item.el.getBoundingClientRect();
        if (r.width || r.height) {
          this._drawBox(r);
          this._drawArrow(left, top + h / 2, r);
        }
      }
    }

    await nextFrame();
    await nextFrame();
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

  _drawArrow(fromX, fromY, rect) {
    const cx = Math.max(8, Math.min(rect.left + rect.width / 2, window.innerWidth - 8));
    const cy = Math.max(8, Math.min(rect.top + rect.height / 2, window.innerHeight - 8));
    const tx = rect.right < fromX ? rect.right : cx; // aim at nearer edge
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(fromX - 4));
    line.setAttribute("y1", String(fromY));
    line.setAttribute("x2", String(tx));
    line.setAttribute("y2", String(cy));
    line.setAttribute("stroke", ARROW);
    line.setAttribute("stroke-width", "2.5");
    line.setAttribute("marker-end", "url(#ui2p-arrowhead)");
    const start = document.createElementNS(SVG_NS, "circle");
    start.setAttribute("cx", String(fromX - 4));
    start.setAttribute("cy", String(fromY));
    start.setAttribute("r", "3");
    start.setAttribute("fill", ARROW);
    this.svg.append(line, start);
  }

  clear() {
    this.root.classList.remove("visible");
    this._reset();
  }
}

// Embeddable pieces of Follow the Money. mycongress.vote (or anyone) drops them in without a rewrite:
//
//   <script type="module" src="https://<site>/components.js"></script>
//   <ftm-money-card member="C001035"></ftm-money-card>
//   <ftm-industry-chart member="C001035"></ftm-industry-chart>
//   <ftm-share-button member="C001035"></ftm-share-button>
//
// Attributes: member = bioguide id; site = where the data lives (defaults to this script's folder).
// The page can also set the .rep property directly with an already-loaded member summary.
// Colors and fonts follow the host page's CSS variables when it has them (--paper, --ink, --accent, ...).

const SCRIPT_BASE = new URL("./", import.meta.url).href;

export const fmt = {
  money(n, exact = false) {
    if (n == null || isNaN(n)) return "–";
    const a = Math.abs(n), s = n < 0 ? "-" : "";
    if (exact || a < 10_000) return s + "$" + Math.round(a).toLocaleString("en-US");
    if (a < 1_000_000) return s + "$" + (a / 1000).toFixed(a < 100_000 ? 1 : 0).replace(/\.0$/, "") + "K";
    if (a < 1_000_000_000) return s + "$" + (a / 1e6).toFixed(a < 10e6 ? 2 : 1).replace(/\.?0+$/, "") + "M";
    return s + "$" + (a / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
  },
  pct(x) {
    if (x == null || isNaN(x)) return "–";
    const p = x * 100;
    if (p > 0 && p < 1) return "<1%";
    if (p < 100 && p > 99) return ">99%";
    return Math.round(p) + "%";
  },
  cycle(c) { return `${c - 1}–${String(c).slice(2)}`; },
  title(r) { return r.chamber === "S" ? "Sen." : (r.district === 0 && ["AS", "DC", "GU", "MP", "PR", "VI"].includes(r.state) ? "Del." : "Rep."); },
  seat(r) { return `${fmt.title(r)} ${r.name} (${r.party}-${r.seat})`; },
};

// Receipts: links back to the FEC records behind a number (same formats as ftm/fec_links.py).
const FEC = "https://www.fec.gov";
const qs = o => Object.entries(o).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map(x => `${k}=${encodeURIComponent(x)}`)).join("&");
export const fecLinks = {
  employer: (r, employer) => `${FEC}/data/receipts/individual-contributions/?${qs({ committee_id: r.fec.committees.map(c => c.id), contributor_employer: employer, two_year_transaction_period: r.cycle })}`,
  pac: (r, pacId) => `${FEC}/data/disbursements/?${qs({ committee_id: pacId, recipient_committee_id: r.fec.committees.map(c => c.id), two_year_transaction_period: r.cycle })}`,
  outside: (r, spender) => `${FEC}/data/independent-expenditures/?${qs({ committee_id: spender, candidate_id: r.fec.candidate_ids, cycle: r.cycle, data_type: "efiling", is_notice: "true" })}`,
  entity(r, e) { return e.emp ? this.employer(r, e.emp) : e.pac_id ? this.pac(r, e.pac_id) : null; },
};

const cache = new Map();
export async function loadRep(id, site = SCRIPT_BASE) {
  const meta = await loadJSON(`${site}data/meta.json`);
  return loadJSON(`${site}data/${meta.cycle}/reps/${id}.json`);
}
export function loadJSON(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then(r => {
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return r.json();
    }).catch(e => { cache.delete(url); throw e; }));
  }
  return cache.get(url);
}
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const icon = (name, site = SCRIPT_BASE, cls = "ico") =>
  `<svg class="${cls}" aria-hidden="true"><use href="${site}icons.svg#${name}"></use></svg>`;

const BASE_CSS = `
  :host { display: block; color: var(--ink, #1a1916); font-family: var(--body, "Atkinson Hyperlegible", system-ui, sans-serif); }
  * { box-sizing: border-box; }
  .card { background: var(--card, #fffefa); border: 2px solid var(--line, #1a1916); border-radius: 16px;
          box-shadow: 4px 4px 0 var(--line, #1a1916); padding: 16px; }
  .ico { width: 1.15em; height: 1.15em; fill: currentColor; vertical-align: -0.2em; flex: none; }
  .muted { color: var(--ink-3, #6f6a61); }
  a { color: inherit; }
`;

class FtmElement extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }); }
  get site() { return this.getAttribute("site") || SCRIPT_BASE; }
  set rep(r) { this._rep = r; this.render(); }
  get rep() { return this._rep; }
  async connectedCallback() {
    if (this._rep) return this.render();
    const id = this.getAttribute("member");
    if (!id) return;
    try { this._rep = await loadRep(id, this.site); this.render(); }
    catch (e) { this.shadowRoot.innerHTML = `<p class="muted">Could not load the money data.</p>`; }
  }
}

// ---------------------------------------------------------------- the glance card (layer 1)
class MoneyCard extends FtmElement {
  render() {
    const r = this._rep;
    if (!r) return;
    const s = this.site, c = r.card, t = r.totals || {};
    const top = c.top_industries || [];
    const inds = top.length
      ? `<ol class="tops">${top.map(i => `<li><span class="e" aria-hidden="true">${i.emoji}</span>
           <span class="n">${esc(i.name)}</span><b>${fmt.money(i.total)}</b></li>`).join("")}</ol>`
      : `<p class="nodata">${icon("u-question", s)} Top industries coming soon: we've matched ${fmt.pct(r.coverage.classified_pct)}
           of this money to an industry and name the top ones at ${fmt.pct(r.coverage.threshold)}.</p>`;
    this.shadowRoot.innerHTML = `<style>${BASE_CSS}
      .top { display: flex; gap: 14px; align-items: center; }
      img { width: 76px; height: 92px; border-radius: 12px; border: 2px solid var(--line, #1a1916); object-fit: cover; background: var(--soft, #efe7d6); transform: rotate(-2deg); }
      h2 { font: 800 23px/1.1 var(--display, system-ui); margin: 0; letter-spacing: -0.02em; }
      .seat { font: 600 13px/1.3 var(--mono, monospace); color: var(--ink-3, #6f6a61); margin-top: 4px; }
      .big { margin: 16px 0 2px; font: 800 clamp(42px, 13vw, 58px)/1 var(--display, system-ui); letter-spacing: -0.03em; }
      .big small { display: block; font: 700 14px/1.4 var(--mono, monospace); letter-spacing: 0; color: var(--ink-2, #48443c); margin-top: 6px; }
      .tops { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 8px; }
      .tops li { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 2px solid var(--line, #1a1916); border-radius: 12px; background: var(--soft-2, #f6f0e3); }
      .tops li:first-child { background: var(--accent, #ffc93c); color: var(--accent-ink, #1a1916); transform: rotate(-1deg); }
      .tops .e { font-size: 22px; } .tops .n { flex: 1; font-weight: 700; } .tops b { font: 800 18px/1 var(--display, system-ui); }
      .nodata { margin: 14px 0 0; padding: 10px 12px; border: 1.5px dashed var(--ink-3, #6f6a61); border-radius: 12px; font-size: 14.5px; color: var(--ink-2, #48443c); }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
      .chip { display: inline-flex; gap: 6px; align-items: baseline; padding: 5px 11px; border: 1.5px solid var(--line, #1a1916); border-radius: 999px; font-size: 14px; background: var(--card, #fffefa); }
      .chip b { font: 800 16px/1 var(--display, system-ui); }
      .src { margin-top: 12px; font: 600 12px/1.4 var(--mono, monospace); color: var(--ink-3, #6f6a61); }
    </style>
    <div class="card">
      <div class="top"><img src="${s}${r.photo}" alt="" width="76" height="92" onerror="this.style.visibility='hidden'">
        <div><h2>${esc(r.name)}</h2><div class="seat">${fmt.title(r)} · ${r.party} · ${esc(r.seat)}</div></div></div>
      <div class="big">${fmt.money(t.receipts)}<small>raised in ${fmt.cycle(r.cycle)}${t.coverage_end ? ` · through ${t.coverage_end}` : ""}</small></div>
      ${inds}
      <div class="chips">
        <span class="chip"><b>${fmt.pct(c.small_donor_pct)}</b> from small donors</span>
        <span class="chip"><b>${fmt.pct(c.out_of_state_pct)}</b> from out of state</span>
      </div>
      <div class="src">Source: <a href="${esc(r.fec.url || "https://www.fec.gov/data/")}" rel="noopener">FEC filings</a></div>
    </div>`;
  }
}

// ---------------------------------------------------------------- the industry stack (layer 2)
class IndustryChart extends FtmElement {
  render() {
    const r = this._rep;
    if (!r) return;
    const s = this.site, limit = +(this.getAttribute("limit") || 8);
    const rows = r.industries.filter(i => !["retired", "not-employed", "unknown", "unclassified"].includes(i.slug)).slice(0, limit);
    const max = Math.max(1, ...rows.map(i => i.total));
    this.shadowRoot.innerHTML = `<style>${BASE_CSS}
      ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
      li { display: grid; grid-template-columns: 26px 1fr auto; gap: 4px 8px; align-items: center; }
      .n { font-weight: 700; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      b { font: 800 16px/1 var(--display, system-ui); }
      .bar { grid-column: 2 / -1; height: 10px; border-radius: 5px; background: var(--soft, #efe7d6); overflow: hidden; }
      .bar span { display: block; height: 100%; background: var(--money, #1f8a4c); }
      .bar span.pac { background: var(--accent, #ffc93c); }
      .key { margin-top: 12px; font: 600 12px/1.4 var(--mono, monospace); color: var(--ink-3, #6f6a61); display: flex; gap: 14px; }
      .key i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; vertical-align: -1px; margin-right: 5px; }
    </style>
    <ol>${rows.map(i => `<li>${icon("i-" + i.icon, s)}<span class="n">${esc(i.name)}</span><b>${fmt.money(i.total)}</b>
      <div class="bar" role="img" aria-label="${esc(i.name)}: ${fmt.money(i.indiv)} from employees and owners, ${fmt.money(i.pac)} from PACs">
        <span style="width:${(i.indiv / max * 100).toFixed(1)}%;float:left"></span><span class="pac" style="width:${(i.pac / max * 100).toFixed(1)}%;float:left"></span></div></li>`).join("")}</ol>
    <div class="key"><span><i style="background:var(--money,#1f8a4c)"></i>people who work there</span><span><i style="background:var(--accent,#ffc93c)"></i>their PACs</span></div>`;
  }
}

// ---------------------------------------------------------------- share image (9:16 story or 1:1 post)
export async function shareImage(r, site = SCRIPT_BASE, format = "post") {
  const W = 1080, H = format === "story" ? 1920 : 1080;
  const cv = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const g = cv.getContext("2d");
  const css = getComputedStyle(document.documentElement);
  const v = (name, d) => (css.getPropertyValue(name) || "").trim() || d;
  const ink = "#1a1916", paper = "#fbf6ec", accent = "#ffc93c", money = "#1f8a4c";
  const display = '"Bricolage Grotesque", system-ui, sans-serif', mono = '"IBM Plex Mono", monospace';
  try { await Promise.all([document.fonts.load(`800 80px ${display}`), document.fonts.load(`600 30px ${mono}`)]); } catch (e) { /* system fonts */ }
  g.fillStyle = paper; g.fillRect(0, 0, W, H);
  const pad = 70, cardY = format === "story" ? 300 : 70, cardH = format === "story" ? 1060 : 940;
  const round = (x, y, w, h, rad, fill, stroke = ink, sh = 12) => {
    g.fillStyle = stroke; g.beginPath(); g.roundRect(x + sh, y + sh, w, h, rad); g.fill();
    g.fillStyle = fill; g.beginPath(); g.roundRect(x, y, w, h, rad); g.fill();
    g.lineWidth = 6; g.strokeStyle = stroke; g.stroke();
  };
  if (format === "story") {
    g.fillStyle = ink; g.font = `800 64px ${display}`; g.fillText("Who funds", pad, 170);
    g.fillText(`${r.first || r.name}?`, pad, 240);
  }
  round(pad, cardY, W - pad * 2 - 12, cardH, 44, "#fffefa");
  const img = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = site + r.photo; });
  const x0 = pad + 50;
  let y = cardY + 60;
  if (img) {
    g.save(); g.beginPath(); g.roundRect(x0, y, 170, 208, 24); g.clip(); g.drawImage(img, x0, y, 170, 208); g.restore();
    g.lineWidth = 5; g.strokeStyle = ink; g.beginPath(); g.roundRect(x0, y, 170, 208, 24); g.stroke();
  }
  g.fillStyle = ink; g.font = `800 56px ${display}`;
  const nameX = x0 + 200;
  wrapText(g, r.name, nameX, y + 60, W - nameX - pad - 50, 60, 2);
  g.font = `600 30px ${mono}`; g.fillStyle = "#48443c";
  g.fillText(`${fmt.title(r)} · ${r.party} · ${r.seat}`, nameX, y + 190);
  y += 290;
  g.fillStyle = ink; g.font = `800 150px ${display}`;
  g.fillText(fmt.money(r.totals?.receipts), x0, y + 110);
  g.font = `600 32px ${mono}`; g.fillStyle = "#48443c";
  g.fillText(`raised in ${fmt.cycle(r.cycle)}`, x0, y + 165);
  y += 220;
  const top = r.card.top_industries || [];
  if (top.length) {
    for (const [n, i] of top.entries()) {
      const h = 88;
      round(x0, y, W - x0 * 2 - 12, h, 22, n === 0 ? accent : "#f6f0e3", ink, 6);
      g.fillStyle = ink; g.font = `48px system-ui`; g.fillText(i.emoji, x0 + 24, y + 62);
      g.font = `700 36px ${display}`; g.fillText(i.name.length > 26 ? i.name.slice(0, 25) + "…" : i.name, x0 + 100, y + 58);
      g.font = `800 40px ${display}`; g.textAlign = "right"; g.fillText(fmt.money(i.total), W - x0 - 40, y + 60); g.textAlign = "left";
      y += h + 22;
    }
  } else {
    g.font = `700 34px ${display}`; g.fillStyle = "#48443c";
    g.fillText("Industry mix: not enough data matched yet", x0, y + 40); y += 80;
  }
  g.font = `700 34px ${display}`; g.fillStyle = money;
  g.fillText(`${fmt.pct(r.card.small_donor_pct)} small donors · ${fmt.pct(r.card.out_of_state_pct)} out of state`, x0, Math.min(y + 30, cardY + cardH - 60));
  // stamp
  const stampY = cardY + cardH + 70;
  g.fillStyle = ink; g.font = `800 44px ${display}`; g.fillText("mycongress.vote", pad, stampY);
  g.font = `600 26px ${mono}`; g.fillStyle = "#48443c"; g.fillText("follow the money · source: FEC filings", pad, stampY + 44);
  return new Promise(res => cv.toBlob(res, "image/png"));
}

function wrapText(g, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(" ");
  let line = "", lines = 0;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y); y += lh; line = w;
      if (++lines >= maxLines - 1) { break; }
    } else line = test;
  }
  if (line) g.fillText(line, x, y);
}

class ShareButton extends FtmElement {
  render() {
    const r = this._rep;
    if (!r) return;
    this.shadowRoot.innerHTML = `<style>${BASE_CSS}
      .row { display: flex; gap: 8px; flex-wrap: wrap; }
      button { display: inline-flex; align-items: center; gap: 7px; min-height: 42px; padding: 0 15px; border: 2px solid var(--line, #1a1916);
        border-radius: 999px; background: var(--accent, #ffc93c); color: var(--accent-ink, #1a1916); box-shadow: 2px 2px 0 var(--line, #1a1916); font: 700 15px var(--body, system-ui); cursor: pointer; }
      button.alt { background: var(--card, #fffefa); color: var(--ink, #1a1916); }
      button:active { transform: translate(2px, 2px); box-shadow: none; }
    </style>
    <div class="row"><button data-f="post">${icon("u-share", this.site)} Share card</button><button class="alt" data-f="story">Story size</button></div>`;
    this.shadowRoot.querySelectorAll("button").forEach(b => b.addEventListener("click", () => this.share(b.dataset.f, b)));
  }
  async share(format, btn) {
    const r = this._rep;
    btn.disabled = true;
    try {
      const blob = await shareImage(r, this.site, format);
      const file = new File([blob], `who-funds-${r.last.toLowerCase().replace(/[^a-z]+/g, "-")}.png`, { type: "image/png" });
      const url = new URL(`rep/${r.bioguide}/`, this.site).href;
      const text = `Who funds ${r.name}? ${fmt.money(r.totals?.receipts)} raised in ${fmt.cycle(r.cycle)}.`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: text, text, url });
      } else {
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: file.name });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    } catch (e) { if (e.name !== "AbortError") console.warn(e); }
    finally { btn.disabled = false; }
  }
}

customElements.define("ftm-money-card", MoneyCard);
customElements.define("ftm-industry-chart", IndustryChart);
customElements.define("ftm-share-button", ShareButton);

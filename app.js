// Follow the Money: one static page per route (home, rep/<id>/, leaders/, play/, state/, about/), each rendered
// here from the pre-built JSON in data/. Three layers everywhere: a glance, a scroll, a deep dive on tap.
import { fmt, loadJSON, esc, icon, fecLinks } from "./components.js";

const SITE = new URL(document.baseURI).href;               // ends with "/"
const BASE_PATH = new URL(document.baseURI).pathname;
const main = document.getElementById("main");
const GAP = ["retired", "not-employed", "unknown", "unclassified"];
const MIX_COLORS = { small: "var(--money)", itemized: "#7fbf8f", pacs: "var(--accent)", party: "#9db7ff",
  "joint-fundraising": "#c8a2ff", "self-funding": "#ff9fb8", other: "var(--gap)" };
const HOW_TIP = {
  list: "On our reviewed list of companies and groups", sponsor: "Placed by the company or group behind the PAC",
  rule: "A written keyword or FEC committee-type rule", jobs: "Most of its donors work in one profession",
  AI: "Suggested by a local AI model (from the name, the donors' jobs, or a well-known organization)",
  giving: "85% or more of this PAC's own gifts go to one party", reviewed: "Checked by a person", open: "Not classified yet",
};
let META, TAX;

const $ = (sel, root = document) => root.querySelector(sel);
const html = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ""), "");
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const repLink = id => `rep/${id}/`;
const data = path => loadJSON(`${SITE}data/${path}`);
const cyc = path => data(`${META.cycle}/${path}`);
const partyBadge = p => `<span class="party ${p}" title="${{ D: "Democrat", R: "Republican", I: "Independent" }[p] || p}">${p}</span>`;
const photo = (r, cls = "photo sm") => `<img class="${cls}" src="${SITE}${r.photo}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
const seatText = r => `${r.chamber === "S" ? "Senate" : "House"} · ${r.seat}`;

async function boot() {
  try {
    [META, TAX] = await Promise.all([data("meta.json"), data("taxonomy.json")]);
  } catch (e) {
    main.innerHTML = `<p class="note">The data did not load. Try again in a minute.</p>`;
    return;
  }
  const built = META.generated_at ? new Date(META.generated_at) : null;
  $("#asof").textContent = built ? `Updated ${built.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "";
  if (META.parent?.url) $("#parent").href = META.parent.url;
  const route = location.pathname.startsWith(BASE_PATH) ? location.pathname.slice(BASE_PATH.length) : location.pathname.replace(/^\//, "");
  const [first, second] = route.split("/");
  const nav = { "": "home", rep: "home", leaders: "leaders", play: "play", state: "state" }[first];
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === nav));
  try {
    if (first === "rep" && second) await viewRep(second);
    else if (first === "leaders") await viewLeaders();
    else if (first === "play") await viewPlay();
    else if (first === "state") await viewState();
    else if (first === "about") await viewAbout();
    else if (first === "" || first === "index.html") await viewHome();
    else main.innerHTML = `<h1>Not found</h1><p><a href="./">Back to every member</a></p>`;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<p class="note">Something went wrong loading this page. <a href="./">Back to every member</a></p>`;
  }
}

// ======================================================================= home: find anyone
async function viewHome() {
  const reps = await cyc("reps.json");
  const today = new Date().toLocaleDateString("en-CA");
  main.innerHTML = html`
  <section class="hero">
    <h1>Who pays for <em>your</em> Congress?</h1>
    <p>Every member's campaign money, by industry, straight from FEC filings. Tap anyone to see who funds them.</p>
    <form class="zipform" action="state/" method="get">
      <label class="search">${icon("u-pin", SITE)}<input name="zip" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="Your ZIP code" aria-label="Your ZIP code" autocomplete="postal-code"></label>
      <button class="btn primary" type="submit">Find mine</button>
    </form>
  </section>
  <a class="card teaser" href="play/"><span class="t-ico" aria-hidden="true">🕵️</span>
    <span><b>Who Funded Them? <span class="mono muted">#${gameNumber(today)}</span></b>
    <span class="muted">One member a day. Guess their top industry in 3 tries.</span></span></a>
  <h2>Every member</h2>
  <p class="sub">${reps.length} members of the 119th Congress. Raised in ${fmt.cycle(META.cycle)}, from their campaigns' own reports.</p>
  <label class="search">${icon("u-search", SITE)}<input id="q" type="search" placeholder="Search a name or state (TX, Ohio…)" aria-label="Search members" autocomplete="off"></label>
  <div id="members"></div>`;
  const box = $("#members");
  const draw = q => {
    const s = q.trim().toLowerCase();
    const hit = r => !s || r.name.toLowerCase().includes(s) || r.state.toLowerCase() === s || (STATE_NAMES[r.state] || "").toLowerCase().startsWith(s) || r.seat.toLowerCase() === s;
    const groups = {};
    for (const r of reps.filter(hit)) (groups[r.state] ||= []).push(r);
    box.innerHTML = Object.keys(groups).sort((a, b) => (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b)).map(st => html`
      <div class="state-group"><h3>${esc(STATE_NAMES[st] || st)}</h3><div class="list two">
      ${groups[st].map(memberRow).join("")}</div></div>`).join("") || `<p class="muted">No member matches “${esc(q)}”.</p>`;
  };
  $("#q").addEventListener("input", e => draw(e.target.value));
  draw("");
}

function memberRow(r, extra = "") {
  return html`<a class="row" href="${repLink(r.id)}">${photo(r)}
    <span class="who"><b>${esc(r.name)}</b><small>${partyBadge(r.party)} ${seatText(r)}</small></span>
    <span class="amt">${fmt.money(r.receipts)}<small>${extra || "raised"}</small></span></a>`;
}

// ======================================================================= member page
async function viewRep(id) {
  const r = await cyc(`reps/${id}.json`);
  document.title = `Who funds ${r.name}? | ${META.site_name}`;
  const t = r.totals || {};
  main.innerHTML = html`
  <div class="rep-head"><ftm-money-card site="${SITE}"></ftm-money-card></div>
  <div style="margin-top:14px"><ftm-share-button site="${SITE}"></ftm-share-button></div>
  ${moneyMix(r)}
  ${industrySection(r)}
  ${outsideSection(r)}
  <section class="section" id="deep">
    <h2>Every employer and PAC</h2>
    <p class="sub">The full list behind the numbers above, sortable. Gifts are grouped by employer, never by person.</p>
    <button class="btn" id="dd-open">${icon("u-list", SITE)} Show the full table</button>
    <div id="dd"></div>
  </section>
  <section class="section">
    <h2>Receipts</h2>
    <p class="sub">Every number here comes from these FEC records:</p>
    <ul>
      <li><a href="${esc(r.fec.url)}" rel="noopener">${esc(r.name)} on fec.gov</a> (totals through ${esc(t.coverage_end || "the latest report")})</li>
      ${r.fec.committees.map(c => `<li>Campaign committee: <a href="https://www.fec.gov/data/committee/${c.id}/?cycle=${r.cycle}" rel="noopener">${esc(c.name || c.id)}</a></li>`).join("")}
    </ul>
    <p class="muted" style="font-size:14px">Industry figures cover itemized gifts the FEC has processed through ${esc(r.coverage.itemized_through || "–")}
      and PAC gifts reported through ${esc(r.coverage.pac_through || "–")}. Outside spending through ${esc(r.outside.through || "–")}.</p>
  </section>`;
  const card = $("ftm-money-card"), share = $("ftm-share-button");
  card.rep = r; share.rep = r;
  main.querySelectorAll(".ind-row").forEach(row => row.addEventListener("click", () => toggleIndustry(row, r)));
  main.querySelectorAll(".ind-row").forEach(row => row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleIndustry(row, r); } }));
  $("#dd-open").addEventListener("click", () => deepDive(r));
  const showInd = $("#show-ind");
  if (showInd) showInd.addEventListener("click", () => { $("#more-ind").hidden = false; showInd.remove(); });
  const more = $("#more-spenders");
  if (more) more.addEventListener("click", () => { main.querySelectorAll(".spender[hidden]").forEach(x => x.hidden = false); more.remove(); });
}

function moneyMix(r) {
  const t = r.totals;
  if (!t || !r.money_mix.length) return "";
  const total = r.money_mix.reduce((a, m) => a + m.amount, 0) || 1;
  const jfc = r.joint_fundraising.length
    ? `<p class="muted" style="font-size:14px;margin:10px 0 0">Joint fundraising committees that passed money on: ${r.joint_fundraising.slice(0, 4).map(j =>
        `<a href="https://www.fec.gov/data/committee/${j.id}/" rel="noopener">${esc(j.name)}</a> (${fmt.money(j.amount)})`).join(", ")}.</p>` : "";
  return html`<section class="section">
    <h2>Where the money came from</h2>
    <p class="sub">${fmt.money(t.receipts)} raised in ${fmt.cycle(r.cycle)}, by kind of giver.</p>
    <div class="bar" style="height:22px;border-width:2px" role="img" aria-label="Money by kind of giver">
      ${r.money_mix.map(m => `<span style="width:${(m.amount / total * 100).toFixed(2)}%;background:${MIX_COLORS[m.slug] || "var(--gap)"}"></span>`).join("")}</div>
    <div style="margin-top:8px">${r.money_mix.map(m => html`<div class="mix-row"><span class="lbl"><span class="swatch" style="background:${MIX_COLORS[m.slug] || "var(--gap)"}"></span>${esc(m.label)}</span>
      <span class="val">${fmt.money(m.amount)} <small class="muted mono">${fmt.pct(m.amount / total)}</small></span></div>`).join("")}</div>
    ${jfc}</section>`;
}

function industrySection(r) {
  const rows = r.industries.filter(i => !GAP.includes(i.slug));
  const gaps = r.industries.filter(i => GAP.includes(i.slug));
  const max = Math.max(1, ...rows.map(i => i.total));
  const c = r.coverage;
  const row = (i, dim) => html`<div class="ind-row${dim ? " dim" : ""}" role="button" tabindex="0" aria-expanded="false" data-slug="${i.slug}">
    <span class="lbl">${icon("i-" + i.icon, SITE)}<span class="nm">${esc(i.name)}</span>${icon("u-caret", SITE, "ico caret")}</span>
    <span class="val">${fmt.money(i.total)}</span>
    <div class="bar"><span style="width:${(i.indiv / max * 100).toFixed(1)}%;background:var(--money)"></span><span style="width:${(i.pac / max * 100).toFixed(1)}%;background:var(--accent)"></span></div>
  </div><div class="ind-detail" hidden data-detail="${i.slug}"></div>`;
  return html`<section class="section">
    <h2>By industry</h2>
    <p class="sub">Bigger gifts from people, grouped by where they work, plus PAC money by the company or group behind the PAC. Tap a line for the names.</p>
    <div class="muted mono" style="font-size:12.5px;display:flex;gap:14px;margin-bottom:6px"><span><span class="swatch" style="display:inline-block;background:var(--money);vertical-align:-2px"></span> people who work there</span><span><span class="swatch" style="display:inline-block;background:var(--accent);vertical-align:-2px"></span> their PACs</span></div>
    ${rows.slice(0, 10).map(i => row(i, false)).join("")}
    ${rows.length > 10 ? `<div id="more-ind" hidden>${rows.slice(10).map(i => row(i, false)).join("")}</div>
      <button class="btn" id="show-ind" style="margin:10px 0">Show all ${rows.length} industries</button>` : ""}
    <p class="muted mono" style="font-size:12.5px;margin:14px 0 0">Not an industry:</p>
    ${gaps.map(i => row(i, true)).join("")}
    <p class="note coverage">${c.classified_pct >= c.threshold ? icon("u-check", SITE) : icon("u-warning", SITE)}
      We matched <b>${fmt.pct(c.classified_pct)}</b> of the itemized money (not counting retirees) to an industry.
      ${c.classified_pct >= c.threshold ? "" : `The card waits for ${fmt.pct(c.threshold)} before naming top industries. `}
      The rest stays “Not classified yet” until a person or a reviewed rule places it: we never guess.</p>
  </section>`;
}

function toggleIndustry(row, r) {
  const slug = row.dataset.slug;
  const box = main.querySelector(`[data-detail="${slug}"]`);
  const open = row.getAttribute("aria-expanded") === "true";
  row.setAttribute("aria-expanded", String(!open));
  box.hidden = open;
  if (open || box.dataset.ready) return;
  const ind = r.industries.find(i => i.slug === slug);
  const meta = TAX.industries[slug] || {};
  const label = d => d.kind === "pac" ? (d.own ? esc(d.name) : `${esc(d.name)}'s PAC`) : d.kind === "both" ? `${esc(d.name)}: employees and PAC` : `Employees of ${esc(d.name)}`;
  box.innerHTML = html`<p class="muted" style="margin:0;font-size:14px">${esc(meta.blurb || "")} ${ind.donors ? `${ind.donors.toLocaleString()} donors.` : ""}</p>
    ${(ind.top || []).map(d => html`<div class="donor"><span><b>${label(d)}</b>
      <small>${d.indiv ? fmt.money(d.indiv) + " from people who work there" : ""}${d.indiv && d.pac ? " · " : ""}${d.pac ? fmt.money(d.pac) + " from the PAC" : ""}</small>
      ${fecLinks.entity(r, d) ? `<br><a class="receipt" href="${esc(fecLinks.entity(r, d))}" rel="noopener">${icon("u-receipt", SITE)} FEC record</a>` : ""}</span>
      <span class="amt">${fmt.money(d.total)}</span></div>`).join("")}
    ${ind.other_employers ? `<div class="donor"><span><b>${ind.other_employers.count.toLocaleString()} other employers</b><small>one donor each, not listed by name</small></span><span class="amt">${fmt.money(ind.other_employers.total)}</span></div>` : ""}`;
  box.dataset.ready = "1";
}

function outsideSection(r) {
  const o = r.outside;
  if (!o.spenders.length) return html`<section class="section"><h2>Outside money</h2>
    <p class="sub">No super PAC or group has reported spending for or against ${esc(r.name)} this cycle.</p></section>`;
  const sp = o.spenders.map((s, n) => html`<div class="spender"${n >= 8 ? " hidden" : ""}><span><b>${esc(s.name)}</b><br>
      <span class="t">${esc(s.type)}</span> ${s.donors_hidden ? `<span class="hidden-donors">${icon("u-eye-slash", SITE)} donors hidden</span>` : ""}
      <a class="receipt" href="${esc(fecLinks.outside(r, s.id))}" rel="noopener">${icon("u-receipt", SITE)} FEC</a></span>
      <span style="text-align:right">${s.support ? `<span class="amt-for">${fmt.money(s.support)} for</span><br>` : ""}${s.oppose ? `<span class="amt-against">${fmt.money(s.oppose)} against</span>` : ""}</span></div>`).join("");
  return html`<section class="section">
    <h2>Outside money</h2>
    <p class="sub">Super PACs and groups spending on ads to help or hurt ${esc(r.name)}. They can't coordinate with the campaign.</p>
    <div class="vs"><div class="side for"><span>For</span><b>${fmt.money(o.support)}</b></div><div class="side against"><span>Against</span><b>${fmt.money(o.oppose)}</b></div></div>
    <div style="margin-top:8px">${sp}</div>
    ${o.spenders.length > 8 ? `<button class="btn" id="more-spenders" style="margin-top:10px">Show all ${o.spenders.length}</button>` : ""}
    <p class="muted" style="font-size:13.5px">From FEC independent-expenditure reports and the 24/48-hour notices filed since. Groups marked
      “donors hidden” file as non-committees and don't have to say who funds them. Ads that are booked but not yet aired or reported are not here yet.</p>
  </section>`;
}

async function deepDive(r) {
  const box = $("#dd");
  $("#dd-open").remove();
  box.innerHTML = `<p class="loading">Loading…</p>`;
  const d = await cyc(`donors/${r.bioguide}.json`);
  const ents = d.entities;
  const inds = [...new Set(ents.map(e => e.industry))].sort((a, b) => (TAX.industries[a]?.name || a).localeCompare(TAX.industries[b]?.name || b));
  box.innerHTML = html`<div class="dd-tools">
      <label class="search">${icon("u-search", SITE)}<input id="dd-q" type="search" placeholder="Filter by name" aria-label="Filter by name"></label>
      <select class="pick" id="dd-ind" aria-label="Industry"><option value="">All industries</option>${inds.map(s => `<option value="${s}">${esc(TAX.industries[s]?.name || s)}</option>`).join("")}</select>
      <select class="pick" id="dd-kind" aria-label="Type"><option value="">Employees and PACs</option><option value="employees">Employees only</option><option value="pac">PACs only</option></select>
    </div>
    <div class="table-wrap"><table class="dd"><thead><tr>
      <th data-k="name">Employer or PAC</th><th data-k="industry">Industry</th><th data-k="how" title="How we placed it">How</th><th data-k="indiv" class="num">People</th><th data-k="pac" class="num">PAC</th><th data-k="total" class="num" aria-sort="descending">Total</th>
    </tr></thead><tbody></tbody></table></div>
    <p class="muted" style="font-size:13px">${ents.length.toLocaleString()} employers and PACs. People are counted by employer and never listed by name; employers with a single donor are folded into “other employers” above.<br>How: <b>list</b> = our reviewed list of companies · <b>sponsor</b> = the company or group behind the PAC · <b>rule</b> = a written keyword or FEC-type rule · <b>jobs</b> = what its donors do · <b>AI</b> = a local AI model, from the name, the donors' jobs or a well-known organization · <b>giving</b> = where the PAC's own money goes · <b>reviewed</b> = checked by a person.</p>`;
  let sortKey = "total", dir = -1;
  const draw = () => {
    const q = $("#dd-q").value.trim().toLowerCase(), ind = $("#dd-ind").value, kind = $("#dd-kind").value;
    let rows = ents.filter(e => (!q || e.name.toLowerCase().includes(q)) && (!ind || e.industry === ind) &&
      (!kind || (kind === "pac" ? e.pac > 0 : e.indiv > 0)));
    rows.sort((a, b) => {
      const x = sortKey === "industry" ? (TAX.industries[a.industry]?.name || "") : a[sortKey];
      const y = sortKey === "industry" ? (TAX.industries[b.industry]?.name || "") : b[sortKey];
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * dir;
    });
    $("tbody", box).innerHTML = rows.slice(0, 400).map(e => html`<tr>
      <td>${fecLinks.entity(r, e) ? `<a href="${esc(fecLinks.entity(r, e))}" rel="noopener">${esc(e.name)}</a>` : esc(e.name)}${e.donors > 1 ? ` <span class="muted mono" style="font-size:12px">${e.donors} donors</span>` : ""}</td>
      <td>${esc(TAX.industries[e.industry]?.name || e.industry)}</td><td><span class="how" title="${esc(HOW_TIP[e.how] || "")}">${esc(e.how || "")}</span></td><td class="num">${e.indiv ? fmt.money(e.indiv, true) : "–"}</td>
      <td class="num">${e.pac ? fmt.money(e.pac, true) : "–"}</td><td class="num"><b>${fmt.money(e.total, true)}</b></td></tr>`).join("")
      + (rows.length > 400 ? `<tr><td colspan="6" class="muted">…and ${rows.length - 400} more. Narrow the filter to see them.</td></tr>` : "");
  };
  box.querySelectorAll("th").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.k;
    dir = sortKey === k ? -dir : (k === "name" || k === "industry" ? 1 : -1);
    sortKey = k;
    box.querySelectorAll("th").forEach(x => x.removeAttribute("aria-sort"));
    th.setAttribute("aria-sort", dir > 0 ? "ascending" : "descending");
    draw();
  }));
  ["dd-q", "dd-ind", "dd-kind"].forEach(i => $("#" + i).addEventListener("input", draw));
  draw();
}

// ======================================================================= leaderboards
const BOARDS = [
  ["raised", "Most raised"], ["industry", "By industry"], ["small", "Small donors"], ["out", "Out-of-state money"],
  ["outside", "Outside spending"], ["spenders", "Biggest outside spenders"],
];
async function viewLeaders() {
  const reps = await cyc("reps.json");
  const p = new URLSearchParams(location.search);
  let board = p.get("b") || "raised";
  const states = [...new Set(reps.map(r => r.state))].sort((a, b) => (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b));
  const headline = Object.entries(TAX.industries).filter(([s]) => !GAP.includes(s) && !["party", "leadership-pacs", "candidate-committees", "joint-fundraising", "self-funding"].includes(s))
    .sort((a, b) => a[1].name.localeCompare(b[1].name));
  main.innerHTML = html`<h1 style="margin:22px 0 4px">Leaderboards</h1>
    <p class="sub muted">Same rules for every member. Both parties on every board.</p>
    <div class="boards" role="tablist">${BOARDS.map(([k, l]) => `<button role="tab" data-b="${k}" class="${k === board ? "on" : ""}">${l}</button>`).join("")}</div>
    <div class="filters">
      <select class="pick" id="f-ind" aria-label="Industry">${headline.map(([s, i]) => `<option value="${s}">${esc(i.name)}</option>`).join("")}</select>
      <select class="pick" id="f-ch" aria-label="Chamber"><option value="">Both chambers</option><option value="S">Senate</option><option value="H">House</option></select>
      <select class="pick" id="f-p" aria-label="Party"><option value="">All parties</option><option value="D">Democrats</option><option value="R">Republicans</option><option value="I">Independents</option></select>
      <select class="pick" id="f-st" aria-label="State"><option value="">All states</option>${states.map(s => `<option value="${s}">${esc(STATE_NAMES[s] || s)}</option>`).join("")}</select>
    </div>
    <div id="board"></div>`;
  $("#f-ind").value = p.get("ind") || "oil-gas";
  ["ch", "p", "st"].forEach(k => { if (p.get(k)) $("#f-" + k).value = p.get(k); });
  const draw = async () => {
    const ind = $("#f-ind").value, ch = $("#f-ch").value, party = $("#f-p").value, st = $("#f-st").value;
    $("#f-ind").hidden = board !== "industry";
    const q = new URLSearchParams({ b: board });
    if (board === "industry") q.set("ind", ind);
    if (ch) q.set("ch", ch); if (party) q.set("p", party); if (st) q.set("st", st);
    history.replaceState(null, "", location.pathname + "?" + q);
    const pool = reps.filter(r => (!ch || r.chamber === ch) && (!party || r.party === party) && (!st || r.state === st));
    const out = $("#board");
    if (board === "spenders") {
      const sp = await cyc("outside.json");
      out.innerHTML = `<div class="list">${sp.slice(0, 50).map((s, n) => html`<div class="row"><span class="rank">${n + 1}</span>
        <span class="who"><b>${esc(s.name)}</b><small>${esc(s.type)} · ${s.races} race${s.races > 1 ? "s" : ""}${s.donors_hidden ? ` · <span class="hidden-donors">donors hidden</span>` : ""}</small></span>
        <span class="amt">${fmt.money(s.support + s.oppose)}<small>${s.oppose > s.support ? "mostly against" : "mostly for"}</small></span></div>`).join("")}</div>`;
      return;
    }
    const val = {
      raised: r => r.receipts, industry: r => r.ind[ind] || 0, small: r => r.small, out: r => r.out, outside: r => r.for + r.against,
    }[board];
    const show = {
      raised: r => [fmt.money(r.receipts), "raised"], industry: r => [fmt.money(r.ind[ind] || 0), TAX.industries[ind]?.name || ""],
      small: r => [fmt.pct(r.small), "from small donors"], out: r => [fmt.pct(r.out), "from out of state"],
      outside: r => [fmt.money(r.for + r.against), `${fmt.money(r.for)} for · ${fmt.money(r.against)} against`],
    }[board];
    const ranked = pool.filter(r => val(r) != null && val(r) > 0 && (board !== "small" && board !== "out" || (r.receipts || 0) > 100000))
      .sort((a, b) => val(b) - val(a)).slice(0, 50);
    out.innerHTML = ranked.length ? `<div class="list">${ranked.map((r, n) => {
      const [a, s] = show(r);
      return html`<a class="row" href="${repLink(r.id)}"><span class="rank">${n + 1}</span>${photo(r)}
        <span class="who"><b>${esc(r.name)}</b><small>${partyBadge(r.party)} ${seatText(r)}</small></span>
        <span class="amt">${a}<small>${esc(s)}</small></span></a>`;
    }).join("")}</div>` : `<p class="muted">Nobody matches these filters.</p>`;
    if (board === "small" || board === "out") out.insertAdjacentHTML("beforeend", `<p class="muted" style="font-size:13px">Members who raised more than $100K. Out-of-state share counts itemized gifts (over $200) with an address.</p>`);
  };
  main.querySelectorAll(".boards button").forEach(b => b.addEventListener("click", () => {
    board = b.dataset.b;
    main.querySelectorAll(".boards button").forEach(x => x.classList.toggle("on", x === b));
    draw();
  }));
  main.querySelectorAll(".filters select").forEach(s => s.addEventListener("change", draw));
  draw();
}

// ======================================================================= daily game
function gameNumber(day) {
  const epoch = Date.UTC(2026, 9, 19);
  const [y, m, d] = day.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - epoch) / 86400000) + 1;
}
async function viewPlay() {
  const today = new Date().toLocaleDateString("en-CA");
  const days = (META.game_days || []).filter(d => d <= today);
  const day = days.includes(today) ? today : days[days.length - 1];
  if (!day) { main.innerHTML = `<p class="note">The first game starts soon. Come back tomorrow!</p>`; return; }
  const g = await data(`game/${day}.json`);
  const key = `ftm_game_${day}`;
  const state = store.get(key, { guesses: [], done: false, won: false });
  const render = () => {
    const wrong = state.guesses.filter(s => s !== g.answer).length;
    const finished = state.done;
    main.innerHTML = html`<div class="game">
      <p class="mono muted" style="margin:18px 0 0">Who Funded Them? #${g.number}${day !== today ? " (yesterday's)" : ""}</p>
      <div class="who">${photo(g.rep, "photo")}<h1>${esc(g.rep.name)}</h1>
        <div class="muted">${partyBadge(g.rep.party)} ${g.rep.chamber === "S" ? "Senator" : "Representative"} · ${esc(g.rep.seat)}</div></div>
      <p style="font-size:19px;font-weight:700;margin:18px 0 0">${finished ? (state.won ? "You got it!" : "Out of tries.") : "Which industry gave them the most money?"}</p>
      <div class="tries" aria-label="Tries">${[0, 1, 2].map(n => n < state.guesses.length ? (state.guesses[n] === g.answer ? "🟩" : "🟥") : "⬜").join("")}</div>
      <div class="options">${g.options.map(o => {
        const tried = state.guesses.includes(o.slug), right = o.slug === g.answer;
        const cls = tried ? (right ? "right" : "wrong") : (finished && right ? "right" : "");
        return `<button class="opt ${cls}" data-s="${o.slug}" ${finished || tried ? "disabled" : ""}><span class="e" aria-hidden="true">${o.emoji}</span>${esc(o.name)}</button>`;
      }).join("")}</div>
      ${!finished && wrong ? `<p class="note hint">💡 ${esc(g.hints[Math.min(wrong, g.hints.length) - 1])}</p>` : ""}
      ${finished ? html`<div class="card" style="text-align:left">
        <b>Their top industries this cycle</b>
        <ol style="margin:8px 0 0;padding-left:22px">${g.top3.map(i => `<li>${i.emoji} ${esc(i.name)}: <b>${fmt.money(i.total)}</b></li>`).join("")}</ol>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
          <button class="btn primary" id="g-share">${icon("u-share", SITE)} Share result</button>
          <a class="btn" href="${repLink(g.rep.bioguide)}">See all their money</a></div>
        <p class="muted" style="font-size:13px;margin:12px 0 0">Streak: ${store.get("ftm_streak", { count: 0 }).count} day(s). A new member every day.</p>
      </div>` : ""}
    </div>`;
    main.querySelectorAll(".opt:not([disabled])").forEach(b => b.addEventListener("click", () => {
      state.guesses.push(b.dataset.s);
      if (b.dataset.s === g.answer) { state.done = true; state.won = true; }
      else if (state.guesses.length >= 3) state.done = true;
      if (state.done) bumpStreak(day, state.won);
      store.set(key, state);
      render();
    }));
    const sh = $("#g-share");
    if (sh) sh.addEventListener("click", async () => {
      const grid = state.guesses.map(s => s === g.answer ? "🟩" : "🟥").join("");
      const text = `Who Funded Them? #${g.number} ${state.won ? state.guesses.length : "X"}/3\n${grid}\n${new URL("play/", SITE).href}`;
      try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); sh.textContent = "Copied!"; } }
      catch (e) { /* closed */ }
    });
  };
  render();
}
function bumpStreak(day, won) {
  const s = store.get("ftm_streak", { last: null, count: 0 });
  const prev = new Date(day + "T12:00:00"); prev.setDate(prev.getDate() - 1);
  s.count = won ? (s.last === prev.toLocaleDateString("en-CA") ? s.count + 1 : 1) : 0;
  s.last = day;
  store.set("ftm_streak", s);
}

// ======================================================================= your state + compare
async function viewState() {
  const reps = await cyc("reps.json");
  const p = new URLSearchParams(location.search);
  const zip = (p.get("zip") || store.get("ftm_zip", "") || "").replace(/\D/g, "").slice(0, 5);
  main.innerHTML = html`<h1 style="margin:22px 0 4px">Your delegation</h1>
    <p class="sub muted">Your two senators and your House member, side by side.</p>
    <form class="zipform" id="zf"><label class="search">${icon("u-pin", SITE)}<input id="zip" inputmode="numeric" maxlength="5" placeholder="ZIP code" aria-label="ZIP code" value="${esc(zip)}"></label>
      <button class="btn primary" type="submit">Show</button></form>
    <div id="mine" style="margin-top:16px"></div>
    <h2>Compare any two</h2>
    <div class="filters"><select class="pick" id="c1" aria-label="First member"></select><select class="pick" id="c2" aria-label="Second member"></select></div>
    <div id="cmp"></div>`;
  const opts = reps.slice().sort((a, b) => a.last.localeCompare(b.last)).map(r => `<option value="${r.id}">${esc(r.name)} (${r.party}-${esc(r.seat)})</option>`).join("");
  $("#c1").innerHTML = `<option value="">Pick a member</option>` + opts;
  $("#c2").innerHTML = `<option value="">Pick a member</option>` + opts;
  const show = async z => {
    const box = $("#mine");
    if (!/^\d{5}$/.test(z)) { box.innerHTML = ""; return; }
    store.set("ftm_zip", z);
    const zips = await loadJSON(`${SITE}zip-cd119.json`);
    const hit = zips[z];
    if (!hit) { box.innerHTML = `<p class="note">We don't know ZIP ${esc(z)}. Try a nearby one.</p>`; return; }
    const districts = Array.isArray(hit) ? hit : [hit];
    const st = districts[0].split("-")[0];
    const sens = reps.filter(r => r.state === st && r.chamber === "S");
    const house = reps.filter(r => r.chamber === "H" && districts.includes(`${r.state}-${r.district || 0}`));
    box.innerHTML = html`<div class="pair">${[...sens, ...house].map(r => `<ftm-money-card site="${SITE}" member="${r.id}"></ftm-money-card>`).join("")}</div>
      ${districts.length > 1 ? `<p class="note">ZIP ${esc(z)} crosses ${districts.length} House districts, so all of them are shown.</p>` : ""}
      <p style="margin-top:12px">${[...sens, ...house].map(r => `<a class="btn" style="margin:0 6px 6px 0" href="${repLink(r.id)}">${esc(r.last)}: full page</a>`).join("")}</p>`;
    if (sens[0] && sens[1]) { $("#c1").value = sens[0].id; $("#c2").value = (house[0] || sens[1]).id; compare(reps); }
  };
  $("#zf").addEventListener("submit", e => { e.preventDefault(); const z = $("#zip").value.trim(); history.replaceState(null, "", location.pathname + "?zip=" + z); show(z); });
  ["c1", "c2"].forEach(id => $("#" + id).addEventListener("change", () => compare(reps)));
  show(zip);
}
async function compare(reps) {
  const a = $("#c1").value, b = $("#c2").value, box = $("#cmp");
  if (!a || !b) { box.innerHTML = ""; return; }
  const [x, y] = await Promise.all([cyc(`reps/${a}.json`), cyc(`reps/${b}.json`)]);
  const topOf = r => r.card.top_industries.length ? r.card.top_industries.map(i => `${i.emoji} ${esc(i.name)}`).join("<br>") : `<span class="muted">not enough data yet</span>`;
  const line = (label, f) => `<tr><td>${label}</td><td>${f(x)}</td><td>${f(y)}</td></tr>`;
  box.innerHTML = html`<div class="card cmp"><table>
    <tr><th></th><th><a href="${repLink(x.bioguide)}">${esc(x.last)}</a> ${partyBadge(x.party)}</th><th><a href="${repLink(y.bioguide)}">${esc(y.last)}</a> ${partyBadge(y.party)}</th></tr>
    ${line("Raised", r => fmt.money(r.totals?.receipts))}
    ${line("Small donors", r => fmt.pct(r.card.small_donor_pct))}
    ${line("Out of state", r => fmt.pct(r.card.out_of_state_pct))}
    ${line("From PACs", r => fmt.pct(r.card.pac_pct))}
    ${line("Top industries", topOf)}
    ${line("Outside money for", r => `<span class="amt-for">${fmt.money(r.outside.support)}</span>`)}
    ${line("Outside money against", r => `<span class="amt-against">${fmt.money(r.outside.oppose)}</span>`)}
  </table></div>`;
}

// ======================================================================= how we count
async function viewAbout() {
  const src = META.sources || {};
  const when = k => src[k]?.last_modified ? new Date(src[k].last_modified).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–";
  main.innerHTML = html`<article class="prose">
    <h1 style="margin:22px 0 8px">How we count</h1>
    <p>Follow the Money shows who pays for each member of Congress, using only public Federal Election Commission (FEC) filings. The same pipeline, rules and thresholds apply to every member and both parties, with no exceptions.</p>
    <h2>Where the numbers come from</h2>
    <ul>
      <li><b>Totals</b> (raised, small donors, PACs, party, transfers): the FEC candidate summary, i.e. each campaign's own reports. Updated ${when("summary")}.</li>
      <li><b>Industries</b>: itemized gifts (over $200) the FEC has processed, by the donor's employer (updated ${when("indiv")}), plus PAC gifts as reported by the PACs (updated ${when("pas2")}). The FEC needs a few weeks to process each report, so this part runs a little behind the totals; every page says how far it goes.</li>
      <li><b>Outside money</b>: independent expenditures for or against a member, from processed reports plus the 24/48-hour notices filed since (updated ${when("ie")}).</li>
      <li><b>Members</b>: the congress-legislators project (public domain); portraits are official, public-domain photos.</li>
    </ul>
    <h2>How money gets an industry</h2>
    <ol>
      <li>Retired, not employed and “information requested” donors get their own slices and never an industry.</li>
      <li>A reviewed list of companies and groups (and every PAC's sponsoring company or union).</li>
      <li>Plain keyword rules on the employer's name (“bank”, “hospital”, “law firm”), each one written down and versioned.</li>
      <li>For self-employed donors, or a firm whose donors are almost all one profession: the occupation (“attorney”, “physician”).</li>
      <li>A local AI model suggests industries for the long tail. It has to say what each answer rests on (the name, the donors' jobs, or a well-known organization); guesses are thrown away, and unsure or big-dollar answers wait for a person.</li>
      <li>A political committee with no sponsor and no named cause, that gives at least 85% of its money to one party's candidates, is listed with that party's groups (“Republican & Conservative” or “Democratic & Liberal”).</li>
      <li>Anything left stays <b>Not classified yet</b>. We never guess.</li>
    </ol>
    <p>A member's card only names top industries once at least ${fmt.pct(META.coverage_min)} of their itemized money (not counting retirees) is matched. ${META.with_headline} of ${META.members} members are there today.</p>
    <h2>Fair-play rules</h2>
    <ul>
      <li>Money from people who work at a company is shown as “employees of” that company. It is not the company's money.</li>
      <li>We show facts and link the filings. We never say a vote was bought.</li>
      <li>Small donors are counted, never listed by name. Individual donor lists are never exported (FEC rules forbid using them to solicit or sell).</li>
      <li>Every number links to the FEC record it came from.</li>
    </ul>
    <h2>Corrections</h2>
    <p>Spotted something wrong? Every reclassification is logged, and fixes show up on the next nightly update. Tell us through <a href="${esc(META.parent?.url || "https://mycongress.vote/")}">mycongress.vote</a>.</p>
    <p class="muted" style="font-size:14px">Data built ${esc(META.generated_at || "")}. Industry list version ${META.taxonomy_version}.</p>
  </article>`;
}

const STATE_NAMES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia", PR: "Puerto Rico", GU: "Guam", VI: "U.S. Virgin Islands",
  AS: "American Samoa", MP: "Northern Mariana Islands" };

boot();

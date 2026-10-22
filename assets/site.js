/* Framing Memories · shared logic: login, saving, tabs, and the five game types.
   Reads window.LESSON = {name, id, acts:{kahoot,match,fill,order,tf}} */
const APPS_URL = window.APPS_SCRIPT_URL || "";
const L = window.LESSON || { name: "Framing Memories", id: "X", acts: {} };
const A = L.acts || {};
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
function hasUrl() { return APPS_URL && APPS_URL.indexOf("PASTE_YOUR") !== 0; }
function user() { try { return JSON.parse(ls("g6_user") || "null"); } catch (e) { return null; } }

function post(type, data) {
  const payload = { type, data }, key = "g6_backup_" + type; let b = [];
  try { b = JSON.parse(ls(key) || "[]"); } catch (e) {}
  b.push(payload); ls(key, JSON.stringify(b));
  if (!hasUrl()) return Promise.resolve({ ok: false, offline: true });
  return fetch(APPS_URL, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
    .then(() => ({ ok: true })).catch(() => ({ ok: false }));
}
function doLogin() {
  const n = $("#loginName").value.trim(), c = $("#loginClass").value.trim();
  if (!n || !c) { alert("Please type your name and your class."); return; }
  ls("g6_user", JSON.stringify({ name: n, klass: c }));
  post("login", { Name: n, Class: c, Lesson: L.name });
  renderLogin(); unlock();
}
function doLogout() { try { localStorage.removeItem("g6_user"); } catch (e) {} location.reload(); }
function renderLogin() {
  const bar = $("#loginbar"), u = user(); if (!bar) return;
  if (u) { bar.classList.add("done"); bar.innerHTML = `<span>✅ Logged in as <span class="who">${esc(u.name)} (${esc(u.klass)})</span>. Your answers and scores are saved.</span><button onclick="doLogout()" style="background:#8a7a68">Not you? Log out</button>`; }
}
function unlock() { $$(".gated").forEach(e => e.classList.remove("gated")); }
function gate() { if (!user()) $$(".needs-login").forEach(e => e.classList.add("gated")); }

/* ---------- tabs ---------- */
function initTabs() {
  const btns = $$(".tabs button"); if (!btns.length) return;
  const show = id => { btns.forEach(b => b.classList.toggle("on", b.dataset.t === id)); $$(".panel").forEach(p => p.classList.toggle("on", p.id === id)); history.replaceState(null, "", "#" + id); };
  btns.forEach(b => b.onclick = () => show(b.dataset.t));
  const h = location.hash.slice(1); show(btns.some(b => b.dataset.t === h) ? h : btns[0].dataset.t);
}

/* ---------- saving written work ---------- */
function collect(boxId) {
  const out = [];
  $$("#" + boxId + " [data-label]").forEach(el => {
    let v = el.type === "checkbox" ? (el.checked ? "yes" : "no") : (el.value || "").trim();
    if (v) out.push(el.dataset.label + ": " + v);
  });
  return out.join("\n");
}
function saveForm(strand, prompt, boxId, statusId) {
  const st = $("#" + statusId), u = user(), text = collect(boxId);
  if (!text) { st.textContent = "Write something first."; return; }
  if (!u) { st.textContent = "Log in first, then save."; return; }
  post("strand", { Name: u.name, Class: u.klass, Lesson: L.name, Strand: strand, Prompt: prompt, Response: text });
  st.textContent = "✅ Saved " + new Date().toLocaleTimeString();
}

/* ---------- activity bookkeeping ---------- */
function bestKey(label) { return "g6_best_" + L.id + "_" + label; }
function setBest(label, pct) { const o = parseInt(ls(bestKey(label)) || "-1", 10); if (pct > o) ls(bestKey(label), String(pct)); }
function getBest(label) { const v = parseInt(ls(bestKey(label)) || "-1", 10); return v < 0 ? null : v; }
function record(label, score, total, answers, startedAt, host) {
  const pct = Math.round(score / total * 100); setBest(label, pct);
  const u = user(); let msg;
  if (!u) msg = "Log in at the top of the page so your score is saved next time.";
  else {
    post("quiz", { Name: u.name, Class: u.klass, Lesson: L.name, Quiz: label, Score: score, Total: total, Percent: pct, TimeTakenSec: Math.round((Date.now() - startedAt) / 1000), Answers: answers.join(" | ").slice(0, 900) });
    msg = hasUrl() ? "✅ Score and answers saved to the class Google Sheet." : "✅ Saved in this browser (Sheet link not set yet).";
  }
  const face = pct === 100 ? "🏆 Perfect!" : pct >= 80 ? "🌟 Great work!" : pct >= 60 ? "👍 Good effort!" : "💪 Try again, you can beat it!";
  host.innerHTML = `<div class="result"><div class="big">${score} / ${total} · ${pct}%</div><div>${face}</div><p style="margin:6px 0;font-size:.9rem">${msg}</p><button class="btn" data-again>Play again</button></div>`;
  refreshProgress();
}
function refreshProgress() {
  const pg = $("#progress"); if (!pg) return;
  pg.innerHTML = (L.labels || []).map(l => { const b = getBest(l); return `<span class="${b !== null ? "done" : ""}">${b !== null ? "✔ " : ""}${esc(l)}${b !== null ? " · best " + b + "%" : ""}</span>`; }).join("");
  $$("[data-bestfor]").forEach(e => { const b = getBest(e.dataset.bestfor); e.textContent = b !== null ? "Best " + b + "%" : ""; e.style.display = b !== null ? "inline-block" : "none"; });
}

/* ---------- Kahoot-style multiple choice ---------- */
const SHAPES = ["▲", "◆", "●", "■"];
function kahoot(host, label, qs) {
  let st;
  const start = () => { st = { i: 0, score: 0, t0: Date.now(), ans: [], order: shuffle(qs) }; q(); };
  host.addEventListener("click", e => { if (e.target.dataset.again !== undefined || e.target.dataset.go !== undefined) start(); });
  host.innerHTML = `<div class="kah" style="text-align:center"><h3 style="color:#fff;margin:0 0 6px">${esc(label)}</h3><p>${qs.length} questions · 20 seconds each · tap the colour you think is right</p><button class="btn" style="background:#ffd166;color:#4a2f1b" data-go>▶ Start</button></div>`;
  let timer;
  function q() {
    clearInterval(timer);
    const it = st.order[st.i]; const opts = shuffle(it.o.map((t, k) => ({ t, ok: k === 0 })));
    host.innerHTML = `<div class="kah"><span class="pill">Score ${st.score}</span><div class="qn">QUESTION ${st.i + 1} OF ${qs.length}</div><div class="bar"><i id="kb"></i></div><div class="qt">${it.img ? `<img src="${it.img}" alt="">` : ""}${esc(it.q)}</div><div class="opts">${opts.map((o, k) => `<button class="opt c${k}" data-k="${k}"><span class="sh">${SHAPES[k]}</span>${esc(o.t)}</button>`).join("")}</div><div class="fb" id="kfb"></div><div id="kwhy"></div></div>`;
    let left = 200; const bar = $("#kb", host);
    timer = setInterval(() => { left--; bar.style.width = (left / 2) + "%"; if (left <= 0) pick(-1); }, 100);
    $$(".opt", host).forEach(b => b.onclick = () => pick(+b.dataset.k));
    function pick(k) {
      clearInterval(timer);
      const ok = k >= 0 && opts[k].ok;
      if (ok) st.score++;
      st.ans.push(`Q${st.i + 1} ${k >= 0 ? opts[k].t.slice(0, 28) : "no answer"} ${ok ? "✓" : "✗"}`);
      $$(".opt", host).forEach((b, bi) => { b.disabled = true; if (opts[bi].ok) b.classList.add("correct"); else b.classList.add("dim"); });
      $("#kfb", host).textContent = ok ? "✅ Correct!" : (k < 0 ? "⏱️ Time's up!" : "❌ Not quite");
      $(".pill", host).textContent = "Score " + st.score;
      if (it.why) $("#kwhy", host).innerHTML = `<div class="why">${esc(it.why)}</div>`;
      $("#kwhy", host).innerHTML += `<p style="text-align:center"><button class="btn" style="background:#ffd166;color:#4a2f1b" id="knext">${st.i + 1 < qs.length ? "Next →" : "See my score"}</button></p>`;
      $("#knext", host).onclick = () => { st.i++; st.i < qs.length ? q() : record(label, st.score, qs.length, st.ans, st.t0, host); };
    }
  }
}
/* ---------- match the columns ---------- */
function match(host, label, set) {
  let st;
  const start = () => {
    st = { sel: null, pairs: {}, t0: Date.now(), done: false, right: shuffle(set.pairs.map((p, i) => ({ t: p[1], i }))) };
    const L_ = set.pairs.map((p, i) => ({ t: p[0], i }));
    host.innerHTML = `<p class="legend">${esc(set.title)} Tap a term on the left, then its match on the right. Tap a matched item to undo.</p><div class="mt"><div class="col" id="ml">${L_.map(l => `<div class="mi" data-l="${l.i}">${esc(l.t)}</div>`).join("")}</div><div class="col" id="mr">${st.right.map((r, k) => `<div class="mi" data-r="${k}">${esc(r.t)}</div>`).join("")}</div></div><p><button class="btn" id="mchk">Check my matches</button></p><div id="mres"></div>`;
    $$("[data-l]", host).forEach(e => e.onclick = () => { if (st.done) return; const i = +e.dataset.l; if (i in st.pairs) { unpair(i); return; } st.sel = i; refresh(); });
    $$("[data-r]", host).forEach(e => e.onclick = () => {
      if (st.done) return; const k = +e.dataset.r; const owner = Object.keys(st.pairs).find(a => st.pairs[a] === k);
      if (owner !== undefined) { unpair(+owner); return; }
      if (st.sel === null) return; st.pairs[st.sel] = k; st.sel = null; refresh();
    });
    $("#mchk", host).onclick = check; refresh();
  };
  const unpair = i => { delete st.pairs[i]; refresh(); };
  function refresh() {
    $$("[data-l]", host).forEach(e => { const i = +e.dataset.l; e.className = "mi" + (st.sel === i ? " sel" : "") + (i in st.pairs ? " pc" + (Object.keys(st.pairs).indexOf(String(i)) % 8) : ""); const n = e.querySelector(".pn"); if (n) n.remove(); if (i in st.pairs) e.insertAdjacentHTML("afterbegin", `<span class="pn">${Object.keys(st.pairs).indexOf(String(i)) + 1}</span>`); });
    $$("[data-r]", host).forEach(e => { const k = +e.dataset.r; const owner = Object.keys(st.pairs).find(a => st.pairs[a] === k); e.className = "mi" + (owner !== undefined ? " pc" + (Object.keys(st.pairs).indexOf(owner) % 8) : ""); const n = e.querySelector(".pn"); if (n) n.remove(); if (owner !== undefined) e.insertAdjacentHTML("afterbegin", `<span class="pn">${Object.keys(st.pairs).indexOf(owner) + 1}</span>`); });
  }
  function check() {
    if (st.done) return;
    if (Object.keys(st.pairs).length < set.pairs.length) { $("#mres", host).innerHTML = `<div class="callout warn">Match every item first.</div>`; return; }
    st.done = true; let score = 0; const ans = [];
    Object.keys(st.pairs).forEach(a => { const right = st.right[st.pairs[a]]; const ok = right.i === +a; if (ok) score++; ans.push(`${set.pairs[a][0].slice(0, 22)}→${right.t.slice(0, 22)} ${ok ? "✓" : "✗"}`);
      $(`[data-l="${a}"]`, host).classList.add(ok ? "ok" : "no"); $(`[data-r="${st.pairs[a]}"]`, host).classList.add(ok ? "ok" : "no"); });
    record(label, score, set.pairs.length, ans, st.t0, $("#mres", host)); $("#mchk", host).style.display = "none";
  }
  host.addEventListener("click", e => { if (e.target.dataset.again !== undefined) start(); });
  start();
}
/* ---------- fill in the blanks ---------- */
function fill(host, label, set) {
  let st;
  const start = () => {
    const parts = set.text.split(/(\{\{.*?\}\})/); const answers = []; let html = "";
    parts.forEach(p => { const m = p.match(/^\{\{(.*?)\}\}$/); if (m) { html += `<span class="blank" data-b="${answers.length}">&nbsp;</span>`; answers.push(m[1]); } else html += esc(p).replace(/\n/g, "<br>"); });
    const bank = shuffle(answers.concat(set.extra || []).map((t, i) => ({ t, i })));
    st = { answers, cur: 0, val: {}, t0: Date.now(), done: false, bank };
    host.innerHTML = `<p class="legend">${esc(set.title)} Tap a blank, then tap a word. Tap a filled blank to clear it.</p><div class="fillq">${html}</div><div class="bank">${bank.map((b, k) => `<button data-w="${k}">${esc(b.t)}</button>`).join("")}</div><p><button class="btn" id="fchk">Check my answers</button></p><div id="fres"></div>`;
    $$(".blank", host).forEach(b => b.onclick = () => { if (st.done) return; const i = +b.dataset.b; if (st.val[i] !== undefined) { const w = st.val[i]; delete st.val[i]; $(`[data-w="${w}"]`, host).classList.remove("used"); } st.cur = i; draw(); });
    $$("[data-w]", host).forEach(b => b.onclick = () => { if (st.done) return; const i = firstEmpty(st.cur); if (i === -1) return; st.val[i] = +b.dataset.w; b.classList.add("used"); st.cur = firstEmpty(0) === -1 ? i : firstEmpty(i); draw(); });
    $("#fchk", host).onclick = check; draw();
  };
  const firstEmpty = from => { const n = st.answers.length; for (let k = 0; k < n; k++) { const i = (from + k) % n; if (st.val[i] === undefined) return i; } return -1; };
  function draw() { $$(".blank", host).forEach(b => { const i = +b.dataset.b; b.classList.toggle("act", i === st.cur && st.val[i] === undefined); b.innerHTML = st.val[i] !== undefined ? esc(st.bank[st.val[i]].t) : "&nbsp;"; }); }
  function check() {
    if (st.done) return; if (Object.keys(st.val).length < st.answers.length) { $("#fres", host).innerHTML = `<div class="callout warn">Fill every blank first.</div>`; return; }
    st.done = true; let score = 0; const ans = [];
    st.answers.forEach((a, i) => { const w = st.bank[st.val[i]].t; const ok = w === a; if (ok) score++; ans.push(`${i + 1}:${w.slice(0, 20)} ${ok ? "✓" : "✗"}`); $(`[data-b="${i}"]`, host).classList.add(ok ? "ok" : "no"); if (!ok) $(`[data-b="${i}"]`, host).insertAdjacentHTML("afterend", `<small style="color:#1b7a43;font-weight:700">(${esc(a)})</small>`); });
    record(label, score, st.answers.length, ans, st.t0, $("#fres", host)); $("#fchk", host).style.display = "none";
  }
  host.addEventListener("click", e => { if (e.target.dataset.again !== undefined) start(); });
  start();
}
/* ---------- put in order ---------- */
function order(host, label, set) {
  let st;
  const start = () => {
    st = { seq: [], t0: Date.now(), done: false, pool: shuffle(set.steps.map((t, i) => ({ t, i }))) };
    host.innerHTML = `<p class="legend">${esc(set.title)} Tap the steps in the right order, from first to last. Tap a slot to remove it.</p><div class="ord"><div class="pool">${st.pool.map((p, k) => `<div class="oi" data-p="${k}">${esc(p.t)}</div>`).join("")}</div><div class="slots">${set.steps.map((_, k) => `<div class="slot" data-s="${k}"><b>${k + 1}.</b> </div>`).join("")}</div></div><p><button class="btn" id="ochk">Check my order</button></p><div id="ores"></div>`;
    $$("[data-p]", host).forEach(e => e.onclick = () => { if (st.done) return; if (st.seq.length >= set.steps.length) return; st.seq.push(+e.dataset.p); draw(); });
    $$("[data-s]", host).forEach(e => e.onclick = () => { if (st.done) return; const k = +e.dataset.s; if (k < st.seq.length) { st.seq.splice(k, 1); draw(); } });
    $("#ochk", host).onclick = check; draw();
  };
  function draw() { $$("[data-p]", host).forEach(e => e.classList.toggle("gone", st.seq.includes(+e.dataset.p))); $$("[data-s]", host).forEach(e => { const k = +e.dataset.s; const v = st.seq[k]; e.className = "slot" + (v !== undefined ? " filled" : ""); e.innerHTML = `<b>${k + 1}.</b> ${v !== undefined ? esc(st.pool[v].t) : ""}`; }); }
  function check() {
    if (st.done) return; if (st.seq.length < set.steps.length) { $("#ores", host).innerHTML = `<div class="callout warn">Put every step in a slot first.</div>`; return; }
    st.done = true; let score = 0; const ans = [];
    st.seq.forEach((v, k) => { const ok = st.pool[v].i === k; if (ok) score++; ans.push(`${k + 1}:${st.pool[v].t.slice(0, 22)} ${ok ? "✓" : "✗"}`); $(`[data-s="${k}"]`, host).classList.add(ok ? "ok" : "no"); });
    $("#ores", host).innerHTML = ""; const r = document.createElement("div"); $("#ores", host).appendChild(r);
    record(label, score, set.steps.length, ans, st.t0, r);
    if (score < set.steps.length) r.insertAdjacentHTML("afterbegin", `<div class="callout tip"><b>Right order:</b> ${set.steps.map((s, i) => (i + 1) + ". " + esc(s)).join(" &nbsp; ")}</div>`);
    $("#ochk", host).style.display = "none";
  }
  host.addEventListener("click", e => { if (e.target.dataset.again !== undefined) start(); });
  start();
}
/* ---------- true or false ---------- */
function tf(host, label, qs) {
  let st;
  const start = () => { st = { i: 0, score: 0, t0: Date.now(), ans: [], order: shuffle(qs) }; q(); };
  host.addEventListener("click", e => { if (e.target.dataset.again !== undefined || e.target.dataset.go !== undefined) start(); });
  host.innerHTML = `<div class="tfc"><h3>${esc(label)}</h3><p>${qs.length} statements · decide if each one is true or false</p><button class="btn" data-go>▶ Start</button></div>`;
  function q() {
    const it = st.order[st.i];
    host.innerHTML = `<div class="tfc"><div class="qn" style="font-weight:700;color:var(--muted)">STATEMENT ${st.i + 1} OF ${qs.length}</div><div class="st">${esc(it.s)}</div><div class="tfb"><button class="t">✔ True</button><button class="f">✘ False</button></div><div id="tfb2"></div></div>`;
    $$(".tfb button", host).forEach(b => b.onclick = () => {
      const v = b.classList.contains("t"); const ok = v === it.a; if (ok) st.score++;
      st.ans.push(`S${st.i + 1} ${v ? "T" : "F"} ${ok ? "✓" : "✗"}`); $$(".tfb button", host).forEach(x => x.disabled = true);
      $("#tfb2", host).innerHTML = `<div class="callout ${ok ? "tip" : "warn"}" style="text-align:left"><b>${ok ? "✅ Correct" : "❌ Not quite"}: it is ${it.a ? "TRUE" : "FALSE"}.</b> ${esc(it.why || "")}</div><button class="btn" id="tnext">${st.i + 1 < qs.length ? "Next →" : "See my score"}</button>`;
      $("#tnext", host).onclick = () => { st.i++; st.i < qs.length ? q() : record(label, st.score, qs.length, st.ans, st.t0, host); };
    });
  }
}

/* ---------- idea bank + decision matrix ---------- */
let lastTA = null;
document.addEventListener("focusin", e => { if (e.target.matches && e.target.matches("textarea,input[type=text]")) lastTA = e.target; });
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest(".ideabank button");
  if (b && lastTA) { const t = b.dataset.ins || b.textContent; lastTA.value = lastTA.value ? lastTA.value + "; " + t : t; lastTA.focus(); }
});
function initMatrix() {
  $$("table.dm").forEach(tb => {
    const calc = () => {
      const tot = {}; $$("select.sc", tb).forEach(s => { const c = s.dataset.col; tot[c] = (tot[c] || 0) + (parseInt(s.value, 10) || 0); });
      const mx = Math.max.apply(null, Object.values(tot));
      $$("td.tot", tb).forEach(td => { const v = tot[td.dataset.col] || 0; td.textContent = v; td.classList.toggle("win", v === mx && mx > 0); });
      const w = $("#dmwin"); if (w) { const names = Object.keys(tot).filter(c => tot[c] === mx && mx > 0).map(c => ($("#idn" + c) || {}).value || ("Idea " + (+c + 1))); w.textContent = mx > 0 ? (names.length > 1 ? "Tie: " + names.join(" and ") + " (" + mx + " points). Re-check the criteria." : "Highest total: " + names[0] + " (" + mx + " points)") : ""; }
    };
    tb.addEventListener("change", calc); calc();
  });
}
/* ---------- boot ---------- */
function boot() {
  renderLogin(); gate(); if (user()) unlock(); initTabs(); initMatrix();
  const map = { kahoot, match, fill, order, tf };
  (A.kahoot ? [["kahoot", A.kahoot]] : []).forEach(([k, d]) => { const h = $("#act-kahoot"); if (h) kahoot(h, L.id + " Kahoot quiz", d); });
  (A.match || []).forEach((s, i) => { const h = $("#act-match" + i); if (h) match(h, L.id + " Match " + (i + 1), s); });
  (A.fill || []).forEach((s, i) => { const h = $("#act-fill" + i); if (h) fill(h, L.id + " Fill " + (i + 1), s); });
  (A.order || []).forEach((s, i) => { const h = $("#act-order" + i); if (h) order(h, L.id + " Order " + (i + 1), s); });
  if (A.tf) { const h = $("#act-tf"); if (h) tf(h, L.id + " True or false", A.tf); }
  refreshProgress();
}
document.addEventListener("DOMContentLoaded", boot);

// Chinese Study: a small Quizlet-style study site.
// All study content lives in data/*.json. No build step needed.

const DATA_FILES = ["data/stage2.json"];
const app = document.getElementById("app");
let SETS = [];

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (arr, n, not) => shuffle(arr.filter((x) => x !== not)).slice(0, n);
// "nǐ hǎo" -> "nihao", so typed answers work with or without tone marks and spaces
const plain = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ü/g, "v").replace(/[^a-z]/gi, "").toLowerCase().replace(/u:/g, "v");
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- audio ----------
// A card can carry its own recording ("audio": "url"), e.g. one uploaded by the teacher.
// Otherwise the browser's built-in Chinese voice reads it.
let zhVoice = null;
function loadVoice() {
  const vs = speechSynthesis.getVoices();
  zhVoice = vs.find((v) => /zh[-_]CN/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
}
if ("speechSynthesis" in window) { loadVoice(); speechSynthesis.onvoiceschanged = loadVoice; }
function speak(text, audioUrl) {
  if (audioUrl) { new Audio(audioUrl).play(); return; }
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN"; u.rate = 0.8;
  if (zhVoice) u.voice = zhVoice;
  speechSynthesis.speak(u);
}
window.speakCard = (i, setId) => { const c = findSet(setId).cards[i]; speak(c.hanzi, c.audio); };
const speakBtn = (setId, i) => `<button class="speak" title="Listen" onclick="event.stopPropagation();speakCard(${i},'${setId}')">🔊</button>`;

// Answer text showing pinyin above the English meaning
const pyEn = (c) => `<span class="py">${esc(c.pinyin)}</span><br>${esc(c.english)}`;

// ---------- routing ----------
const findSet = (id) => SETS.find((s) => s.id === id);
const MODES = [["cards", "Flashcards"], ["learn", "Learn"], ["match", "Match"], ["test", "Test"], ["sentences", "Translate sentences"], ["words", "Word list"], ["grammar", "Grammar"]];
const CARD_MODES = ["cards", "learn", "match", "test", "words"];
const modesFor = (set) => MODES.filter(([m]) => (m === "sentences" ? sentencesOf(set).length : !CARD_MODES.includes(m) || set.cards.length));
// Sentences to translate: the set's own list, plus every example sentence in its cards and grammar notes.
function sentencesOf(set) {
  const seen = new Set(), out = [];
  const add = (zh, en) => { if (zh && en && zh.length >= 4 && /[。？！]$/.test(zh) && !seen.has(zh)) { seen.add(zh); out.push({ zh, en }); } };
  (set.sentences || []).forEach((x) => add(x.zh, x.en));
  set.grammar.forEach((g) => g.examples.forEach(([zh, en]) => add(zh, en)));
  set.cards.forEach((c) => add(c.example, c.example_en));
  return out;
}

function route() {
  speechSynthesis?.cancel?.();
  const [, page, id, mode] = location.hash.split("/");
  if (page === "set" && findSet(id)) { const set = findSet(id), ms = modesFor(set).map(([m]) => m); return renderSet(set, ms.includes(mode) ? mode : ms[0]); }
  renderHome();
}

function renderHome() {
  const groups = {};
  SETS.forEach((s) => (groups[s.course] ||= []).push(s));
  app.innerHTML = `<h1>What do you want to study?</h1>
    <p class="muted">Pick a set to use flashcards, Learn mode, games and grammar notes.</p>
    ${Object.entries(groups).map(([course, sets]) => `<h2>${esc(course)}</h2><div class="grid">
      ${sets.map((s) => `<a class="tile" href="#/set/${s.id}/${modesFor(s)[0][0]}"><b>${esc(s.title)}</b>
        <small>${[s.cards.length && s.cards.length + " words", sentencesOf(s).length + " sentences", s.grammar.length + " grammar points"].filter(Boolean).join(" · ")}</small>
        <div style="font-size:24px;margin-top:8px">${s.cards.length ? s.cards.slice(0, 4).map((c) => esc(c.hanzi)).join(" ") : esc(sentencesOf(s)[0]?.zh || "")}</div></a>`).join("")}
    </div>`).join("")}`;
}

function renderSet(set, mode) {
  app.innerHTML = `<a href="#/" class="muted">← All sets</a>
    <h1>${esc(set.title)}</h1><p class="muted">${esc(set.course)} · from ${esc(set.source)}</p>
    <nav class="tabs">${modesFor(set).map(([m, label]) => `<a href="#/set/${set.id}/${m}" class="${m === mode ? "on" : ""}">${label}</a>`).join("")}</nav>
    <section id="mode"></section>`;
  const el = document.getElementById("mode");
  ({ cards: modeCards, learn: modeLearn, match: modeMatch, test: modeTest, sentences: modeSentences, words: modeWords, grammar: modeGrammar }[mode] || modeCards)(set, el);
}

// ---------- Flashcards ----------
function modeCards(set, el) {
  let order = set.cards.map((_, i) => i), pos = 0, startBack = store.get("startBack", false);
  const draw = () => {
    const i = order[pos], c = set.cards[i];
    const front = `<div class="hanzi">${esc(c.hanzi)}</div>`;
    const back = `<div class="pinyin">${esc(c.pinyin)}</div><div class="eng">${esc(c.english)}</div>
      ${c.example ? `<div class="ex">${esc(c.example)}<br>${esc(c.example_en)}</div>` : ""}`;
    el.innerHTML = `<div class="flash" id="fc"><div class="inner">
        <div class="face">${startBack ? back : front}</div><div class="face back">${startBack ? front : back}</div></div></div>
      <div class="row">${speakBtn(set.id, i)}
        <button class="btn" id="prev">← Back</button><span class="muted">${pos + 1} / ${order.length}</span>
        <button class="btn" id="next">Next →</button></div>
      <div class="row"><button class="btn" id="shuf">Shuffle</button>
        <button class="btn" id="side">Start with ${startBack ? "characters" : "English"}</button></div>
      <p class="muted" style="text-align:center">Tap the card to flip it. Keyboard: space flips, arrows move.</p>`;
    const fc = el.querySelector("#fc");
    fc.onclick = () => fc.classList.toggle("flipped");
    el.querySelector("#prev").onclick = () => { pos = (pos - 1 + order.length) % order.length; draw(); };
    el.querySelector("#next").onclick = () => { pos = (pos + 1) % order.length; draw(); };
    el.querySelector("#shuf").onclick = () => { order = shuffle(order); pos = 0; draw(); };
    el.querySelector("#side").onclick = () => { startBack = !startBack; store.set("startBack", startBack); draw(); };
  };
  document.onkeydown = (e) => {
    if (!document.getElementById("fc")) return;
    if (e.key === " ") { e.preventDefault(); document.getElementById("fc").click(); }
    if (e.key === "ArrowRight") el.querySelector("#next").click();
    if (e.key === "ArrowLeft") el.querySelector("#prev").click();
  };
  draw();
}

// ---------- Learn ----------
// Each word goes through 3 steps: pick the English, pick the characters, type the pinyin.
// A wrong answer sends the word back a step and it comes round again soon.
function modeLearn(set, el) {
  const key = "learn:" + set.id;
  let level = store.get(key, {}); // card index -> steps passed (0..3)
  const steps = (i) => level[i] || 0;
  const mastered = () => set.cards.filter((_, i) => steps(i) >= 3).length;
  let recent = [];

  const next = () => {
    const left = set.cards.map((_, i) => i).filter((i) => steps(i) < 3);
    if (!left.length) {
      el.innerHTML = `<div class="done"><h2>🎉 You've learnt all ${set.cards.length} words!</h2>
        <button class="btn primary" id="again">Start again</button></div>`;
      el.querySelector("#again").onclick = () => { level = {}; store.set(key, level); next(); };
      return;
    }
    // work on a small batch of 7 words at a time, lowest step first
    const batch = left.sort((a, b) => steps(a) - steps(b)).slice(0, 7);
    const pool = batch.filter((i) => !recent.includes(i));
    const i = shuffle(pool.length ? pool : batch)[0];
    recent = [i, ...recent].slice(0, Math.min(2, batch.length - 1));
    ask(i);
  };

  const header = () => `<div class="bar"><i style="width:${(100 * mastered()) / set.cards.length}%"></i></div>
    <p class="muted" style="text-align:center">${mastered()} of ${set.cards.length} words learnt
    · <a href="#" id="reset">reset</a></p>`;

  const answer = (i, ok, shown) => {
    level[i] = ok ? steps(i) + 1 : Math.max(0, steps(i) - 1);
    store.set(key, level);
    const c = set.cards[i];
    const fb = el.querySelector(".feedback");
    fb.className = "feedback " + (ok ? "good" : "bad");
    fb.innerHTML = ok ? "Correct!" : `Not quite. ${esc(c.hanzi)} = ${esc(c.pinyin)} = ${esc(c.english)}`;
    speak(c.hanzi, c.audio);
    el.querySelectorAll("button.choice, input, #go").forEach((b) => (b.disabled = true));
    const cont = document.createElement("div");
    cont.className = "row";
    cont.innerHTML = `<button class="btn primary" id="cont">Continue →</button>`;
    el.appendChild(cont);
    const go = () => { document.onkeydown = null; next(); };
    el.querySelector("#cont").onclick = go;
    setTimeout(() => (document.onkeydown = (e) => { if (e.key === "Enter") go(); }), 50);
    if (ok && !shown) setTimeout(() => el.querySelector("#cont") && go(), 900);
  };

  const ask = (i) => {
    const c = set.cards[i], s = steps(i);
    if (s < 2) {
      const forward = s === 0; // step 0: characters -> English; step 1: English -> characters
      const opts = shuffle([c, ...pick(set.cards, 3, c)]);
      el.innerHTML = header() + `<div class="prompt">${forward
          ? `<div class="hanzi">${esc(c.hanzi)}</div>${speakBtn(set.id, i)}<p class="muted">What does this mean?</p>`
          : `<div class="eng" style="font-size:28px">${esc(c.english)}</div><p class="muted">Which characters mean this?</p>`}</div>
        <div class="choices">${opts.map((o, k) => `<button class="choice ${forward ? "" : "zh"}" data-k="${k}">${forward ? pyEn(o) : esc(o.hanzi)}</button>`).join("")}</div>
        <div class="feedback"></div>`;
      el.querySelectorAll(".choice").forEach((b) => (b.onclick = () => {
        const ok = opts[b.dataset.k] === c;
        b.classList.add(ok ? "right" : "wrong");
        if (!ok) el.querySelectorAll(".choice")[opts.indexOf(c)].classList.add("right");
        answer(i, ok, !ok);
      }));
    } else {
      el.innerHTML = header() + `<div class="prompt"><div class="hanzi">${esc(c.hanzi)}</div>
          <p class="muted">Type the pinyin (tone marks optional): ${esc(c.english)}</p></div>
        <form class="typein" id="f"><input id="in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. ni hao">
        <button class="btn primary" id="go">Check</button></form><div class="feedback"></div>`;
      const inp = el.querySelector("#in"); inp.focus();
      el.querySelector("#f").onsubmit = (e) => { e.preventDefault(); if (inp.value.trim()) answer(i, plain(inp.value) === plain(c.pinyin), true); };
    }
    el.querySelector("#reset").onclick = (e) => { e.preventDefault(); level = {}; store.set(key, level); next(); };
  };
  next();
}

// ---------- Match ----------
function modeMatch(set, el) {
  const start = () => {
    const cards = pick(set.cards, Math.min(6, set.cards.length));
    const tiles = shuffle(cards.flatMap((c) => [{ c, zh: true }, { c, zh: false }]));
    let sel = null, left = cards.length, t0 = Date.now(), penalty = 0;
    el.innerHTML = `<p class="muted">Match each Chinese word to its meaning. Wrong matches add 1 second.</p>
      <div class="match">${tiles.map((t, k) => `<button class="tilem ${t.zh ? "zh" : ""}" data-k="${k}">${esc(t.zh ? t.c.hanzi : t.c.english)}</button>`).join("")}</div>`;
    el.querySelectorAll(".tilem").forEach((b) => (b.onclick = () => {
      const t = tiles[b.dataset.k];
      if (t.zh) speak(t.c.hanzi, t.c.audio);
      if (!sel) { sel = b; b.classList.add("sel"); return; }
      if (sel === b) { sel = null; b.classList.remove("sel"); return; }
      const s = tiles[sel.dataset.k];
      if (s.c === t.c && s.zh !== t.zh) {
        sel.classList.add("gone"); b.classList.add("gone"); left--;
        if (!left) {
          const secs = ((Date.now() - t0) / 1000 + penalty).toFixed(1);
          const best = store.get("match:" + set.id, null);
          if (!best || secs < best) store.set("match:" + set.id, +secs);
          el.innerHTML = `<div class="done"><h2>Done in ${secs} seconds</h2>
            <p class="muted">Your best: ${Math.min(+secs, best ?? Infinity)} seconds</p>
            <button class="btn primary" id="again">Play again</button></div>`;
          el.querySelector("#again").onclick = start;
        }
      } else {
        penalty++;
        [sel, b].forEach((x) => { x.classList.add("wrong"); setTimeout(() => x.classList.remove("wrong", "sel"), 400); });
      }
      sel?.classList.remove("sel"); sel = null;
    }));
  };
  start();
}

// ---------- Test ----------
function modeTest(set, el) {
  const start = () => {
    const qs = pick(set.cards, Math.min(10, set.cards.length)).map((c, n) => ({ c, kind: n % 3 }));
    let n = 0, score = 0, wrong = [];
    const q = () => {
      if (n >= qs.length) {
        el.innerHTML = `<div class="done"><h2>You scored ${score} / ${qs.length}</h2>
          ${wrong.length ? `<p>Words to review:</p><p>${wrong.map((c) => `<b>${esc(c.hanzi)}</b> ${esc(c.pinyin)}: ${esc(c.english)}`).join("<br>")}</p>` : "<p>Perfect! 🎉</p>"}
          <button class="btn primary" id="again">New test</button></div>`;
        el.querySelector("#again").onclick = start;
        return;
      }
      const { c, kind } = qs[n];
      const opts = shuffle([c, ...pick(set.cards, 3, c)]);
      const [prompt, show, html] = [
        [`<div class="hanzi">${esc(c.hanzi)}</div><p class="muted">Choose the meaning</p>`, (o) => o, true],
        [`<div class="eng" style="font-size:28px">${esc(c.english)}</div><p class="muted">Choose the characters</p>`, (o) => o.hanzi],
        [`<div class="hanzi">${esc(c.hanzi)}</div><p class="muted">Choose the pinyin</p>`, (o) => o.pinyin],
      ][kind];
      el.innerHTML = `<p class="muted" style="text-align:center">Question ${n + 1} of ${qs.length}</p>
        <div class="prompt">${prompt}</div>
        <div class="choices">${opts.map((o, k) => `<button class="choice ${kind === 1 ? "zh" : ""}" data-k="${k}">${html ? pyEn(o) : esc(show(o))}</button>`).join("")}</div>`;
      el.querySelectorAll(".choice").forEach((b) => (b.onclick = () => {
        const ok = opts[b.dataset.k] === c;
        if (ok) score++; else wrong.push(c);
        b.classList.add(ok ? "right" : "wrong");
        el.querySelectorAll(".choice")[opts.indexOf(c)].classList.add("right");
        el.querySelectorAll(".choice").forEach((x) => (x.disabled = true));
        speak(c.hanzi, c.audio);
        setTimeout(() => { n++; q(); }, ok ? 700 : 1600);
      }));
    };
    q();
  };
  start();
}

// ---------- Translate sentences ----------
// Shows a whole sentence; the student writes their own translation, then reveals the answer
// and marks themselves. Sentences marked "practise again" come back at the end.
function modeSentences(set, el) {
  const all = sentencesOf(set);
  let toEnglish = store.get("toEnglish", true), queue, done, total;
  const start = () => { queue = shuffle(all); done = 0; total = all.length; show(); };
  const show = () => {
    if (!queue.length) {
      el.innerHTML = `<div class="done"><h2>🎉 All ${total} sentences done!</h2><button class="btn primary" id="again">Go again</button></div>`;
      el.querySelector("#again").onclick = start;
      return;
    }
    const x = queue[0];
    el.innerHTML = `<div class="row"><button class="btn ${toEnglish ? "primary" : ""}" id="d1">Chinese → English</button>
        <button class="btn ${toEnglish ? "" : "primary"}" id="d2">English → Chinese</button></div>
      <div class="bar"><i style="width:${(100 * done) / total}%"></i></div>
      <p class="muted" style="text-align:center">${done} of ${total} done</p>
      <div class="gram" style="text-align:center;max-width:640px;margin:14px auto">
        <div style="font-size:${toEnglish ? 30 : 22}px">${esc(toEnglish ? x.zh : x.en)}</div>
        ${toEnglish ? `<button class="speak" id="say" title="Listen">🔊</button>` : ""}
      </div>
      <div class="typein" style="max-width:640px"><input id="in" autocomplete="off" placeholder="Write your translation (optional), then show the answer"></div>
      <div class="row"><button class="btn primary" id="reveal">Show answer</button></div>
      <div id="ans"></div>`;
    el.querySelector("#d1").onclick = () => { toEnglish = true; store.set("toEnglish", true); show(); };
    el.querySelector("#d2").onclick = () => { toEnglish = false; store.set("toEnglish", false); show(); };
    el.querySelector("#say")?.addEventListener("click", () => speak(x.zh));
    el.querySelector("#in").focus();
    el.querySelector("#in").onkeydown = (e) => { if (e.key === "Enter") el.querySelector("#reveal").click(); };
    el.querySelector("#reveal").onclick = () => {
      el.querySelector("#reveal").remove();
      el.querySelector("#ans").innerHTML = `<div class="gram" style="text-align:center;max-width:640px;margin:0 auto;border-color:var(--good)">
          <div class="muted">Answer</div><div style="font-size:${toEnglish ? 20 : 28}px">${esc(toEnglish ? x.en : x.zh)}</div>
          ${toEnglish ? "" : `<button class="speak" id="say2" title="Listen">🔊</button>`}</div>
        <p class="muted" style="text-align:center">Other wordings can be right too. How did you do?</p>
        <div class="row"><button class="btn" id="miss">Practise again</button><button class="btn primary" id="got">I got it</button></div>`;
      el.querySelector("#say2")?.addEventListener("click", () => speak(x.zh));
      if (!toEnglish) speak(x.zh);
      el.querySelector("#got").onclick = () => { queue.shift(); done++; show(); };
      el.querySelector("#miss").onclick = () => { queue.push(queue.shift()); show(); };
    };
  };
  start();
}

// ---------- Word list & grammar ----------
function modeWords(set, el) {
  el.innerHTML = `<table><tr><th></th><th>Characters</th><th>Pinyin</th><th>English</th></tr>
    ${set.cards.map((c, i) => `<tr><td>${speakBtn(set.id, i)}</td><td class="zh">${esc(c.hanzi)}</td><td>${esc(c.pinyin)}</td>
      <td>${esc(c.english)}${c.example ? `<div class="muted">${esc(c.example)} ${esc(c.example_en)}</div>` : ""}</td></tr>`).join("")}</table>`;
}

function modeGrammar(set, el) {
  window.speakText = (t) => speak(t);
  el.innerHTML = set.grammar.map((g) => `<div class="gram"><b>${esc(g.pattern)}</b><div>${esc(g.meaning)}</div>
    ${g.examples.length ? `<ul>${g.examples.map(([zh, en]) => `<li><a href="#" onclick="event.preventDefault();speakText(this.textContent)" title="Listen">${esc(zh)}</a> <span class="muted">${esc(en)}</span></li>`).join("")}</ul>` : ""}</div>`).join("")
    || `<p class="muted">No grammar notes for this set yet.</p>`;
}

// ---------- start ----------
Promise.all(DATA_FILES.map((f) => fetch(f).then((r) => r.json())))
  .then((files) => {
    SETS = files.flatMap((d) => d.sets.map((s) => ({ ...s, course: d.course })));
    window.onhashchange = route;
    route();
  })
  .catch(() => (app.innerHTML = `<p>Sorry, the study sets couldn't be loaded.</p>`));

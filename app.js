'use strict';

/* ================= Данные ================= */
const _seen = new Set();
function extraWords(l) { return typeof COURSE_EXTRA !== 'undefined' && COURSE_EXTRA[l] ? '\n' + COURSE_EXTRA[l].trim() : ''; }
function uniq(list) { return list.filter((w) => { const k = w.hz + '|' + plain(w.py).replace(/\s/g, ''); return !_seen.has(k) && _seen.add(k); }); }
const DECKS = {
  hsk1: { name: 'HSK 1', level: 1, words: uniq(parseWords(HSK1 + extraWords(1), 'hsk1')) },
  hsk2: { name: 'HSK 2', level: 2, words: uniq(parseWords(HSK2 + extraWords(2), 'hsk2')) },
  hsk3: { name: 'HSK 3', level: 3, words: uniq(parseWords(HSK3 + extraWords(3), 'hsk3')) },
  hsk4: { name: 'HSK 4', level: 4, words: uniq(parseWords(HSK4 + extraWords(4), 'hsk4')) },
  life: { name: 'Жизнь в Китае', words: uniq(parseWords(LIFE, 'life')) },
  phr: {
    name: 'Фразы',
    words: SITUATIONS.flatMap((s) => s.phrases.filter((p) => !p[3] && !p[0].includes('…')).map((p) => ({
      id: 'phr:' + p[0], hz: p[0], py: p[1], ru: p[2], deck: 'phr', sit: s.title,
    }))),
  },
};
const HSK_DECKS = ['hsk1', 'hsk2', 'hsk3', 'hsk4'];
const PRACTICAL_DECKS = ['life', 'phr'];
const ALL_GRAMMAR = [...GRAMMAR.map((g) => ({ lvl: 2, ...g })), ...GRAMMAR_34];
const ALL_WORDS = Object.values(DECKS).flatMap((d) => d.words);
const WORD_BY_ID = Object.fromEntries(ALL_WORDS.map((w) => [w.id, w]));

/* ================= Хранилище ================= */
const STORE_KEY = 'zh-daily-v1';
const DEFAULT_STATE = {
  cards: {},          // id -> {due, iv, ef, reps, lapses}
  days: {},           // 'YYYY-MM-DD' -> {rev, new}
  settings: {
    newPerDay: 0,
    maxLevel: 4,
    decks: { life: true, phr: true },
    mode: 'type',     // type | read | listen | speak | mixed
    rate: 0.8,
    voice: '',
    autoplay: true,
    showPinyin: true,
    hanziOnly: true,  // ответ только иероглифами (набор на китайской клавиатуре)
  },
  tones: { right: 0, total: 0, best: 0 },
};

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s) return { ...DEFAULT_STATE, ...s, settings: { ...DEFAULT_STATE.settings, ...s.settings, decks: { ...DEFAULT_STATE.settings.decks, ...(s.settings || {}).decks } }, tones: { ...DEFAULT_STATE.tones, ...s.tones } };
  } catch (e) { /* пусто */ }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
let S = load();
if (!S.typeMigrated) { S.settings.mode = 'type'; S.typeMigrated = true; }
if (!S.hanziMigrated) { S.settings.hanziOnly = true; S.hanziMigrated = true; }
if (!S.lessonsMigrated) { S.settings.newPerDay = 0; S.lessonsMigrated = true; }
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* приватный режим */ }
}

const DAY = 86400000;
function todayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function today() { return S.days[todayKey()] || (S.days[todayKey()] = { rev: 0, new: 0 }); }
function streak() {
  let n = 0; const d = new Date();
  if (!S.days[todayKey(d)] || !S.days[todayKey(d)].rev) d.setDate(d.getDate() - 1);
  while (S.days[todayKey(d)] && S.days[todayKey(d)].rev) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ================= Озвучка ================= */
let voices = [];
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = speechSynthesis.getVoices().filter((v) => /^zh|cmn/i.test(v.lang));
  voices.sort((a, b) => score(b) - score(a));
  function score(v) {
    let s = 0;
    if (/zh[-_]CN/i.test(v.lang)) s += 10;
    if (/Xiaoxiao|Yunxi|Tingting|Ting-Ting|Google|Natural|Online/i.test(v.name)) s += 5;
    if (/HK|TW|yue/i.test(v.lang + v.name)) s -= 8;
    return s;
  }
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}
function speak(text, rate) {
  if (!('speechSynthesis' in window)) { toast('Браузер не поддерживает озвучку'); return; }
  const clean = text.replace(/…/g, '');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'zh-CN';
  u.rate = rate || S.settings.rate;
  const v = voices.find((x) => x.name === S.settings.voice) || voices[0];
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

/* ================= Распознавание речи ================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function listen(onResult, onError) {
  if (!SR) { onError('Распознавание речи не поддерживается в этом браузере (работает в Chrome / Edge / Safari).'); return; }
  const r = new SR();
  r.lang = 'zh-CN'; r.interimResults = false; r.maxAlternatives = 3;
  r.onresult = (e) => onResult(Array.from(e.results[0]).map((a) => a.transcript));
  r.onerror = (e) => onError(e.error === 'not-allowed' ? 'Нет доступа к микрофону' : 'Не расслышал, попробуйте ещё раз');
  r.start();
  return r;
}
function normHz(s) { return s.replace(/[，。！？、,.!?…\s「」“”]/g, ''); }
function similarity(target, heard) {
  const t = [...normHz(target)], h = [...normHz(heard)];
  if (!t.length) return 0;
  // LCS
  const dp = Array(h.length + 1).fill(0);
  for (let i = 1; i <= t.length; i++) {
    let prev = 0;
    for (let j = 1; j <= h.length; j++) {
      const tmp = dp[j];
      dp[j] = t[i - 1] === h[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[h.length] / Math.max(t.length, h.length);
}
// Посимвольное сравнение (LCS): в ответе помечаем лишние/неверные иероглифы, в образце — пропущенные.
function charDiff(answer, target) {
  const a = [...normHz(answer)], t = [...normHz(target)];
  const L = Array.from({ length: a.length + 1 }, () => Array(t.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = t.length - 1; j >= 0; j--) L[i][j] = a[i] === t[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const okA = new Set(), okT = new Set();
  for (let i = 0, j = 0; i < a.length && j < t.length;) {
    if (a[i] === t[j]) { okA.add(i++); okT.add(j++); } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  const mk = (arr, ok, cls) => arr.map((c, k) => ok.has(k) ? esc(c) : `<mark class="${cls}">${esc(c)}</mark>`).join('');
  return { a: mk(a, okA, 'x'), t: mk(t, okT, 'miss'), extra: a.length - okA.size, miss: t.length - okT.size };
}
// То же для пиньиня: сравниваем слоги по порядку без учёта тонов.
function pinyinDiff(answer, target) {
  const a = syllables(answer.replace(/[0-9]/g, ' ').replace(/v/g, 'ü')), t = syllables(target);
  const bad = a.filter((x, k) => !t[k] || plain(x).replace('ü', 'u') !== plain(t[k]).replace('ü', 'u')).length;
  return { html: a.map((x, k) => (!t[k] || plain(x).replace('ü', 'u') !== plain(t[k]).replace('ü', 'u')) ? `<mark class="x">${esc(x)}</mark>` : esc(x)).join(' '), bad, miss: Math.max(0, t.length - a.length) };
}

/* ================= Пиньинь ================= */
const TONE_MAP = { 'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4, 'ē': 1, 'é': 2, 'ě': 3, 'è': 4, 'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4, 'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4, 'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4, 'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4 };
const V = 'aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
const SYL_RE = new RegExp(`(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[${V}]+(?:ng(?![${V}])|n(?![${V}])|r(?![${V}]))?`, 'gi');
function syllables(py) { return (py.toLowerCase().replace(/[^a-z' üāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ-]/g, ' ').match(SYL_RE) || []); }
function toneOf(syl) { for (const ch of syl) if (TONE_MAP[ch]) return TONE_MAP[ch]; return 5; }
function tonesOf(py) { return syllables(py).map(toneOf); }
function plain(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function colorPinyin(py) {
  return esc(py).replace(SYL_RE, (m) => `<span class="t${toneOf(m)}">${m}</span>`);
}

/* ================= Утилиты ================= */
const app = document.getElementById('app');
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function playBtn(text, cls = '') { return `<button class="play ${cls}" data-say="${esc(text)}" aria-label="Прослушать">🔊</button>`; }
let toastTimer;
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div'); t.id = 'toast';
    t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 16px;border-radius:12px;z-index:20;font-size:14px;max-width:90vw;text-align:center';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2600);
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-say]');
  if (b) { e.preventDefault(); speak(b.dataset.say, b.dataset.rate ? +b.dataset.rate : undefined); }
});

/* ================= Интервальное повторение ================= */
function deckOn(k) { return DECKS[k].level ? DECKS[k].level <= S.settings.maxLevel : !!S.settings.decks[k]; }
function enabledWords() { return ALL_WORDS.filter((w) => deckOn(w.deck)); }
function dueCards() {
  const now = Date.now();
  return enabledWords().filter((w) => S.cards[w.id] && S.cards[w.id].due <= now);
}
function newCards() {
  const left = Math.max(0, S.settings.newPerDay - today().new);
  // HSK идёт строго по уровням; практичные слова и фразы подмешиваются каждой третьей карточкой
  const hsk = HSK_DECKS.filter(deckOn).flatMap((k) => DECKS[k].words).filter((w) => !S.cards[w.id]);
  const prac = PRACTICAL_DECKS.filter(deckOn).flatMap((k) => DECKS[k].words).filter((w) => !S.cards[w.id]);
  const out = [];
  let i = 0, j = 0;
  while (out.length < left && (i < hsk.length || j < prac.length)) {
    if ((out.length % 3 === 2 && j < prac.length) || i >= hsk.length) out.push(prac[j++]);
    else out.push(hsk[i++]);
  }
  return out;
}
function grade(id, g) { // g: 0 снова, 1 трудно, 2 хорошо, 3 легко
  const isNew = !S.cards[id];
  const c = S.cards[id] || { iv: 0, ef: 2.5, reps: 0, lapses: 0, due: 0 };
  if (g === 0) {
    c.reps = 0; c.lapses++; c.ef = Math.max(1.3, c.ef - 0.2); c.iv = 0;
    c.due = Date.now() + 60 * 1000;
  } else {
    if (g === 1) { c.iv = c.reps === 0 ? 1 : Math.max(1, c.iv * 1.2); c.ef = Math.max(1.3, c.ef - 0.15); }
    if (g === 2) { c.iv = c.reps === 0 ? 1 : c.reps === 1 ? 3 : c.iv * c.ef; }
    if (g === 3) { c.iv = c.reps === 0 ? 4 : c.reps === 1 ? 5 : c.iv * c.ef * 1.3; c.ef += 0.15; }
    c.iv = Math.round(c.iv * 10) / 10;
    c.reps++;
    const d = new Date(); d.setHours(4, 0, 0, 0);
    c.due = d.getTime() + Math.round(c.iv) * DAY;
  }
  if (!c.added) c.added = todayKey();
  c.last = todayKey();
  S.cards[id] = c;
  const t = today(); t.rev++; if (isNew) t.new++;
  if (!t.ids) t.ids = [];
  if (!t.ids.includes(id)) t.ids.push(id);
  save();
}
function nextIvLabel(id, g) {
  const c = S.cards[id] || { iv: 0, ef: 2.5, reps: 0 };
  if (g === 0) return '<1 мин';
  let iv;
  if (g === 1) iv = c.reps === 0 ? 1 : Math.max(1, c.iv * 1.2);
  if (g === 2) iv = c.reps === 0 ? 1 : c.reps === 1 ? 3 : c.iv * c.ef;
  if (g === 3) iv = c.reps === 0 ? 4 : c.reps === 1 ? 5 : c.iv * c.ef * 1.3;
  iv = Math.round(iv);
  return iv < 31 ? iv + ' дн' : Math.round(iv / 30) + ' мес';
}

/* ================= Страницы ================= */
const routes = {
  '': renderHome,
  learn: renderLearn,
  phrases: renderPhrases,
  tones: renderTones,
  grammar: renderGrammar,
  dict: renderDict,
  review: renderReview,
  lessons: renderLessons,
  settings: renderSettings,
};
function router() {
  const [, page = '', arg] = location.hash.split('/');
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', (a.dataset.tab === (page || 'home'))));
  setFocus((page === 'lessons' || page === 'review') && arg === 'go', page === 'review' ? '#/review' : '#/lessons');
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  (routes[page] || renderHome)(arg);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', router);
// Режим занятия: прячем нижнее меню, кнопки действий прилипают к низу экрана, в шапке — «Выйти».
function setFocus(on, exit) {
  document.body.classList.toggle('focus', !!on);
  const x = document.getElementById('focusExit'); if (x && exit) x.href = exit;
}

/* ---------- Главная ---------- */
function renderHome() {
  const due = dueCards().length, nw = newCards().length;
  const learned = Object.keys(S.cards).length;
  const t = today();
  const h = new Date().getHours();
  const hello = h < 12 ? '早上好' : h < 18 ? '下午好' : '晚上好';
  const helloPy = h < 12 ? 'Zǎoshang hǎo' : h < 18 ? 'Xiàwǔ hǎo' : 'Wǎnshang hǎo';
  app.innerHTML = `
    <h1><span class="hz">${hello}</span>, Артём! ${playBtn(hello)}</h1>
    <p class="muted" style="margin-top:-6px">${helloPy}</p>
    <div class="grid grid-3">
      <div class="card stat"><b>${streak()}</b><span>дней подряд</span></div>
      <div class="card stat"><b>${t.rev}</b><span>повторено сегодня</span></div>
      <div class="card stat"><b>${learned}</b><span>слов в изучении</span></div>
    </div>
    ${nextLessonCard()}
    ${due + nw ? `<a class="card due-card" href="#/learn">
      <span class="ic">🃏</span><span><b>Карточки на сегодня: ${due + nw}</b><small>${due ? `повторить ${due}` : ''}${due && nw ? ' · ' : ''}${nw ? `новых ${nw}` : ''} · около ${Math.max(1, Math.round((due + nw) * 0.25))} мин</small></span><span class="go">→</span>
    </a>` : `<div class="done-line">✅ Карточки на сегодня повторены</div>`}
    ${isStandalone() || S.hideInstall ? '' : `<div class="card install-card">
      <button class="close" id="hideInstall" aria-label="Скрыть">✕</button>
      <div><b>📲 Установить как приложение</b><div class="muted small">Будет открываться с главного экрана и работать без интернета — пригодится в Китае.</div></div>
      <button class="btn primary sm" id="installBtn" ${installPrompt ? '' : 'hidden'}>Установить</button>
      ${installPrompt ? '' : '<div class="muted small">Android (Chrome): меню ⋮ → «Добавить на главный экран» / «Установить приложение».</div>'}
    </div>`}
    <h2>Путь до HSK 4</h2>
    <div class="card">${levelBars()}</div>
    <h2>Чем заняться</h2>
    <div class="sit-grid">
      <a class="sit" href="#/phrases"><span class="ic">💬</span><b>Фразы</b><small>такси, кафе, аренда, банк, врач</small></a>
      <a class="sit" href="#/tones"><span class="ic">🎵</span><b>Тренажёр тонов</b><small>учимся слышать тоны</small></a>
      <a class="sit" href="#/grammar"><span class="ic">📘</span><b>Грамматика</b><small>${ALL_GRAMMAR.length} коротких тем, HSK 1–4</small></a>
      <a class="sit" href="#/dict"><span class="ic">🔎</span><b>Словарь</b><small>${ALL_WORDS.length} слов и фраз</small></a>
    </div>
    <details class="card small howto"><summary><b>Как заниматься</b></summary>
      <ol style="margin:10px 0 0;padding-left:20px">
        <li>Один урок за 1–2 дня: слова → диалог → грамматика → домашка. Всё, что не получилось, можно «Доделать».</li>
        <li>Каждый день 5–10 минут карточек: система сама покажет, что пора повторить.</li>
        <li>Всё произносите <b>вслух</b>, даже если сидите один. Цель — говорить, а не узнавать.</li>
        <li>Перед ситуацией (аренда, банк, врач) откройте нужный раздел фраз и прогоните его с микрофоном 🎤.</li>
        <li>Раз в пару дней 5 минут тренажёра тонов: без тонов вас будут переспрашивать.</li>
      </ol>
    </details>
    ${!('speechSynthesis' in window) || !voices.length ? '<div class="notice">Если звук не работает: нужен китайский голос в системе. На iPhone/Mac: Настройки → Универсальный доступ → Устно → Голоса → Китайский. На Android: установите «Синтез речи Google» и китайский язык.</div>' : ''}
  `;
}

function levelBars() {
  const next = nextLesson();
  return HSK_DECKS.map((k) => {
    const d = DECKS[k], n = d.words.length;
    const inL = d.words.filter((w) => S.cards[w.id]).length;
    const solid = d.words.filter((w) => S.cards[w.id] && S.cards[w.id].iv >= 21).length;
    const lessons = course().filter((L) => L.lvl === d.level);
    const ld = lessons.filter(lessonState).length;
    const here = next.lvl === d.level;
    return `<details class="lvl-row path"${here ? ' open' : ''}><summary>
      <div class="row" style="justify-content:space-between"><b>${d.name}${here ? ' <span class="pill ok">вы здесь</span>' : ''}</b><span class="muted small">уроки ${ld}/${lessons.length} · слова ${inL}/${n} · выучено ${solid}</span></div>
      <div class="progress two"><div class="p-in" style="width:${(inL / n) * 100}%"></div><div class="p-solid" style="width:${(solid / n) * 100}%"></div></div></summary>
      <div class="path-list">${lessons.map((L) => {
        const st = lessonState(L), cur = L === next;
        return `<a href="#/lessons/i${L.n}" class="path-item ${st ? 'done' : ''} ${cur ? 'cur' : ''}"><span class="mk">${st ? '✓' : cur ? '▶' : '○'}</span><span class="nm">${L.num}${L.part ? '.' + L.part : ''}. <span class="hz">${esc(L.zh)}</span> <small class="muted">${esc(L.ru)}</small></span><span class="sc">${st ? st.score + '%' : cur ? 'следующий' : ''}</span></a>`;
      }).join('')}</div></details>`;
  }).join('') + '<p class="muted small" style="margin:4px 0 0">Нажмите на уровень, чтобы раскрыть список уроков: ✓ пройден, ▶ следующий, ○ впереди. Нажмите на урок — откроется его содержание. «Выучено» — слово держится в памяти 3+ недели.</p>';
}

/* ---------- Карточки ---------- */
let session = null;
function startSession() {
  const due = shuffle(dueCards());
  const nw = newCards();
  // новые вперемешку с повторением
  const q = [...due];
  nw.forEach((w, i) => q.splice(Math.min(q.length, (i + 1) * 3), 0, w));
  session = { queue: q.map((w) => w.id), total: q.length, done: 0, revealed: false, mode: null };
}
function cardMode(w) {
  const m = S.settings.mode;
  if (m !== 'mixed') return m;
  if (!S.cards[w.id]) return 'read'; // новое слово сначала просто знакомимся
  return pick(['read', 'listen', 'speak', 'speak']);
}
function renderLearn() {
  if (!session || !session.queue.length) startSession();
  if (!session.queue.length) {
    app.innerHTML = `<div class="card empty"><div class="big-emoji">🎉</div><h2>На сегодня всё!</h2>
      <p class="muted">Повторение на сегодня закончено. Новые слова приходят из уроков — карточки с ними появятся завтра.</p>
      <a class="btn primary big" href="#/lessons/${nextLesson().n}">Следующий урок →</a>
      <div class="row" style="justify-content:center;margin-top:10px"><a class="btn" href="#/review">✍️ Свободный повтор</a><a class="btn" href="#/phrases">💬 Фразы</a><a class="btn" href="#/tones">🎵 Тоны</a></div></div>`;
    session = null;
    setFocus(false);
    return;
  }
  setFocus(true, '#/');
  const w = WORD_BY_ID[session.queue[0]];
  if (!session.mode) session.mode = cardMode(w);
  const mode = session.mode;
  if (mode === 'type') return renderTypeCard(w);
  const isNew = !S.cards[w.id];
  const isPhrase = w.deck === 'phr';
  const pct = Math.round((session.done / Math.max(1, session.total)) * 100);
  const rv = session.revealed;
  const pyLine = `<div class="py">${colorPinyin(w.py)}</div>`;
  let front = '';
  if (mode === 'read') {
    front = `<div class="hz ${isPhrase ? 'phrase' : ''}">${esc(w.hz)}</div>${S.settings.showPinyin || rv ? pyLine : ''}`;
  } else if (mode === 'listen') {
    front = rv ? `<div class="hz ${isPhrase ? 'phrase' : ''}">${esc(w.hz)}</div>${pyLine}` : `<div>${playBtn(w.hz, 'big')}</div><div class="hint">Послушайте и вспомните значение</div>`;
  } else {
    front = `<div class="prompt">${esc(w.ru)}</div><div class="hint">${rv ? '' : 'Скажите вслух по-китайски, потом проверьте'}</div>`;
    if (rv) front += `<div class="hz ${isPhrase ? 'phrase' : ''}">${esc(w.hz)}</div>${pyLine}`;
  }
  const back = rv && mode !== 'speak' ? `<div class="ru">${esc(w.ru)}</div>` : '';
  const modeName = { read: 'Читаю → значение', listen: 'Слушаю → значение', speak: 'Говорю по-китайски' }[mode];
  app.innerHTML = `
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <span class="deck-tag">${DECKS[w.deck].name}${isNew ? ' · новое' : ''} · ${modeName}</span>
      <span class="muted small">${session.queue.length} осталось</span>
    </div>
    <div class="card flash">
      ${front}
      ${back}
      ${rv || mode !== 'listen' ? `<div class="row" style="justify-content:center">${(rv || mode === 'read') ? playBtn(w.hz) : ''}${rv ? `<button class="btn sm" data-say="${esc(w.hz)}" data-rate="0.5">🐢 медленно</button>` : ''}${rv && SR ? `<button class="btn sm" id="mic">🎤 Проверить произношение</button>` : ''}</div><div id="recres" class="rec-result"></div>` : ''}
    </div>
    ${rv ? `
      <div class="grades">
        <button class="again" data-g="0">Снова<small>${nextIvLabel(w.id, 0)}</small></button>
        <button data-g="1">Трудно<small>${nextIvLabel(w.id, 1)}</small></button>
        <button class="good" data-g="2">Хорошо<small>${nextIvLabel(w.id, 2)}</small></button>
        <button data-g="3">Легко<small>${nextIvLabel(w.id, 3)}</small></button>
      </div>` : `<button class="btn primary big" id="reveal">Показать ответ</button><p class="muted small" style="text-align:center">Пробел — показать, 1–4 — оценка</p>`}
  `;
  if (!rv && S.settings.autoplay && (mode === 'listen' || mode === 'read')) speak(w.hz);
  if (rv && S.settings.autoplay && mode === 'speak') speak(w.hz);
  const rb = document.getElementById('reveal');
  if (rb) rb.onclick = () => { session.revealed = true; renderLearn(); };
  app.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => answer(+b.dataset.g); });
  const mic = document.getElementById('mic');
  if (mic) mic.onclick = () => micCheck(w.hz, document.getElementById('recres'), mic);
}
// Карточка с вводом: русское слово → пишете по-китайски → озвучка и пример. Оценка ставится сама.
function renderTypeCard(w) {
  const st = session.tstate || 'ask';
  const tries = session.ttries || 0;
  const done = st !== 'ask';
  const ex = done ? exampleFor(w) : null;
  const pct = Math.round((session.done / Math.max(1, session.total)) * 100);
  app.innerHTML = `
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="row" style="justify-content:space-between;margin-bottom:8px">
      <span class="deck-tag">${DECKS[w.deck].name}${S.cards[w.id] ? '' : ' · новое'}</span>
      <span class="muted small">${session.queue.length} осталось</span>
    </div>
    <div class="card flash">
      <div class="muted small">Напишите по-китайски</div>
      <div class="prompt">${esc(w.ru)}</div>
      ${done ? `
        <div class="answer ${st === 'right' ? 'ok' : 'bad'}">${st === 'right' ? (tries ? '✅ Верно, со второй попытки' : '✅ Верно!') : '📖 Правильный ответ:'}</div>
        <div class="hz ${w.deck === 'phr' ? 'phrase' : ''}">${esc(w.hz)}</div>
        <div class="py">${colorPinyin(w.py)}</div>
        ${session.lastInput ? answerDiff(session.lastInput, w) : ''}
        <div class="row" style="justify-content:center">${playBtn(w.hz)}<button class="btn sm" data-say="${esc(w.hz)}" data-rate="0.5">🐢 медленно</button>${SR ? '<button class="btn sm" id="mic">🎤 Произношение</button>' : ''}</div>
        <div id="recres" class="rec-result"></div>
        ${ex ? `<div class="example"><div class="small muted">Пример</div><div class="row" style="gap:10px;flex-wrap:nowrap"><div style="flex:1"><div class="hz" style="font-size:20px">${esc(ex[0])}</div><div class="py small">${colorPinyin(ex[1])}</div><div class="small">${esc(ex[2])}</div></div>${playBtn(ex[0])}</div></div>` : ''}
      ` : `
        <input class="search answer-input" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${ansPlaceholder()}">
        <div id="fb" class="rec-result bad">${tries ? '❌ Неверно, попробуйте ещё раз' : ''}</div>
        <div class="row" style="justify-content:center"><button class="btn primary" id="check">Проверить</button><button class="btn" id="giveup">Не помню</button></div>`}
    </div>
    ${!done ? '' : '<div class="actions">'}${!done ? '' : st !== 'right' ? `<button class="btn primary big" data-tg="0">Дальше → <small style="font-weight:400">(повторю через пару карточек)</small></button>`
      : tries ? `<button class="btn primary big" data-tg="1">Дальше → <small style="font-weight:400">(следующий раз через ${nextIvLabel(w.id, 1)})</small></button>`
      : `<div class="grades" style="grid-template-columns:1fr 1fr"><button class="good" data-tg="2">Хорошо<small>через ${nextIvLabel(w.id, 2)} · Enter</small></button><button data-tg="3">Легко<small>через ${nextIvLabel(w.id, 3)}</small></button></div>`}${done ? '</div>' : ''}`;
  if (!done) {
    const inp = document.getElementById('ans'); inp.focus();
    const check = () => {
      if (!inp.value.trim()) return;
      if (checkAnswer(inp.value, w) || ALL_WORDS.some((o) => o.ru === w.ru && o !== w && checkAnswer(inp.value, o))) { session.tstate = 'right'; renderLearn(); }
      else { session.ttries = tries + 1; session.lastInput = inp.value.trim(); document.getElementById('fb').innerHTML = wrongMsg(inp.value, w); inp.select(); }
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); check(); } };
    document.getElementById('check').onclick = check;
    document.getElementById('giveup').onclick = () => { session.ttries = tries + 1; session.tstate = 'shown'; renderLearn(); };
  } else {
    if (S.settings.autoplay) speak(w.hz);
    app.querySelectorAll('[data-tg]').forEach((b) => { b.onclick = () => answer(+b.dataset.tg); });
    const first = app.querySelector('[data-tg]'); if (first) first.focus();
    const mic = document.getElementById('mic');
    if (mic) mic.onclick = () => micCheck(w.hz, document.getElementById('recres'), mic);
  }
}
function answer(g) {
  const id = session.queue.shift();
  grade(id, g);
  if (g === 0) session.queue.splice(Math.min(session.queue.length, 3), 0, id);
  else session.done++;
  session.revealed = false; session.mode = null; session.tstate = null; session.ttries = 0; session.lastInput = '';
  renderLearn();
}
document.addEventListener('keydown', (e) => {
  if (!location.hash.startsWith('#/learn') || !session || e.target.matches('input,select,textarea,button')) return;
  if (session.mode === 'type') return;
  if (!session.revealed && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); session.revealed = true; renderLearn(); }
  else if (session.revealed && ['1', '2', '3', '4'].includes(e.key)) answer(+e.key - 1);
});

function micCheck(target, out, btn, onScore) {
  out.className = 'rec-result'; out.textContent = '🎙 Говорите...';
  if (btn) btn.disabled = true;
  listen((alts) => {
    if (btn) btn.disabled = false;
    const best = alts.map((a) => ({ a, s: similarity(target, a) })).sort((x, y) => y.s - x.s)[0];
    const pct = Math.round(best.s * 100);
    out.className = 'rec-result ' + (pct >= 80 ? 'ok' : 'bad');
    const d = charDiff(best.a, target);
    out.innerHTML = `${pct >= 80 ? '✅ Отлично!' : pct >= 50 ? '🟡 Почти' : '❌ Не похоже'} (${pct}%)<div>Распознано: <span class="hz diff">${d.a || '—'}</span></div>${d.miss ? `<div>Образец: <span class="hz diff">${d.t}</span> <span class="small">— подчёркнуто то, что не получилось</span></div>` : ''}`;
    if (onScore) onScore(pct);
  }, (err) => { if (btn) btn.disabled = false; out.className = 'rec-result bad'; out.textContent = err; });
}

/* ---------- Примеры предложений ---------- */
const EXAMPLES = {};
EXAMPLES_RAW.trim().split('\n').forEach((l) => { const [w, hz, py, ru] = l.split('|'); EXAMPLES[w] = [hz, py, ru]; });
const EX_CORPUS = [
  ...Object.values(EXAMPLES),
  ...SITUATIONS.flatMap((s) => s.phrases.map((p) => [p[0], p[1], p[2]])),
  ...ALL_GRAMMAR.flatMap((g) => g.ex),
  ...(typeof COURSE !== 'undefined' ? COURSE.flatMap((L) => [...L.gram.flatMap((g) => g.ex), ...L.dlg.map((d) => d.slice(1))]) : []),
].filter((e) => !e[0].includes('…'));
function exampleFor(w) {
  if (w.deck === 'phr') return null;
  if (EXAMPLES[w.hz]) return EXAMPLES[w.hz];
  const found = EX_CORPUS.filter((e) => e[0].includes(w.hz) && e[0] !== w.hz + '。');
  if (!found.length) return null;
  return found.sort((a, b) => a[0].length - b[0].length)[0];
}

/* ---------- Повтор: свободная тренировка с вводом ---------- */
function numberedPinyin(py) {
  return syllables(py).map((x) => { const t = toneOf(x); return plain(x).replace(/'/g, '') + (t < 5 ? t : ''); }).join('');
}
function checkAnswer(input, w) {
  const raw = input.trim();
  if (!raw) return false;
  if (/[一-鿿]/.test(raw)) return normHz(raw) === normHz(w.hz);
  if (S.settings.hanziOnly) return false;
  const inp = raw.toLowerCase().replace(/v/g, 'u').replace(/ü/g, 'u').replace(/[\s'’.,!?。，！？…—-]/g, '');
  if (/\d/.test(inp)) return inp.replace(/[05]/g, '') === numberedPinyin(w.py);
  return plain(inp) === plain(w.py).replace(/[\s'’.,!?。，！？…—-]/g, '');
}
function nHz(n) { return n % 10 === 1 && n % 100 !== 11 ? 'иероглиф' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'иероглифа' : 'иероглифов'; }
// Сообщение об ошибке с подсветкой: что именно не так в ответе (HTML).
function wrongMsg(input, w) {
  const hasHz = /[一-鿿]/.test(input);
  if (S.settings.hanziOnly && !hasHz) return '⌨️ Нужны иероглифы: наберите пиньинь на китайской клавиатуре и выберите нужный иероглиф';
  if (!w) return '❌ Неверно, попробуйте ещё раз';
  if (hasHz) {
    const d = charDiff(input, w.hz);
    const len = [...normHz(w.hz)].length;
    const notes = [];
    if (d.extra) notes.push(d.extra === [...normHz(input)].length ? 'ни один иероглиф не подходит' : 'красным — неверные или лишние');
    if (d.miss) notes.push(`не хватает ${d.miss} ${nHz(d.miss)}`);
    return `❌ Ваш ответ: <span class="hz diff">${d.a}</span><div class="small">${notes.join(', ')} · в слове ${len} ${nHz(len)}. Попробуйте ещё раз.</div>`;
  }
  const d = pinyinDiff(input, w.py);
  return `❌ Ваш ответ: <span class="diff">${d.html}</span><div class="small">${d.bad ? 'красным — неверные слоги' : ''}${d.bad && d.miss ? ', ' : ''}${d.miss ? `не хватает слогов: ${d.miss}` : ''}. Попробуйте ещё раз.</div>`;
}
// Блок «Вы написали → правильно» после показа ответа.
function answerDiff(input, w) {
  if (!input) return '';
  if (/[一-鿿]/.test(input)) {
    const d = charDiff(input, w.hz);
    return `<div class="diff-box small">Вы написали: <span class="hz diff">${d.a}</span> → правильно: <span class="hz diff">${d.t}</span></div>`;
  }
  return `<div class="diff-box small">Вы написали: <span class="diff">${pinyinDiff(input, w.py).html}</span></div>`;
}
function ansPlaceholder() { return S.settings.hanziOnly ? 'Введите иероглифы' : 'Иероглифы или пиньинь'; }
function ansHint() { return S.settings.hanziOnly ? '⌨️ Китайская клавиатура: наберите пиньинь и выберите иероглиф' : 'Тоны можно не ставить. ü пишется как v или u.'; }
function dayLabel(key) {
  if (key === todayKey()) return 'Сегодня';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (key === todayKey(y)) return 'Вчера';
  const [Y, M, D] = key.split('-').map(Number);
  return new Date(Y, M - 1, D).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
}
function startedIn(deck) { return DECKS[deck].words.filter((w) => S.cards[w.id]); }
function reviewSets() {
  const sets = {};
  const started = ALL_WORDS.filter((w) => S.cards[w.id]);
  Object.keys(S.days).sort().reverse().forEach((k) => {
    const added = started.filter((w) => S.cards[w.id].added === k);
    const seen = (S.days[k].ids || []).map((id) => WORD_BY_ID[id]).filter(Boolean);
    if (added.length) sets['new:' + k] = { name: `${dayLabel(k)}: новые слова`, words: added };
    if (seen.length) sets['seen:' + k] = { name: `${dayLabel(k)}: всё, что повторялось`, words: seen };
  });
  [...HSK_DECKS, 'life'].forEach((k) => {
    sets['started:' + k] = { name: `${DECKS[k].name}: начатые`, words: startedIn(k) };
    sets['all:' + k] = { name: `${DECKS[k].name}: все слова`, words: DECKS[k].words };
  });
  SITUATIONS.forEach((s) => {
    sets['sit:' + s.id] = { name: `${s.icon} ${s.title}`, words: DECKS.phr.words.filter((w) => w.sit === s.title) };
  });
  if (typeof course === 'function') course().forEach((L) => {
    sets['lesson:' + L.key] = { name: `${lessonName(L)} · ${L.zh}`, words: L.ids.map((id) => WORD_BY_ID[id]), L };
  });
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6);
  sets.hard = { name: 'Трудные слова', words: started.filter((w) => S.cards[w.id].lapses > 0 || S.cards[w.id].ef < 2.3) };
  sets.week = { name: 'Изученные за 7 дней', words: started.filter((w) => S.cards[w.id].added >= todayKey(weekAgo)) };
  sets.started = { name: 'Все начатые слова', words: started };
  sets.mistakes = { name: 'Ошибки в повторе', words: (S.mistakes || []).map((id) => WORD_BY_ID[id]).filter(Boolean) };
  return sets;
}
let rv = null; // текущая тренировка
function chip(key, set) {
  const n = set.words.length;
  return `<button class="chip" data-set="${esc(key)}" ${n ? '' : 'disabled'}>${esc(set.name)} <b>${n}</b></button>`;
}
function renderReview(arg) {
  if (arg === 'go' && rv) return drawReviewCard();
  const sets = reviewSets();
  const size = S.settings.reviewSize || 20;
  const dayKeys = Object.keys(sets).filter((k) => k.startsWith('new:') || k.startsWith('seen:')).slice(0, 28);
  app.innerHTML = `<h1>Повтор</h1>
    <p class="muted">Свободная тренировка: появляется слово по-русски, вы вводите его по-китайски — иероглифами или пиньинем (<b>nihao</b>, <b>ni3hao3</b>). После верного ответа — озвучка и пример. Ошибки попадают в «Ошибки в повторе», а начатые слова, которые вы не вспомнили, — ещё и в ближайшее основное повторение.</p>
    <div class="row" style="margin-bottom:8px"><span class="small">Слов за раз:</span>
      <div class="seg" id="rsize">${[10, 20, 50, 0].map((n) => `<button data-n="${n}" class="${size === n ? 'on' : ''}">${n || 'все'}</button>`).join('')}</div></div>
    <h2>Особые</h2>
    <div class="chips">${['mistakes', 'hard', 'week', 'started'].map((k) => chip(k, sets[k])).join('')}</div>
    <h2>По урокам</h2>
    ${lessonReviewBox(sets)}
    <h2>По дням</h2>
    ${dayKeys.length ? `<div class="chips">${dayKeys.map((k) => chip(k, sets[k])).join('')}</div>` : '<p class="muted small">Здесь появятся дни занятий, как только вы пройдёте первые карточки во вкладке «Учить».</p>'}
    <h2>По уровням</h2>
    <div class="chips">${[...HSK_DECKS, 'life'].flatMap((k) => [chip('started:' + k, sets['started:' + k]), chip('all:' + k, sets['all:' + k])]).join('')}</div>
    <h2>По ситуациям (фразы)</h2>
    <div class="chips">${SITUATIONS.map((s) => chip('sit:' + s.id, sets['sit:' + s.id])).join('')}</div>`;
  app.querySelectorAll('#rsize [data-n]').forEach((b) => { b.onclick = () => { S.settings.reviewSize = +b.dataset.n; save(); renderReview(); }; });
  app.querySelectorAll('[data-set]').forEach((b) => { b.onclick = () => startReview(sets[b.dataset.set]); });
  const lsel = document.getElementById('lsel');
  if (lsel) {
    const lgo = document.getElementById('lgo');
    lsel.onchange = () => { try { localStorage.setItem('zh-review-lesson', lsel.value); } catch (e) { /* нет хранилища */ } };
    lgo.onclick = () => startReview(sets[lsel.value]);
  }
}
// Повтор слов конкретного урока: сначала пройденные/начатые уроки, остальные — ниже в списке.
function lessonReviewBox(sets) {
  if (typeof course !== 'function') return '';
  const c = course();
  const opened = c.filter((L) => lessonState(L) || L.ids.some((id) => S.cards[id]));
  const recent = [...opened].sort((a, b) => ((lessonState(b) || {}).date || '').localeCompare((lessonState(a) || {}).date || '')).slice(0, 4);
  let saved = null; try { saved = localStorage.getItem('zh-review-lesson'); } catch (e) { /* нет хранилища */ }
  const cur = sets[saved] ? saved : 'lesson:' + (recent[0] || nextLesson()).key;
  const opt = (L) => `<option value="lesson:${L.key}" ${'lesson:' + L.key === cur ? 'selected' : ''}>${lessonState(L) ? '✓' : L.ids.some((id) => S.cards[id]) ? '◐' : '○'} ${esc(lessonName(L))} · ${esc(L.zh)}</option>`;
  const groups = [1, 2, 3, 4].map((lv) => `<optgroup label="HSK ${lv}">${c.filter((L) => L.lvl === lv).map(opt).join('')}</optgroup>`).join('');
  return `${recent.length ? `<div class="chips">${recent.map((L) => chip('lesson:' + L.key, { name: `HSK${L.lvl} · ${L.num}${L.part ? '.' + L.part : ''} ${L.zh}`, words: sets['lesson:' + L.key].words })).join('')}</div>` : ''}
    <div class="row lesson-pick"><select id="lsel" aria-label="Урок">${groups}</select><button class="btn primary" id="lgo">Повторить слова урока</button></div>
    <p class="muted small" style="margin-top:4px">✓ пройден · ◐ слова уже в карточках · ○ ещё не начат</p>`;
}
function startReview(set) {
  const size = S.settings.reviewSize || 20;
  let words = shuffle([...set.words]);
  if (size) words = words.slice(0, size);
  rv = { name: set.name, queue: words.map((w) => w.id), total: words.length, right: 0, wrong: [], state: 'ask', tries: 0, retried: {}, said: {} };
  location.hash = '#/review/go';
}
function drawReviewCard() {
  if (!rv.queue.length) {
    const wrongWords = rv.wrong.map((id) => WORD_BY_ID[id]);
    const saidIds = Object.keys(rv.said || {});
    const weakSaid = saidIds.filter((id) => rv.said[id] < 80);
    app.innerHTML = `<div class="card empty"><div class="big-emoji">${rv.wrong.length ? '💪' : '🎉'}</div>
      <h2>${esc(rv.name)}: готово</h2>
      <p>С первой попытки: <b>${rv.right}</b> из ${rv.total}</p>
      ${wrongWords.length ? `<p class="muted small">Было трудно: ${wrongWords.map((w) => `<span class="hz">${esc(w.hz)}</span>`).join(', ')}</p>` : ''}
      ${saidIds.length ? `<p>Произношение: <b>${Math.round(saidIds.reduce((a, id) => a + rv.said[id], 0) / saidIds.length)}%</b> <span class="muted small">(проверено слов: ${saidIds.length})</span></p>` : ''}
      ${weakSaid.length ? `<p class="muted small">Потренируйте вслух: ${weakSaid.map((id) => `<span class="hz">${esc(WORD_BY_ID[id].hz)}</span> ${rv.said[id]}%`).join(', ')}</p>` : ''}
      <div class="row" style="justify-content:center">
        ${wrongWords.length ? '<button class="btn primary" id="again">Повторить ошибки</button>' : ''}
        <a class="btn" href="#/review">К списку</a></div></div>`;
    const a = document.getElementById('again');
    if (a) a.onclick = () => { startReview({ name: 'Ошибки', words: wrongWords }); router(); };
    return;
  }
  const w = WORD_BY_ID[rv.queue[0]];
  const pct = Math.round(((rv.total - rv.queue.length) / Math.max(1, rv.total)) * 100);
  const done = rv.state !== 'ask';
  const ex = done ? exampleFor(w) : null;
  app.innerHTML = `
    <div class="row" style="justify-content:space-between;margin-bottom:8px"><b class="small">${esc(rv.name)}</b><span class="muted small">${rv.queue.length} осталось</span></div>
    <div class="progress"><div style="width:${pct}%"></div></div>
    <div class="card flash">
      <div class="prompt">${esc(w.ru)}</div>
      <div class="hint">${DECKS[w.deck].name}${w.sit ? ' · ' + esc(w.sit) : ''}</div>
      ${done ? `
        <div class="answer ${rv.state === 'right' ? 'ok' : 'bad'}">${rv.state === 'right' ? '✅ Верно!' : '📖 Правильный ответ:'}</div>
        <div class="hz ${w.deck === 'phr' ? 'phrase' : ''}">${esc(w.hz)}</div>
        <div class="py">${colorPinyin(w.py)}</div>
        ${rv.lastInput ? answerDiff(rv.lastInput, w) : ''}
        <div class="row" style="justify-content:center">${playBtn(w.hz)}<button class="btn sm" data-say="${esc(w.hz)}" data-rate="0.5">🐢 медленно</button></div>
        ${SR ? `<button class="btn big ${rv.said[w.id] != null ? '' : 'primary'}" id="mic" style="margin-top:10px">🎤 ${rv.said[w.id] != null ? 'Сказать ещё раз' : 'Скажите вслух — проверю произношение'}</button><div id="recres" class="rec-result" style="text-align:center"></div>` : ''}
        ${ex ? `<div class="example"><div class="small muted">Пример</div>
          <div class="row" style="gap:10px;justify-content:center;flex-wrap:nowrap"><div style="text-align:left"><div class="hz" style="font-size:22px">${esc(ex[0])}</div><div class="py small">${colorPinyin(ex[1])}</div><div class="small">${esc(ex[2])}</div></div>${playBtn(ex[0])}</div></div>` : ''}
      ` : `
        <input class="search answer-input" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${ansPlaceholder()}">
        <div id="fb" class="rec-result">${rv.tries ? '❌ Неверно, попробуйте ещё раз' : ''}</div>
        <div class="row" style="justify-content:center">
          <button class="btn primary" id="check">Проверить</button>
          <button class="btn" id="giveup">Не помню</button>
        </div>
        <p class="hint">${ansHint()}</p>`}
    </div>
    ${done ? '<div class="actions"><button class="btn primary big" id="next">Дальше →</button></div>' : ''}`;
  if (!done) {
    const inp = document.getElementById('ans');
    inp.focus();
    const check = () => {
      if (!inp.value.trim()) return;
      if (checkAnswer(inp.value, w) || ALL_WORDS.some((o) => o.ru === w.ru && o !== w && checkAnswer(inp.value, o))) { if (!rv.tries) rv.right++; rv.state = 'right'; finishWord(w); }
      else { rv.tries++; rv.lastInput = inp.value.trim(); document.getElementById('fb').className = 'rec-result bad'; document.getElementById('fb').innerHTML = wrongMsg(inp.value, w); inp.select(); }
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); check(); } };
    document.getElementById('check').onclick = check;
    document.getElementById('giveup').onclick = () => { rv.tries++; rv.state = 'shown'; finishWord(w); };
  } else {
    speak(w.hz);
    const nx = document.getElementById('next');
    nx.onclick = nextReview;
    nx.focus();
    const mic = document.getElementById('mic');
    if (mic) mic.onclick = () => micCheck(w.hz, document.getElementById('recres'), mic, (p) => {
      rv.said[w.id] = Math.max(rv.said[w.id] || 0, p); mic.classList.remove('primary'); mic.textContent = '🎤 Сказать ещё раз'; nx.focus();
    });
  }
}
function finishWord(w) {
  if (rv.tries) {
    if (!rv.wrong.includes(w.id)) rv.wrong.push(w.id);
    S.mistakes = [w.id, ...(S.mistakes || []).filter((x) => x !== w.id)].slice(0, 200);
    if (S.cards[w.id]) S.cards[w.id].due = Math.min(S.cards[w.id].due, Date.now());
  } else if (S.mistakes && rv.retried[w.id] === undefined) {
    S.mistakes = S.mistakes.filter((x) => x !== w.id);
  }
  save();
  drawReviewCard();
}
function nextReview() {
  const id = rv.queue.shift();
  if (rv.tries && !rv.retried[id]) { rv.retried[id] = true; rv.queue.push(id); }
  rv.state = 'ask'; rv.tries = 0; rv.lastInput = '';
  drawReviewCard();
}
document.addEventListener('keydown', (e) => {
  if (location.hash === '#/review/go' && rv && rv.state !== 'ask' && e.key === 'Enter' && !e.target.matches('button,input')) { e.preventDefault(); nextReview(); }
});

/* ---------- Фразы ---------- */
let phraseView = { hidePy: false, hideRu: false };
function renderPhrases(id) {
  const sit = SITUATIONS.find((s) => s.id === id);
  if (!sit) {
    app.innerHTML = `<h1>Фразы для жизни</h1>
      <p class="muted">Выберите ситуацию. Фразы с пометкой «услышите» говорят вам — их важно понимать на слух.</p>
      <div class="sit-grid">${SITUATIONS.map((s) => `<a class="sit" href="#/phrases/${s.id}"><span class="ic">${s.icon}</span><b>${s.title}</b><small>${s.phrases.length} фраз</small></a>`).join('')}</div>`;
    return;
  }
  const cls = (phraseView.hidePy ? 'hide-py ' : '') + (phraseView.hideRu ? 'hide-ru' : '');
  app.innerHTML = `
    <p><a href="#/phrases">← Все ситуации</a></p>
    <h1>${sit.icon} ${sit.title}</h1>
    <div class="row" style="margin-bottom:12px">
      <button class="btn sm" id="playall">▶️ Прослушать все</button>
      <label class="check small"><input type="checkbox" id="hpy" ${phraseView.hidePy ? 'checked' : ''}> скрыть пиньинь</label>
      <label class="check small"><input type="checkbox" id="hru" ${phraseView.hideRu ? 'checked' : ''}> скрыть перевод</label>
    </div>
    <div class="card ${cls}" id="plist">
      ${sit.phrases.map((p, i) => `
        <div class="phrase">
          <div class="body">
            <div class="hz">${esc(p[0])}${p[3] ? '<span class="hear-tag">услышите</span>' : ''}</div>
            <div class="py py-toggle reveal-on-tap">${colorPinyin(p[1])}</div>
            <div class="ru ru-toggle reveal-on-tap">${esc(p[2])}</div>
            <div class="rec-result" id="rr${i}"></div>
          </div>
          <div class="tools">
            ${playBtn(p[0])}
            <button class="play" data-say="${esc(p[0])}" data-rate="0.5" aria-label="Медленно">🐢</button>
            ${SR && !p[3] ? `<button class="play" data-mic="${i}" aria-label="Проверить произношение">🎤</button>` : ''}
          </div>
        </div>`).join('')}
    </div>
    <p class="muted small">🔊 — обычная скорость, 🐢 — медленно, 🎤 — скажите фразу, сайт проверит, понял ли он вас. Скрыв перевод, тренируйтесь понимать на слух; нажмите на скрытую строку, чтобы подсмотреть.</p>
  `;
  document.getElementById('hpy').onchange = (e) => { phraseView.hidePy = e.target.checked; renderPhrases(id); };
  document.getElementById('hru').onchange = (e) => { phraseView.hideRu = e.target.checked; renderPhrases(id); };
  app.querySelectorAll('.reveal-on-tap').forEach((el) => { el.onclick = () => { el.style.visibility = 'visible'; }; });
  app.querySelectorAll('[data-mic]').forEach((b) => { b.onclick = () => micCheck(sit.phrases[+b.dataset.mic][0], document.getElementById('rr' + b.dataset.mic), b); });
  document.getElementById('playall').onclick = () => playAll(sit.phrases.map((p) => p[0]));
}
function playAll(list) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const v = voices.find((x) => x.name === S.settings.voice) || voices[0];
  list.forEach((t) => {
    const u = new SpeechSynthesisUtterance(t.replace(/…/g, ''));
    u.lang = 'zh-CN'; u.rate = S.settings.rate; if (v) u.voice = v;
    speechSynthesis.speak(u);
  });
}

/* ---------- Тоны ---------- */
const TONE_PATH = { 1: 'M4 8 L36 8', 2: 'M4 24 L36 6', 3: 'M4 18 L16 30 L36 10', 4: 'M4 6 L36 32', 5: 'M16 20 L22 20' };
function toneSvg(n, size = 40) {
  return `<svg class="tone-svg t${n}" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><path d="${TONE_PATH[n]}" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
const TONE_POOL = ALL_WORDS.filter((w) => w.deck !== 'phr' && [...w.hz].length <= 2 && [...w.hz].length === tonesOf(w.py).length && !/儿$/.test(w.hz));
let toneQ = null;
function newToneQ(len) {
  const pool = TONE_POOL.filter((w) => [...w.hz].length === len);
  const w = pick(pool);
  const right = tonesOf(w.py).join('-');
  const opts = new Set([right]);
  const allowed = len === 1 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
  while (opts.size < 4) {
    const t = tonesOf(w.py).map((x) => x);
    const k = Math.floor(Math.random() * len);
    t[k] = pick(allowed.filter((a) => a !== t[k] && !(k === 0 && a === 5)));
    if (len === 2 && Math.random() < 0.4) { const k2 = 1 - k; t[k2] = pick(allowed.filter((a) => !(k2 === 0 && a === 5))); }
    opts.add(t.join('-'));
  }
  toneQ = { w, len, right, opts: shuffle([...opts]), chosen: null };
}
function renderTones() {
  if (!toneQ) newToneQ(1);
  const q = toneQ;
  const T = S.tones;
  const lbl = (s) => s.split('-').map((n) => `<span class="t${n}">${n === '5' ? '0' : n}</span>`).join(' ');
  app.innerHTML = `
    <h1>Тренажёр тонов</h1>
    <div class="row" style="margin-bottom:12px">
      <div class="seg"><button data-len="1" class="${q.len === 1 ? 'on' : ''}">1 слог</button><button data-len="2" class="${q.len === 2 ? 'on' : ''}">2 слога</button></div>
      <span class="muted small">Верно: ${T.right}/${T.total} · рекорд серии: ${T.best}</span>
    </div>
    <div class="card" style="text-align:center">
      <p class="muted small" style="margin-top:0">Послушайте слово и выберите тоны (0 — нейтральный)</p>
      <div class="row" style="justify-content:center;margin-bottom:16px">${playBtn(q.w.hz, 'big')}<button class="btn sm" data-say="${esc(q.w.hz)}" data-rate="0.5">🐢 медленно</button></div>
      <div class="tones-opts">
        ${q.opts.map((o) => {
          let c = '';
          if (q.chosen) { if (o === q.right) c = 'right'; else if (o === q.chosen) c = 'wrong'; }
          return `<button data-opt="${o}" class="${c}" ${q.chosen ? 'disabled' : ''}>${lbl(o)} <span style="vertical-align:middle">${o.split('-').map((n) => toneSvg(+n, 26)).join('')}</span></button>`;
        }).join('')}
      </div>
      ${q.chosen ? `
        <div style="margin-top:16px">
          <div class="hz" style="font-size:40px">${esc(q.w.hz)}</div>
          <div class="py" style="font-size:20px">${colorPinyin(q.w.py)}</div>
          <div>${esc(q.w.ru)}</div>
          <button class="btn primary big" id="nextTone" style="margin-top:12px">Дальше →</button>
        </div>` : ''}
    </div>
    <h2>Шпаргалка по тонам</h2>
    ${TONE_INFO.map((t) => `
      <div class="card tone-row">
        ${toneSvg(t.n)}
        <div style="flex:1"><h3 class="t${t.n}">${t.name}</h3><div class="small muted">${t.desc}</div>
        <div class="small"><span class="hz">${t.ex[0]}</span> ${t.ex[1]} — ${t.ex[2]}</div></div>
        ${playBtn(t.ex[0])}
      </div>`).join('')}
    <div class="card small">
      <h3>Изменения тонов в речи</h3>
      <ul style="margin:0;padding-left:20px">
        <li><b>3 + 3 → 2 + 3:</b> 你好 читается <span class="t2">ní</span> <span class="t3">hǎo</span>. ${playBtn('你好')}</li>
        <li><b>不 перед 4-м тоном → bú:</b> 不是 <span class="t2">bú</span> <span class="t4">shì</span>. ${playBtn('不是')}</li>
        <li><b>一:</b> перед 4-м тоном → yí (一个 yí ge), перед остальными → yì (一起 yìqǐ), в счёте — yī. ${playBtn('一个')}</li>
      </ul>
    </div>
  `;
  app.querySelectorAll('[data-len]').forEach((b) => { b.onclick = () => { newToneQ(+b.dataset.len); renderTones(); speak(toneQ.w.hz); }; });
  app.querySelectorAll('[data-opt]').forEach((b) => {
    b.onclick = () => {
      q.chosen = b.dataset.opt;
      T.total++;
      if (q.chosen === q.right) { T.right++; T.cur = (T.cur || 0) + 1; T.best = Math.max(T.best, T.cur); } else T.cur = 0;
      save(); renderTones(); speak(q.w.hz);
    };
  });
  const nb = document.getElementById('nextTone');
  if (nb) nb.onclick = () => { newToneQ(q.len); renderTones(); speak(toneQ.w.hz); };
}

/* ---------- Грамматика ---------- */
function renderGrammar() {
  const groups = [[2, 'HSK 1–2: основа'], [3, 'HSK 3'], [4, 'HSK 4']];
  let n = 0;
  app.innerHTML = `<h1>Грамматика</h1>
    <p class="muted">Короткие темы для разговора, от HSK 1 до HSK 4. Каждый пример можно прослушать.</p>
    ${groups.map(([lv, name]) => `<h2>${name}</h2>` + ALL_GRAMMAR.filter((g) => g.lvl === lv).map((g) => { const i = n++; return `
      <details class="gram" ${i === 0 ? 'open' : ''}>
        <summary>${i + 1}. ${g.title}</summary>
        <div class="inner">
          <p style="margin-top:0">${g.text}</p>
          ${g.ex.map((e) => `<div class="phrase"><div class="body"><div class="hz">${esc(e[0])}</div><div class="py">${colorPinyin(e[1])}</div><div class="ru">${esc(e[2])}</div></div><div class="tools">${playBtn(e[0])}</div></div>`).join('')}
        </div>
      </details>`; }).join('')).join('')}`;
}

/* ---------- Словарь ---------- */
let dictQuery = '';
function renderDict() {
  app.innerHTML = `<h1>Словарь</h1>
    <input class="search" id="q" type="search" placeholder="Поиск: 你好, nihao, привет..." value="${esc(dictQuery)}" autocomplete="off">
    <p class="muted small" id="cnt"></p>
    <div class="card" id="res" style="padding-top:4px;padding-bottom:4px"></div>`;
  const q = document.getElementById('q');
  q.oninput = () => { dictQuery = q.value; drawDict(); };
  drawDict();
  if (window.innerWidth > 700) q.focus();
}
function drawDict() {
  const raw = dictQuery.trim().toLowerCase();
  const pq = plain(raw).replace(/[\s']/g, '');
  const list = !raw ? ALL_WORDS : ALL_WORDS.filter((w) =>
    w.hz.includes(raw) || plain(w.py).replace(/[\s'.,!?…-]/g, '').includes(pq) || w.ru.toLowerCase().includes(raw));
  const shown = list.slice(0, 200);
  document.getElementById('cnt').textContent = `Найдено: ${list.length}${list.length > 200 ? ' (показаны первые 200)' : ''}`;
  document.getElementById('res').innerHTML = shown.map((w) => {
    const c = S.cards[w.id];
    const st = !c ? '' : c.iv >= 21 ? '<span class="dot" style="background:var(--ok)"></span>' : '<span class="dot" style="background:var(--warn)"></span>';
    return `<div class="word-row"><div class="hz">${esc(w.hz)}</div><div class="meta"><div>${colorPinyin(w.py)}</div><div class="small">${esc(w.ru)}</div><div class="lvl">${st}${DECKS[w.deck].name}</div></div>${playBtn(w.hz)}</div>`;
  }).join('') || '<p class="muted">Ничего не найдено</p>';
}

/* ---------- Настройки ---------- */
function renderSettings() {
  const st = S.settings;
  const deckRows = PRACTICAL_DECKS.map((k) => [k, DECKS[k]]).map(([k, d]) => {
    const total = d.words.length, inLearn = d.words.filter((w) => S.cards[w.id]).length;
    return `<label class="check"><input type="checkbox" data-deck="${k}" ${st.decks[k] ? 'checked' : ''}> ${d.name} <span class="muted small">(${inLearn}/${total} в изучении)</span></label>`;
  }).join('');
  app.innerHTML = `<h1>Настройки</h1>
    <div class="card">
      <div class="field"><label class="lbl" for="ml">Учить слова до уровня</label>
        <select id="ml">${[1, 2, 3, 4].map((l) => `<option value="${l}" ${st.maxLevel === l ? 'selected' : ''}>HSK ${l}</option>`).join('')}</select>
        <p class="muted small">Слова всё равно идут по порядку с HSK 1; это просто потолок.</p></div>
      <div class="field"><label class="lbl">Практичные наборы</label>${deckRows}</div>
      <div class="field"><label class="lbl" for="np">Дополнительно новых карточек в день (сверх уроков)</label><input type="number" id="np" min="0" max="100" value="${st.newPerDay}"></div>
      <div class="field"><label class="lbl">Режим карточек</label>
        <div class="seg" id="mode">${[['type', 'Пишу ответ'], ['mixed', 'Смешанный'], ['read', 'Читаю'], ['listen', 'Слушаю'], ['speak', 'Говорю']].map(([k, n]) => `<button data-m="${k}" class="${st.mode === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <p class="muted small">«Пишу ответ» (по умолчанию): русское слово → вводите по-китайски → озвучка и пример, оценка ставится сама. Смешанный: новые слова сначала показываются с иероглифом, потом сайт чередует «на слух» и «скажи по-китайски».</p>
      </div>
      <label class="check"><input type="checkbox" id="sp" ${st.showPinyin ? 'checked' : ''}> Показывать пиньинь сразу</label>
      <label class="check"><input type="checkbox" id="ap" ${st.autoplay ? 'checked' : ''}> Автоматически озвучивать</label>
      <label class="check"><input type="checkbox" id="ho" ${st.hanziOnly ? 'checked' : ''}> Отвечать только иероглифами</label>
      <p class="muted small">Тренирует набор на телефоне: печатаете пиньинь на китайской клавиатуре и выбираете нужный иероглиф (как в WeChat). Выключите, чтобы принимался и пиньинь.</p>
    </div>
    <div class="card">
      <div class="field"><label class="lbl" for="vc">Голос</label>
        <select id="vc">${voices.length ? voices.map((v) => `<option ${v.name === st.voice ? 'selected' : ''}>${esc(v.name)}</option>`).join('') : '<option>Китайский голос не найден</option>'}</select>
        <button class="btn sm" data-say="你好，我叫阿尔乔姆。我在学汉语。">Проверить</button>
      </div>
      <div class="field"><label class="lbl" for="rt">Скорость речи: <span id="rtv">${st.rate}</span></label><input type="range" id="rt" min="0.4" max="1.2" step="0.05" value="${st.rate}"></div>
    </div>
    <div class="card">
      <h3>Прогресс</h3>
      <p class="muted small">Прогресс хранится только в этом браузере. Чтобы перенести его на телефон или не потерять, сохраните файл и загрузите на другом устройстве.</p>
      <div class="row">
        <button class="btn sm" id="exp">💾 Сохранить в файл</button>
        <label class="btn sm">📂 Загрузить из файла<input type="file" id="imp" accept=".json,application/json" hidden></label>
        <button class="btn sm" id="rst" style="color:var(--bad)">Сбросить всё</button>
      </div>
    </div>`;
  app.querySelectorAll('[data-deck]').forEach((c) => { c.onchange = () => { st.decks[c.dataset.deck] = c.checked; session = null; save(); }; });
  document.getElementById('ml').onchange = (e) => { st.maxLevel = +e.target.value; session = null; save(); };
  document.getElementById('np').onchange = (e) => { st.newPerDay = Math.max(0, Math.min(100, +e.target.value || 0)); session = null; save(); };
  app.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { st.mode = b.dataset.m; save(); renderSettings(); }; });
  document.getElementById('sp').onchange = (e) => { st.showPinyin = e.target.checked; save(); };
  document.getElementById('ap').onchange = (e) => { st.autoplay = e.target.checked; save(); };
  document.getElementById('ho').onchange = (e) => { st.hanziOnly = e.target.checked; save(); };
  document.getElementById('vc').onchange = (e) => { st.voice = e.target.value; save(); };
  document.getElementById('rt').oninput = (e) => { st.rate = +e.target.value; document.getElementById('rtv').textContent = st.rate; save(); };
  document.getElementById('exp').onclick = () => {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `chinese-progress-${todayKey()}.json`; a.click();
  };
  document.getElementById('imp').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => { const d = JSON.parse(t); if (!d.cards) throw new Error(); localStorage.setItem(STORE_KEY, JSON.stringify(d)); S = load(); session = null; toast('Прогресс загружен'); renderSettings(); })
      .catch(() => toast('Не удалось прочитать файл'));
  };
  document.getElementById('rst').onclick = () => {
    if (confirm('Удалить весь прогресс? Это нельзя отменить.')) { localStorage.removeItem(STORE_KEY); S = load(); session = null; toast('Прогресс сброшен'); renderSettings(); }
  };
}

if ('speechSynthesis' in window) speechSynthesis.addEventListener?.('voiceschanged', () => { if (location.hash.startsWith('#/settings') || location.hash === '' || location.hash === '#/') router(); });

/* ================= Офлайн и установка ================= */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); installPrompt = e;
  const b = document.getElementById('installBtn'); if (b) b.hidden = false;
});
window.addEventListener('appinstalled', () => { installPrompt = null; toast('Приложение установлено 🎉'); });
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone; }
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(() => {
    try { if (!localStorage.getItem('zh-offline-ok')) { localStorage.setItem('zh-offline-ok', '1'); toast('Сайт сохранён для работы без интернета'); } } catch (e) { /* ничего */ }
  }).catch(() => {});
}
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) { toast('Сайт обновлён'); setTimeout(() => location.reload(), 600); }
    hadController = true;
  });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('#hideInstall')) { S.hideInstall = true; save(); e.target.closest('.install-card').remove(); return; }
  if (e.target.closest('#installBtn') && installPrompt) { installPrompt.prompt(); installPrompt.userChoice.finally(() => { installPrompt = null; router(); }); }
});

router();

'use strict';
// Структурированные уроки: новые слова → грамматика → тоны (можно пропустить) → проверка слов → домашка → итог.
// Использует глобальные данные и функции из app.js (загружается раньше него, вызывается позже).

const LESSON_HSK = 12;  // слов HSK на урок
const LESSON_PRAC = 3;  // бытовых слов / фраз на урок

let _course = null;
function course() {
  if (_course) return _course;
  const prac = PRACTICAL_DECKS.flatMap((k) => DECKS[k].words);
  const lessons = [];
  let p = 0;
  HSK_DECKS.forEach((k) => {
    const words = DECKS[k].words;
    const lvl = DECKS[k].level;
    const start = lessons.length;
    let i = 0;
    while (i < words.length) {
      // когда бытовые слова закончились, урок целиком из HSK (15 слов)
      const size = p < prac.length ? LESSON_HSK : LESSON_HSK + LESSON_PRAC;
      // хвост меньше половины урока присоединяем к этому уроку
      const end = words.length - (i + size) < size / 2 ? words.length : i + size;
      const ids = words.slice(i, end).map((w) => w.id);
      for (let j = 0; j < LESSON_PRAC && p < prac.length; j++) ids.push(prac[p++].id);
      lessons.push({ n: lessons.length + 1, lvl, deck: k, ids, gram: null, gramNew: false });
      i = end;
    }
    // Темы грамматики уровня равномерно по урокам уровня (HSK1–2 темы делятся на hsk1 и hsk2).
    const count = lessons.length - start;
    let topics;
    if (lvl <= 2) {
      const base = ALL_GRAMMAR.map((g, i) => ({ g, i })).filter((x) => x.g.lvl === 2);
      const half = Math.ceil(base.length / 2);
      topics = lvl === 1 ? base.slice(0, half) : base.slice(half);
    } else {
      topics = ALL_GRAMMAR.map((g, i) => ({ g, i })).filter((x) => x.g.lvl === lvl);
    }
    for (let t = 0; t < count; t++) {
      const L = lessons[start + t];
      const idx = Math.floor((t * topics.length) / count);
      const prevIdx = t ? Math.floor(((t - 1) * topics.length) / count) : -1;
      if (idx !== prevIdx && topics[idx]) { L.gram = topics[idx].i; L.gramNew = true; }
    }
  });
  // Уроки без новой темы повторяют одну из уже пройденных тем.
  let seen = [];
  lessons.forEach((L) => {
    if (L.gramNew) seen.push(L.gram);
    else if (seen.length) L.gram = seen[(L.n * 7) % seen.length];
    else L.gram = 0;
  });
  _course = lessons;
  return lessons;
}
function lessonState(n) { return (S.lessons || {})[n]; }
function nextLessonN() {
  const c = course();
  const L = c.find((x) => !lessonState(x.n));
  return L ? L.n : c.length;
}

/* ---------- Список уроков ---------- */
function renderLessons(arg) {
  if (arg && /^\d+$/.test(arg)) return startLesson(+arg);
  if (arg === 'go' && ls) return drawLesson();
  const c = course();
  const next = nextLessonN();
  const done = c.filter((L) => lessonState(L.n)).length;
  const L = c[next - 1];
  app.innerHTML = `<h1>Уроки</h1>
    <div class="card next-lesson">
      <div class="muted small">Следующий урок · ${DECKS[L.deck].name}</div>
      <h2 style="margin:4px 0 6px">Урок ${L.n}</h2>
      <div class="small">${lessonSummary(L)}</div>
      <a class="btn primary big" href="#/lessons/${L.n}" style="margin-top:12px">Начать урок →</a>
    </div>
    <p class="muted small">Пройдено ${done} из ${c.length}. Урок занимает 15–20 минут: <b>новые слова → грамматика → тоны</b> (можно пропустить) <b>→ проверка слов → домашнее задание</b>. Слова урока сразу попадают в карточки для повторения.</p>
    ${HSK_DECKS.map((k) => {
      const ls2 = c.filter((x) => x.deck === k);
      const d = ls2.filter((x) => lessonState(x.n)).length;
      const open = ls2.some((x) => x.n === next);
      return `<details class="gram" ${open ? 'open' : ''}><summary>${DECKS[k].name} · ${d}/${ls2.length}</summary><div class="inner lesson-grid">
        ${ls2.map((x) => {
          const st = lessonState(x.n);
          return `<a href="#/lessons/${x.n}" class="lesson-tile ${st ? 'done' : ''} ${x.n === next ? 'cur' : ''}"><b>${x.n}</b><small>${st ? '✓ ' + st.score + '%' : x.gramNew ? '📘 новая тема' : ''}</small></a>`;
        }).join('')}</div></details>`;
    }).join('')}`;
}
function lessonSummary(L) {
  const words = L.ids.map((id) => WORD_BY_ID[id]).filter((w) => w.deck !== 'phr').slice(0, 6).map((w) => `<span class="hz">${esc(w.hz)}</span>`).join(' · ');
  return `Слова: ${words}…<br>Грамматика: <b>${esc(ALL_GRAMMAR[L.gram].title)}</b>${L.gramNew ? '' : ' (повторение)'}`;
}

/* ---------- Прохождение урока ---------- */
let ls = null;
const STEPS = [
  ['words', '📖 Слова'], ['grammar', '📘 Грамматика'], ['tones', '🎵 Тоны'], ['quiz', '✍️ Проверка слов'], ['hw', '📝 Домашка'], ['done', '🏁 Итог'],
];
function startLesson(n) {
  const L = course()[n - 1];
  if (!L) { location.hash = '#/lessons'; return; }
  const words = L.ids.map((id) => WORD_BY_ID[id]);
  ls = {
    L, words, step: 0, i: 0,
    tones: makeToneQs(words), toneRight: 0,
    quiz: shuffle(words.map((w) => w.id)), quizRight: 0, quizWrong: [], tries: 0, state: 'ask', retried: {},
    hw: makeHomework(L.gram), hwRight: 0, hwState: null,
  };
  location.hash = '#/lessons/go';
}
function stepBar() {
  return `<div class="steps">${STEPS.map(([, name], i) => `<span class="${i < ls.step ? 'ok' : i === ls.step ? 'on' : ''}">${i === ls.step ? name : name.split(' ')[0]}</span>`).join('')}</div>`;
}
function goStep(s) { ls.step = s; ls.i = 0; drawLesson(); window.scrollTo(0, 0); }
function drawLesson() {
  if (!ls) { location.hash = '#/lessons'; return; }
  const key = STEPS[ls.step][0];
  const head = `<div class="row" style="justify-content:space-between;margin-bottom:6px"><a href="#/lessons" class="small">← Уроки</a><b>Урок ${ls.L.n}</b></div>${stepBar()}`;
  ({ words: lsWords, grammar: lsGrammar, tones: lsTones, quiz: lsQuiz, hw: lsHomework, done: lsDone })[key](head);
}

/* 1. Новые слова */
function lsWords(head) {
  const w = ls.words[ls.i];
  const ex = exampleFor(w);
  app.innerHTML = `${head}
    <div class="progress"><div style="width:${(ls.i / ls.words.length) * 100}%"></div></div>
    <div class="card flash">
      <span class="deck-tag" style="align-self:center">${ls.i + 1} / ${ls.words.length} · ${DECKS[w.deck].name}</span>
      <div class="hz ${w.deck === 'phr' ? 'phrase' : ''}">${esc(w.hz)}</div>
      <div class="py">${colorPinyin(w.py)}</div>
      <div class="ru">${esc(w.ru)}</div>
      <div class="row" style="justify-content:center">${playBtn(w.hz)}<button class="btn sm" data-say="${esc(w.hz)}" data-rate="0.5">🐢 медленно</button></div>
      ${ex ? `<div class="example"><div class="small muted">Пример</div><div class="row" style="gap:10px;flex-wrap:nowrap"><div style="flex:1"><div class="hz" style="font-size:20px">${esc(ex[0])}</div><div class="py small">${colorPinyin(ex[1])}</div><div class="small">${esc(ex[2])}</div></div>${playBtn(ex[0])}</div></div>` : ''}
      <p class="hint">Повторите вслух 2–3 раза.</p>
    </div>
    <div class="row">
      ${ls.i ? '<button class="btn" id="prev">← Назад</button>' : ''}
      <button class="btn primary" id="next" style="flex:1">${ls.i < ls.words.length - 1 ? 'Дальше →' : 'К грамматике →'}</button>
    </div>`;
  speak(w.hz);
  document.getElementById('next').onclick = () => {
    if (!S.cards[w.id]) grade(w.id, 2); // слово попадает в карточки: повторение завтра
    if (ls.i < ls.words.length - 1) { ls.i++; drawLesson(); } else goStep(1);
  };
  const pv = document.getElementById('prev'); if (pv) pv.onclick = () => { ls.i--; drawLesson(); };
}

/* 2. Грамматика */
function lsGrammar(head) {
  const g = ALL_GRAMMAR[ls.L.gram];
  app.innerHTML = `${head}
    <div class="card">
      <div class="muted small">${ls.L.gramNew ? 'Новая тема' : 'Повторение темы'}</div>
      <h2 style="margin-top:4px">${esc(g.title)}</h2>
      <p>${g.text}</p>
      ${g.ex.map((e) => `<div class="phrase"><div class="body"><div class="hz">${esc(e[0])}</div><div class="py">${colorPinyin(e[1])}</div><div class="ru">${esc(e[2])}</div></div><div class="tools">${playBtn(e[0])}</div></div>`).join('')}
      <p class="hint">Прослушайте примеры и повторите их вслух. В конце урока будет домашнее задание по этой теме.</p>
    </div>
    <div class="row"><button class="btn" id="prev">← Слова</button><button class="btn primary" id="next" style="flex:1">К тонам →</button></div>`;
  document.getElementById('prev').onclick = () => { ls.step = 0; ls.i = ls.words.length - 1; drawLesson(); };
  document.getElementById('next').onclick = () => goStep(2);
}

/* 3. Тоны */
function makeToneQs(words) {
  const own = words.filter((w) => TONE_POOL.includes(w));
  const pool = shuffle([...own, ...shuffle(TONE_POOL.filter((w) => !own.includes(w))).slice(0, 5)]).slice(0, 5);
  return pool.map((w) => {
    const right = tonesOf(w.py).join('-');
    const len = [...w.hz].length;
    const allowed = len === 1 ? [1, 2, 3, 4] : [1, 2, 3, 4, 5];
    const opts = new Set([right]);
    let guard = 0;
    while (opts.size < 4 && guard++ < 50) {
      const t = tonesOf(w.py);
      const k = Math.floor(Math.random() * len);
      t[k] = pick(allowed.filter((a) => a !== t[k] && !(k === 0 && a === 5)));
      opts.add(t.join('-'));
    }
    return { w, right, opts: shuffle([...opts]), chosen: null };
  });
}
function lsTones(head) {
  const q = ls.tones[ls.i];
  const lbl = (s) => s.split('-').map((n) => `<span class="t${n}">${n === '5' ? '0' : n}</span>`).join(' ');
  app.innerHTML = `${head}
    <div class="card" style="text-align:center">
      <div class="muted small">Вопрос ${ls.i + 1} из ${ls.tones.length} · послушайте и выберите тоны (0 — нейтральный)</div>
      <div class="row" style="justify-content:center;margin:12px 0">${playBtn(q.w.hz, 'big')}<button class="btn sm" data-say="${esc(q.w.hz)}" data-rate="0.5">🐢</button></div>
      <div class="tones-opts">${q.opts.map((o) => {
        let c = ''; if (q.chosen) { if (o === q.right) c = 'right'; else if (o === q.chosen) c = 'wrong'; }
        return `<button data-opt="${o}" class="${c}" ${q.chosen ? 'disabled' : ''}>${lbl(o)} ${o.split('-').map((n) => toneSvg(+n, 24)).join('')}</button>`;
      }).join('')}</div>
      ${q.chosen ? `<div style="margin-top:12px"><span class="hz" style="font-size:30px">${esc(q.w.hz)}</span> <span class="py">${colorPinyin(q.w.py)}</span> — ${esc(q.w.ru)}</div>` : ''}
    </div>
    <div class="row">
      <button class="btn" id="skip">Пропустить тоны</button>
      ${q.chosen ? `<button class="btn primary" id="next" style="flex:1">${ls.i < ls.tones.length - 1 ? 'Дальше →' : 'К проверке слов →'}</button>` : ''}
    </div>`;
  if (!q.chosen) speak(q.w.hz);
  app.querySelectorAll('[data-opt]').forEach((b) => { b.onclick = () => {
    q.chosen = b.dataset.opt; if (q.chosen === q.right) ls.toneRight++;
    S.tones.total++; if (q.chosen === q.right) S.tones.right++; save();
    drawLesson(); speak(q.w.hz);
  }; });
  document.getElementById('skip').onclick = () => { ls.tonesSkipped = true; goStep(3); };
  const nx = document.getElementById('next');
  if (nx) nx.onclick = () => { if (ls.i < ls.tones.length - 1) { ls.i++; drawLesson(); } else goStep(3); };
}

/* 4. Проверка слов (ввод) */
function lsQuiz(head) {
  if (!ls.quiz.length) return goStep(4);
  const w = WORD_BY_ID[ls.quiz[0]];
  const done = ls.state !== 'ask';
  const total = ls.words.length;
  const ex = done ? exampleFor(w) : null;
  app.innerHTML = `${head}
    <div class="progress"><div style="width:${((total - ls.quiz.length) / total) * 100}%"></div></div>
    <div class="card flash">
      <div class="muted small">Напишите по-китайски (иероглифы или пиньинь, тоны необязательны)</div>
      <div class="prompt">${esc(w.ru)}</div>
      ${done ? `
        <div class="answer ${ls.state === 'right' ? 'ok' : 'bad'}">${ls.state === 'right' ? '✅ Верно!' : '📖 Правильный ответ:'}</div>
        <div class="hz ${w.deck === 'phr' ? 'phrase' : ''}">${esc(w.hz)}</div>
        <div class="py">${colorPinyin(w.py)}</div>
        <div class="row" style="justify-content:center">${playBtn(w.hz)}</div>
        ${ex ? `<div class="example"><div class="row" style="gap:10px;flex-wrap:nowrap"><div style="flex:1"><div class="hz" style="font-size:20px">${esc(ex[0])}</div><div class="py small">${colorPinyin(ex[1])}</div><div class="small">${esc(ex[2])}</div></div>${playBtn(ex[0])}</div></div>` : ''}
      ` : `
        <input class="search answer-input" id="ans" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Иероглифы или пиньинь">
        <div id="fb" class="rec-result bad">${ls.tries ? '❌ Неверно, попробуйте ещё раз' : ''}</div>
        <div class="row" style="justify-content:center"><button class="btn primary" id="check">Проверить</button><button class="btn" id="giveup">Не помню</button></div>`}
    </div>
    ${done ? '<button class="btn primary big" id="next">Дальше →</button>' : ''}`;
  if (!done) {
    const inp = document.getElementById('ans'); inp.focus();
    const check = () => {
      if (!inp.value.trim()) return;
      if (checkAnswer(inp.value, w) || ALL_WORDS.some((o) => o.ru === w.ru && o !== w && checkAnswer(inp.value, o))) {
        if (!ls.tries && !ls.retried[w.id]) ls.quizRight++;
        ls.state = 'right'; drawLesson();
      } else { ls.tries++; document.getElementById('fb').textContent = '❌ Неверно, попробуйте ещё раз'; inp.select(); }
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); check(); } };
    document.getElementById('check').onclick = check;
    document.getElementById('giveup').onclick = () => { ls.tries++; ls.state = 'shown'; drawLesson(); };
  } else {
    speak(w.hz);
    const nx = document.getElementById('next'); nx.focus();
    nx.onclick = () => {
      const id = ls.quiz.shift();
      if (ls.tries) {
        if (!ls.quizWrong.includes(id)) ls.quizWrong.push(id);
        if (!ls.retried[id]) { ls.retried[id] = true; ls.quiz.push(id); }
        if (S.cards[id]) { S.cards[id].due = Math.min(S.cards[id].due, Date.now()); }
        S.mistakes = [id, ...(S.mistakes || []).filter((x) => x !== id)].slice(0, 200); save();
      }
      ls.tries = 0; ls.state = 'ask'; drawLesson();
    };
  }
}

/* 5. Домашнее задание по грамматике */
function hzOnly(s) { return [...s].filter((c) => /[一-鿿]/.test(c)); }
function chunkSentence(ex) {
  if (/[A-Za-z0-9]/.test(ex[0])) return null;
  const chars = hzOnly(ex[0]);
  const words = ex[1].replace(/[—–]/g, ' ').split(/\s+/).map((x) => x.replace(/[.,!?;:"«»()…]/g, '')).filter(Boolean);
  const out = []; let pos = 0;
  for (const wd of words) {
    const syl = syllables(wd);
    let n = syl.length + syl.filter((s) => /r$/.test(plain(s)) && plain(s) !== 'er').length;
    if (syl.length && /r$/.test(plain(wd)) && !/r$/.test(plain(syl[syl.length - 1]))) n++; // эризация: 点儿 = diǎnr
    if (!n) return null;
    out.push(chars.slice(pos, pos + n).join('')); pos += n;
  }
  if (pos !== chars.length || out.some((x) => !x)) return null;
  return out;
}
function grammarKeys(g) { return [...new Set(hzOnly(g.title.split('—')[0]))]; }
function makeHomework(gi) {
  const g = ALL_GRAMMAR[gi];
  const tasks = [];
  const others = ALL_GRAMMAR.filter((x, i) => i !== gi).flatMap((x) => x.ex).filter((e) => !e[0].includes('…'));
  shuffle([...g.ex]).forEach((e, k) => {
    const ch = chunkSentence(e);
    if (ch && ch.length >= 3 && ch.length <= 9 && k < 2) tasks.push({ type: 'order', ex: e, chunks: ch, picked: [] });
  });
  const keys = grammarKeys(g);
  const allKeys = [...new Set(ALL_GRAMMAR.flatMap(grammarKeys))];
  const gapEx = shuffle(g.ex.filter((e) => keys.some((k) => e[0].includes(k))));
  gapEx.slice(0, 2).forEach((e) => {
    const k = keys.find((x) => e[0].includes(x));
    const opts = shuffle([k, ...shuffle(allKeys.filter((x) => x !== k && !e[0].includes(x))).slice(0, 3)]);
    tasks.push({ type: 'gap', ex: e, key: k, text: e[0].replace(k, '＿＿'), opts });
  });
  shuffle([...g.ex]).slice(0, 2).forEach((e) => {
    const opts = shuffle([e, ...shuffle(others).slice(0, 2)]);
    tasks.push({ type: 'pick', ex: e, opts });
  });
  return tasks.slice(0, 6);
}
function lsHomework(head) {
  const t = ls.hw[ls.i];
  if (!t) return goStep(5);
  const g = ALL_GRAMMAR[ls.L.gram];
  const answered = ls.hwState !== null;
  let body = '';
  if (t.type === 'order') {
    if (!t.pool) t.pool = shuffle(t.chunks.map((c, i) => ({ c, i })));
    body = `<div class="muted small">Соберите предложение: «${esc(t.ex[2])}»</div>
      <div class="build">${t.picked.map((p, j) => `<button class="tok on" data-un="${j}" ${answered ? 'disabled' : ''}>${esc(p.c)}</button>`).join('') || '<span class="muted small">нажимайте на слова ниже</span>'}</div>
      <div class="build pool">${t.pool.map((p, j) => t.picked.includes(p) ? '' : `<button class="tok" data-pk="${j}" ${answered ? 'disabled' : ''}>${esc(p.c)}</button>`).join('')}</div>`;
  } else if (t.type === 'gap') {
    body = `<div class="muted small">Вставьте пропущенное: «${esc(t.ex[2])}»</div>
      <div class="hz" style="font-size:28px;margin:10px 0">${esc(t.text)}</div>
      <div class="tones-opts">${t.opts.map((o) => `<button class="hz ${answered ? (o === t.key ? 'right' : o === t.chosen ? 'wrong' : '') : ''}" data-gap="${esc(o)}" ${answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>`;
  } else {
    body = `<div class="muted small">Как сказать по-китайски?</div>
      <div class="prompt" style="margin:8px 0">${esc(t.ex[2])}</div>
      <div class="pick-opts">${t.opts.map((o, j) => `<button class="hz ${answered ? (o === t.ex ? 'right' : j === t.chosen ? 'wrong' : '') : ''}" data-pick="${j}" ${answered ? 'disabled' : ''}>${esc(o[0])}</button>`).join('')}</div>`;
  }
  const solution = answered ? `<div class="example"><div class="answer ${ls.hwState ? 'ok' : 'bad'}">${ls.hwState ? '✅ Верно!' : '❌ Правильно так:'}</div>
      <div class="row" style="gap:10px;flex-wrap:nowrap"><div style="flex:1"><div class="hz" style="font-size:22px">${esc(t.ex[0])}</div><div class="py small">${colorPinyin(t.ex[1])}</div><div class="small">${esc(t.ex[2])}</div></div>${playBtn(t.ex[0])}</div></div>` : '';
  app.innerHTML = `${head}
    <div class="muted small" style="margin-bottom:6px">Тема: <b>${esc(g.title)}</b> · задание ${ls.i + 1} из ${ls.hw.length}</div>
    <div class="card">${body}${solution}</div>
    <div class="row">${answered ? '<button class="btn primary big" id="next">Дальше →</button>'
      : t.type === 'order' ? `<button class="btn" id="reset">Сбросить</button><button class="btn primary" id="checkOrder" style="flex:1" ${t.picked.length === t.chunks.length ? '' : 'disabled'}>Проверить</button>` : ''}</div>`;
  const finish = (ok) => { ls.hwState = ok; if (ok) ls.hwRight++; drawLesson(); speak(t.ex[0]); };
  app.querySelectorAll('[data-pk]').forEach((b) => { b.onclick = () => { t.picked.push(t.pool[+b.dataset.pk]); drawLesson(); }; });
  app.querySelectorAll('[data-un]').forEach((b) => { b.onclick = () => { t.picked.splice(+b.dataset.un, 1); drawLesson(); }; });
  const rs = document.getElementById('reset'); if (rs) rs.onclick = () => { t.picked = []; drawLesson(); };
  const co = document.getElementById('checkOrder'); if (co) co.onclick = () => finish(t.picked.map((p) => p.c).join('') === t.chunks.join(''));
  app.querySelectorAll('[data-gap]').forEach((b) => { b.onclick = () => { t.chosen = b.dataset.gap; finish(t.chosen === t.key); }; });
  app.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { t.chosen = +b.dataset.pick; finish(t.opts[t.chosen] === t.ex); }; });
  const nx = document.getElementById('next'); if (nx) nx.onclick = () => { ls.hwState = null; ls.i++; drawLesson(); };
}

/* 6. Итог */
function lsDone(head) {
  const qTotal = ls.words.length, hTotal = ls.hw.length || 1;
  const score = Math.round(((ls.quizRight / qTotal) * 0.6 + (ls.hwRight / hTotal) * 0.4) * 100);
  if (!ls.saved) {
    S.lessons = S.lessons || {};
    const prev = S.lessons[ls.L.n];
    S.lessons[ls.L.n] = { date: todayKey(), score: Math.max(score, prev ? prev.score : 0), quiz: `${ls.quizRight}/${qTotal}`, hw: `${ls.hwRight}/${ls.hw.length}` };
    save(); ls.saved = true;
  }
  const wrong = ls.quizWrong.map((id) => WORD_BY_ID[id]);
  const next = course()[ls.L.n];
  app.innerHTML = `${head}
    <div class="card empty">
      <div class="big-emoji">${score >= 80 ? '🎉' : score >= 50 ? '👍' : '💪'}</div>
      <h2>Урок ${ls.L.n} пройден — ${score}%</h2>
      <p>Слова с первой попытки: <b>${ls.quizRight}/${qTotal}</b> · Домашка: <b>${ls.hwRight}/${ls.hw.length}</b>${ls.tonesSkipped ? '' : ` · Тоны: <b>${ls.toneRight}/${ls.tones.length}</b>`}</p>
      ${wrong.length ? `<p class="muted small">Повторите: ${wrong.map((w) => `<span class="hz">${esc(w.hz)}</span> (${esc(w.ru)})`).join(', ')}. Эти слова придут в карточки раньше.</p>` : ''}
      <p class="muted small">Слова урока добавлены в карточки — завтра загляните в «Карточки», чтобы их повторить.</p>
      <div class="row" style="justify-content:center">
        <button class="btn" id="redo">Пройти ещё раз</button>
        ${next ? `<a class="btn primary" href="#/lessons/${next.n}">Урок ${next.n} →</a>` : ''}
      </div>
    </div>`;
  document.getElementById('redo').onclick = () => { startLesson(ls.L.n); router(); };
}
document.addEventListener('keydown', (e) => {
  if (location.hash !== '#/lessons/go' || !ls || e.key !== 'Enter' || e.target.matches('input,button,select,textarea')) return;
  const nx = document.getElementById('next'); if (nx) { e.preventDefault(); nx.click(); }
});

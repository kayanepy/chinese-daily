'use strict';
// Уроки по структуре учебников HSK Standard Course 1–4 (данные — course-hsk*.js).
// Шаги: слова → диалог → грамматика → тоны (можно пропустить) → проверка слов → домашка → итог.
// Использует глобальные данные и функции из app.js (загружается раньше него, вызывается позже).

let _course = null;
function course() {
  if (_course) return _course;
  const byHz = {};
  ALL_WORDS.forEach((w) => { if (w.deck !== 'phr') (byHz[w.hz] = byHz[w.hz] || []).push(w); });
  _course = COURSE.map((L, i) => {
    const ids = [...new Set(L.words.map((hz) => {
      const c = byHz[hz]; if (!c) return null;
      return (c.find((w) => w.deck === 'hsk' + L.lvl) || c[0]).id;
    }).filter(Boolean))];
    return { ...L, n: i + 1, key: `${L.lvl}-${L.num}${L.part ? '-' + L.part : ''}`, ids };
  });
  return _course;
}
function lessonName(L) { return `HSK ${L.lvl} · Урок ${L.num}${L.part ? `, часть ${L.part}` : ''}`; }
function lessonState(L) { return (S.course || {})[L.key]; }
function nextLesson() { const c = course(); return c.find((L) => !lessonState(L)) || c[c.length - 1]; }

/* ---------- Список уроков ---------- */
function lessonSummary(L) {
  const words = L.ids.slice(0, 6).map((id) => `<span class="hz">${esc(WORD_BY_ID[id].hz)}</span>`).join(' · ');
  return `Слова: ${words}…<br>Грамматика: ${L.gram.map((g) => `<b>${esc(g.t)}</b>`).join('; ')}`;
}
function nextLessonCard() {
  const L = nextLesson();
  return `<div class="card next-lesson">
    <div class="muted small">Следующий урок · ${lessonName(L)}</div>
    <h2 style="margin:4px 0 2px"><span class="hz">${esc(L.zh)}</span></h2>
    <div class="muted" style="margin-bottom:6px">${esc(L.ru)}</div>
    <div class="small">${lessonSummary(L)}</div>
    <a class="btn primary big" href="#/lessons/${L.n}" style="margin-top:12px">Начать урок →</a>
  </div>`;
}
function wordStatus(id) {
  const c = S.cards[id];
  if (!c) return 'new';
  return c.iv >= 21 ? 'strong' : 'learning';
}
function levelStats(lv) {
  const list = course().filter((x) => x.lvl === lv);
  const ids = [...new Set(list.flatMap((x) => x.ids))];
  const done = list.filter(lessonState);
  return {
    list, total: list.length, done: done.length,
    words: ids.length, learning: ids.filter((id) => wordStatus(id) !== 'new').length, strong: ids.filter((id) => wordStatus(id) === 'strong').length,
    avg: done.length ? Math.round(done.reduce((a, L) => a + lessonState(L).score, 0) / done.length) : null,
  };
}
function bar(part, total, part2) {
  const w = (x) => total ? Math.round((x / total) * 100) : 0;
  return `<div class="progress two"><div class="p-in" style="width:${w(part)}%"></div>${part2 != null ? `<div class="p-solid" style="width:${w(part2)}%"></div>` : ''}</div>`;
}
function renderLessons(arg) {
  if (arg && /^\d+$/.test(arg)) return startLesson(+arg);
  if (arg && /^i\d+$/.test(arg)) return renderLessonInfo(+arg.slice(1));
  if (arg === 'go' && ls) return drawLesson();
  const c = course();
  const next = nextLesson();
  const done = c.filter(lessonState);
  const stats = [1, 2, 3, 4].map(levelStats);
  const allWords = stats.reduce((a, x) => a + x.words, 0), allLearn = stats.reduce((a, x) => a + x.learning, 0), allStrong = stats.reduce((a, x) => a + x.strong, 0);
  const last = done.map((L) => lessonState(L).date).sort().pop();
  app.innerHTML = `<h1>Уроки</h1>
    ${nextLessonCard()}
    <div class="card">
      <h3 style="margin-top:0">Мой прогресс</h3>
      <div class="grid grid-3" style="margin-bottom:10px">
        <div class="stat"><b>${done.length}/${c.length}</b><span>уроков</span></div>
        <div class="stat"><b>${allLearn}</b><span>слов из ${allWords}</span></div>
        <div class="stat"><b>${done.length ? Math.round(done.reduce((a, L) => a + lessonState(L).score, 0) / done.length) + '%' : '—'}</b><span>средний балл</span></div>
      </div>
      ${stats.map((st, k) => `<div class="lvl-prog">
        <div class="row" style="justify-content:space-between"><b>HSK ${k + 1}</b><span class="small muted">уроки ${st.done}/${st.total} · слова ${st.learning}/${st.words}${st.avg != null ? ` · ${st.avg}%` : ''}</span></div>
        ${bar(st.learning, st.words, st.strong)}
      </div>`).join('')}
      <p class="muted small" style="margin:8px 0 0">Полоса — слова уровня: <span class="dot learning"></span> в изучении, <span class="dot strong"></span> выучены (повтор реже раза в 3 недели).${last ? ` Последний урок: ${dayLabel(last).toLowerCase()}.` : ''}${allStrong ? '' : ''}</p>
    </div>
    <p class="muted small">Курс идёт по учебникам <b>HSK Standard Course 1–4</b>: те же темы, слова и грамматика, объяснения на русском. Нажмите на урок, чтобы посмотреть его содержание. Уроки HSK 4 разделены на две части по ~15 слов.</p>
    ${[1, 2, 3, 4].map((lv) => {
      const st = stats[lv - 1];
      const open = next.lvl === lv;
      return `<details class="gram" ${open ? 'open' : ''}><summary>HSK ${lv} · ${st.done}/${st.total}</summary><div class="inner">
        ${st.list.map((x) => {
          const s2 = lessonState(x);
          return `<a href="#/lessons/i${x.n}" class="lesson-row ${s2 ? 'done' : ''} ${x === next ? 'cur' : ''}">
            <b class="num">${x.num}${x.part ? '<small>.' + x.part + '</small>' : ''}</b>
            <span class="t"><span class="hz">${esc(x.zh)}</span><small>${esc(x.ru)}</small><small class="topics">${x.gram.map((g) => esc(g.t.split(' — ')[0])).join(' · ')}</small></span>
            <span class="st">${s2 ? '✓ ' + s2.score + '%' : x === next ? '▶ далее' : ''}</span></a>`;
        }).join('')}</div></details>`;
    }).join('')}`;
}
function renderLessonInfo(n) {
  const L = course()[n - 1];
  if (!L) { location.hash = '#/lessons'; return; }
  const st = lessonState(L);
  const words = L.ids.map((id) => WORD_BY_ID[id]);
  const learn = words.filter((w) => wordStatus(w.id) !== 'new').length;
  const prev = course()[n - 2], nx = course()[n];
  const lbl = { new: 'новое', learning: 'в изучении', strong: 'выучено' };
  app.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:6px"><a href="#/lessons" class="small">← Все уроки</a>
      <span class="small">${prev ? `<a href="#/lessons/i${prev.n}">‹ пред.</a>` : ''} ${nx ? ` <a href="#/lessons/i${nx.n}">след. ›</a>` : ''}</span></div>
    <div class="card">
      <div class="muted small">${lessonName(L)} · урок ${L.n} из ${course().length}</div>
      <h1 style="margin:4px 0 0"><span class="hz">${esc(L.zh)}</span> ${playBtn(L.zh)}</h1>
      <div class="muted">${esc(L.ru)}</div>
      <div style="margin-top:10px">${st ? `<span class="pill ok">✓ Пройден ${dayLabel(st.date).toLowerCase()} · ${st.score}% · слова ${st.quiz} · домашка ${st.hw}${st.speak != null ? ` · произношение ${st.speak}%` : ''}</span>` : '<span class="pill">Ещё не пройден</span>'}</div>
      <a class="btn primary big" href="#/lessons/${L.n}" style="margin-top:12px">${st ? 'Пройти ещё раз' : 'Начать урок'} →</a>
      <button class="btn" id="rvl" style="margin-top:8px;width:100%">🔁 Повторить слова этого урока</button>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Слова · ${learn}/${words.length} в карточках</h3>
      ${words.map((w) => `<div class="word-row"><div class="hz">${esc(w.hz)}</div><div class="meta"><div>${colorPinyin(w.py)}</div><div class="small">${esc(w.ru)}</div><div class="lvl"><span class="dot ${wordStatus(w.id)}"></span> ${lbl[wordStatus(w.id)]}</div></div>${playBtn(w.hz)}</div>`).join('')}
    </div>
    <div class="card">
      <h3 style="margin-top:0">Грамматика</h3>
      ${L.gram.map((g) => `<details class="gram"><summary>${esc(g.t)}</summary><div class="inner"><p>${g.x}</p>
        ${g.ex.map((e) => `<div class="phrase"><div class="body"><div class="hz">${esc(e[0])}</div><div class="py">${colorPinyin(e[1])}</div><div class="ru">${esc(e[2])}</div></div><div class="tools">${playBtn(e[0])}</div></div>`).join('')}</div></details>`).join('')}
    </div>
    <div class="card">
      <h3 style="margin-top:0">Диалог</h3>
      <button class="btn sm primary" id="all" style="margin-bottom:8px">▶ Весь диалог</button>
      ${L.dlg.map((x) => `<div class="phrase dlg"><span class="who">${esc(x[0])}</span><div class="body"><div class="hz">${esc(x[1])}</div><div class="py">${colorPinyin(x[2])}</div><div class="ru">${esc(x[3])}</div></div><div class="tools">${playBtn(x[1])}</div></div>`).join('')}
    </div>`;
  document.getElementById('all').onclick = () => speakQueue(L.dlg.map((x) => x[1]));
  document.getElementById('rvl').onclick = () => startReview({ name: `${lessonName(L)} · ${L.zh}`, words: words });
}

/* ---------- Прохождение урока ---------- */
let ls = null;
const STEPS = [
  ['words', '📖 Слова'], ['dialog', '💬 Диалог'], ['grammar', '📘 Грамматика'], ['tones', '🎵 Тоны'], ['speak', '🎤 Произношение'], ['quiz', '✍️ Проверка слов'], ['hw', '📝 Домашка'], ['done', '🏁 Итог'],
];
const STEP = Object.fromEntries(STEPS.map(([k], i) => [k, i]));
function startLesson(n) {
  const L = course()[n - 1];
  if (!L) { location.hash = '#/lessons'; return; }
  const words = L.ids.map((id) => WORD_BY_ID[id]);
  ls = {
    L, words, step: 0, i: 0, showRu: false, showPy: true,
    tones: makeToneQs(words), toneRight: 0,
    speak: makeSpeakQs(L, words), speakSkipped: false,
    quiz: shuffle(words.map((w) => w.id)), quizRight: 0, quizWrong: [], tries: 0, state: 'ask', retried: {},
    hw: makeHomework(L), hwRight: 0, hwState: null,
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
  const head = `<div class="row" style="justify-content:space-between;margin-bottom:6px"><a href="#/lessons" class="small">← Уроки</a><b class="small">${lessonName(ls.L)}</b></div>${stepBar()}`;
  ({ words: lsWords, dialog: lsDialog, grammar: lsGrammar, tones: lsTones, speak: lsSpeak, quiz: lsQuiz, hw: lsHomework, done: lsDone })[key](head);
}
function exampleBox(ex, title) {
  return ex ? `<div class="example">${title ? `<div class="small muted">${title}</div>` : ''}<div class="row" style="gap:10px;flex-wrap:nowrap"><div style="flex:1"><div class="hz" style="font-size:20px">${esc(ex[0])}</div><div class="py small">${colorPinyin(ex[1])}</div><div class="small">${esc(ex[2])}</div></div>${playBtn(ex[0])}</div></div>` : '';
}
function speakQueue(texts) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const v = voices.find((x) => x.name === S.settings.voice) || voices[0];
  texts.forEach((t) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'zh-CN'; u.rate = S.settings.rate; if (v) u.voice = v;
    speechSynthesis.speak(u);
  });
}

/* 1. Новые слова */
function lsWords(head) {
  const w = ls.words[ls.i];
  app.innerHTML = `${head}
    <div class="progress"><div style="width:${(ls.i / ls.words.length) * 100}%"></div></div>
    <div class="card flash">
      <span class="deck-tag" style="align-self:center">${ls.i + 1} / ${ls.words.length} · ${DECKS[w.deck].name}</span>
      <div class="hz">${esc(w.hz)}</div>
      <div class="py">${colorPinyin(w.py)}</div>
      <div class="ru">${esc(w.ru)}</div>
      <div class="row" style="justify-content:center">${playBtn(w.hz)}<button class="btn sm" data-say="${esc(w.hz)}" data-rate="0.5">🐢 медленно</button>${SR ? '<button class="btn sm" id="mic">🎤 Скажите</button>' : ''}</div>
      <div id="recres" class="rec-result" style="text-align:center"></div>
      ${exampleBox(exampleFor(w), 'Пример')}
      <p class="hint">Повторите вслух 2–3 раза${SR ? ', затем нажмите 🎤 и скажите слово — сайт проверит произношение' : ''}.</p>
    </div>
    <div class="row">
      ${ls.i ? '<button class="btn" id="prev">← Назад</button>' : ''}
      <button class="btn primary" id="next" style="flex:1">${ls.i < ls.words.length - 1 ? 'Дальше →' : 'К диалогу →'}</button>
    </div>`;
  speak(w.hz);
  document.getElementById('next').onclick = () => {
    if (!S.cards[w.id]) grade(w.id, 2); // слово попадает в карточки: повторение завтра
    if (ls.i < ls.words.length - 1) { ls.i++; drawLesson(); } else goStep(STEP.dialog);
  };
  const pv = document.getElementById('prev'); if (pv) pv.onclick = () => { ls.i--; drawLesson(); };
  const mic = document.getElementById('mic');
  if (mic) mic.onclick = () => micCheck(w.hz, document.getElementById('recres'), mic);
}

/* 2. Диалог */
function lsDialog(head) {
  const d = ls.L.dlg;
  app.innerHTML = `${head}
    <div class="card">
      <div class="muted small">Диалог урока</div>
      <h2 style="margin:4px 0 2px"><span class="hz">${esc(ls.L.zh)}</span></h2>
      <div class="muted small" style="margin-bottom:10px">${esc(ls.L.ru)}</div>
      <div class="row" style="margin-bottom:10px">
        <button class="btn sm primary" id="all">▶ Весь диалог</button>
        <button class="btn sm" id="tpy">${ls.showPy ? 'Скрыть' : 'Показать'} пиньинь</button>
        <button class="btn sm" id="tru">${ls.showRu ? 'Скрыть' : 'Показать'} перевод</button>
      </div>
      ${d.map((x, k) => `<div class="phrase dlg"><span class="who">${esc(x[0])}</span><div class="body"><div class="hz">${esc(x[1])}</div>${ls.showPy ? `<div class="py">${colorPinyin(x[2])}</div>` : ''}<div class="ru ${ls.showRu ? '' : 'blur'}">${esc(x[3])}</div><div class="rec-result" id="dr${k}"></div></div><div class="tools">${playBtn(x[1])}${SR ? `<button class="play" data-mic="${k}" title="Проверить произношение">🎤</button>` : ''}</div></div>`).join('')}
      <p class="hint">Сначала послушайте, не глядя в перевод: сколько поняли? Затем нажмите на перевод (или «Показать перевод»), проверьте себя и прочитайте каждую реплику вслух${SR ? ' — кнопка 🎤 проверит, как вы её произнесли' : ''}.</p>
    </div>
    <div class="row"><button class="btn" id="prev">← Слова</button><button class="btn primary" id="next" style="flex:1">К грамматике →</button></div>`;
  document.getElementById('all').onclick = () => speakQueue(d.map((x) => x[1]));
  document.getElementById('tpy').onclick = () => { ls.showPy = !ls.showPy; drawLesson(); };
  document.getElementById('tru').onclick = () => { ls.showRu = !ls.showRu; drawLesson(); };
  app.querySelectorAll('.ru.blur').forEach((el) => { el.onclick = () => el.classList.remove('blur'); });
  app.querySelectorAll('[data-mic]').forEach((b) => { b.onclick = () => micCheck(d[+b.dataset.mic][1], document.getElementById('dr' + b.dataset.mic), b); });
  document.getElementById('prev').onclick = () => { ls.step = STEP.words; ls.i = ls.words.length - 1; drawLesson(); };
  document.getElementById('next').onclick = () => goStep(STEP.grammar);
}

/* 3. Грамматика */
function lsGrammar(head) {
  app.innerHTML = `${head}
    ${ls.L.gram.map((g, k) => `<div class="card">
      <div class="muted small">Тема ${k + 1} из ${ls.L.gram.length}</div>
      <h2 style="margin-top:4px">${esc(g.t)}</h2>
      <p>${g.x}</p>
      ${g.ex.map((e) => `<div class="phrase"><div class="body"><div class="hz">${esc(e[0])}</div><div class="py">${colorPinyin(e[1])}</div><div class="ru">${esc(e[2])}</div></div><div class="tools">${playBtn(e[0])}</div></div>`).join('')}
    </div>`).join('')}
    <p class="hint">Прослушайте примеры и повторите их вслух. В конце урока будет домашнее задание по этим темам.</p>
    <div class="row"><button class="btn" id="prev">← Диалог</button><button class="btn primary" id="next" style="flex:1">К тонам →</button></div>`;
  document.getElementById('prev').onclick = () => goStep(STEP.dialog);
  document.getElementById('next').onclick = () => goStep(STEP.tones);
}

/* 4. Тоны */
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
      ${q.chosen ? `<button class="btn primary" id="next" style="flex:1">${ls.i < ls.tones.length - 1 ? 'Дальше →' : 'К произношению →'}</button>` : ''}
    </div>`;
  if (!q.chosen) speak(q.w.hz);
  app.querySelectorAll('[data-opt]').forEach((b) => { b.onclick = () => {
    q.chosen = b.dataset.opt; if (q.chosen === q.right) ls.toneRight++;
    S.tones.total++; if (q.chosen === q.right) S.tones.right++; save();
    drawLesson(); speak(q.w.hz);
  }; });
  document.getElementById('skip').onclick = () => { ls.tonesSkipped = true; goStep(STEP.speak); };
  const nx = document.getElementById('next');
  if (nx) nx.onclick = () => { if (ls.i < ls.tones.length - 1) { ls.i++; drawLesson(); } else goStep(STEP.speak); };
}

/* 5. Произношение: говорите слова и короткие реплики диалога, распознавание сравнивает с образцом */
function makeSpeakQs(L, words) {
  const ws = shuffle([...words]).slice(0, 8).map((w) => ({ hz: w.hz, py: w.py, ru: w.ru }));
  const lines = shuffle(L.dlg.filter((x) => [...normHz(x[1])].length <= 12)).slice(0, 4).map((x) => ({ hz: x[1], py: x[2], ru: x[3], line: true }));
  return [...ws, ...lines];
}
function speakAvg() {
  const done = ls.speak.filter((q) => q.best != null);
  return done.length ? Math.round(done.reduce((a, q) => a + q.best, 0) / done.length) : null;
}
function lsSpeak(head) {
  if (!SR) {
    app.innerHTML = `${head}<div class="card"><h2 style="margin-top:0">🎤 Произношение</h2>
      <p>Этот браузер не умеет распознавать речь. Откройте сайт в Chrome (Android) или Safari (iPhone) и разрешите доступ к микрофону.</p>
      <p class="muted small">Распознавание работает через сервис Google/Apple, поэтому нужен интернет (в Китае — с VPN).</p></div>
      <button class="btn primary big" id="next">К проверке слов →</button>`;
    document.getElementById('next').onclick = () => { ls.speakSkipped = true; goStep(STEP.quiz); };
    return;
  }
  const q = ls.speak[ls.i];
  const last = ls.i === ls.speak.length - 1;
  app.innerHTML = `${head}
    <div class="progress"><div style="width:${(ls.i / ls.speak.length) * 100}%"></div></div>
    <div class="card flash">
      <span class="deck-tag" style="align-self:center">${ls.i + 1} / ${ls.speak.length} · ${q.line ? 'реплика из диалога' : 'слово'}</span>
      <div class="hz" ${q.line ? 'style="font-size:30px"' : ''}>${esc(q.hz)}</div>
      <div class="py">${colorPinyin(q.py)}</div>
      <div class="ru">${esc(q.ru)}</div>
      <div class="row" style="justify-content:center">${playBtn(q.hz)}<button class="btn sm" data-say="${esc(q.hz)}" data-rate="0.5">🐢</button></div>
      <button class="btn primary big" id="mic" style="margin-top:10px">🎤 ${q.best != null ? 'Ещё раз' : 'Нажмите и скажите'}</button>
      <div id="recres" class="rec-result" style="text-align:center"></div>
      ${q.best != null ? `<div class="small muted" style="text-align:center">Лучший результат: <b>${q.best}%</b></div>` : ''}
    </div>
    <div class="row">
      <button class="btn" id="skip">Пропустить произношение</button>
      <button class="btn ${q.best != null ? 'primary' : ''}" id="next" style="flex:1">${last ? 'К проверке слов →' : q.best != null ? 'Дальше →' : 'Пропустить →'}</button>
    </div>
    <p class="hint">Послушайте образец, нажмите 🎤 и скажите вслух. 80% и выше — отлично. Если сервис распознал не то, попробуйте говорить чуть медленнее и чётче выделять тоны.</p>`;
  const mic = document.getElementById('mic');
  mic.onclick = () => micCheck(q.hz, document.getElementById('recres'), mic, (pct) => {
    const first = q.best == null;
    q.best = Math.max(q.best || 0, pct);
    if (first || pct >= q.best) {
      mic.textContent = '🎤 Ещё раз';
      const nx = document.getElementById('next'); nx.classList.add('primary'); nx.textContent = last ? 'К проверке слов →' : 'Дальше →';
    }
  });
  document.getElementById('skip').onclick = () => { ls.speakSkipped = true; goStep(STEP.quiz); };
  document.getElementById('next').onclick = () => { if (!last) { ls.i++; drawLesson(); } else goStep(STEP.quiz); };
}

/* 6. Проверка слов (ввод) */
function lsQuiz(head) {
  if (!ls.quiz.length) return goStep(STEP.hw);
  const w = WORD_BY_ID[ls.quiz[0]];
  const done = ls.state !== 'ask';
  const total = ls.words.length;
  app.innerHTML = `${head}
    <div class="progress"><div style="width:${((total - ls.quiz.length) / total) * 100}%"></div></div>
    <div class="card flash">
      <div class="muted small">Напишите по-китайски${S.settings.hanziOnly ? ' иероглифами (наберите пиньинь на китайской клавиатуре и выберите иероглиф)' : ' (иероглифы или пиньинь, тоны необязательны)'}</div>
      <div class="prompt">${esc(w.ru)}</div>
      ${done ? `
        <div class="answer ${ls.state === 'right' ? 'ok' : 'bad'}">${ls.state === 'right' ? '✅ Верно!' : '📖 Правильный ответ:'}</div>
        <div class="hz">${esc(w.hz)}</div>
        <div class="py">${colorPinyin(w.py)}</div>
        <div class="row" style="justify-content:center">${playBtn(w.hz)}</div>
        ${exampleBox(exampleFor(w))}
      ` : `
        <input class="search answer-input" id="ans" lang="zh-CN" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${ansPlaceholder()}">
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
      } else { ls.tries++; document.getElementById('fb').textContent = wrongMsg(inp.value); inp.select(); }
    };
    inp.onkeydown = (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); e.stopPropagation(); check(); } };
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

/* 7. Домашнее задание — в духе рабочей тетради HSK:
   аудирование, выбор слова для пропуска, грамматика, порядок слов, перевод */
function hzOnly(s) { return [...s].filter((c) => /[一-鿿]/.test(c)); }
function chunkSentence(ex) {
  if (/[A-Za-z0-9]/.test(ex[0])) return null;
  const chars = hzOnly(ex[0]);
  const words = ex[1].replace(/[—–-]/g, ' ').split(/\s+/).map((x) => x.replace(/[.,!?;:"«»()…“”‘’]/g, '')).filter(Boolean);
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
function makeHomework(L) {
  const sents = [...L.dlg.map((d) => d.slice(1)), ...L.gram.flatMap((g) => g.ex)].filter((e) => !e[0].includes('…') && hzOnly(e[0]).length > 1);
  const levelSents = COURSE.filter((x) => x.lvl === L.lvl && x !== L).flatMap((x) => x.dlg.map((d) => d.slice(1)));
  const used = new Set();
  const take = (arr, n, fn) => { const out = []; for (const e of shuffle([...arr])) { if (out.length >= n) break; if (used.has(e[0])) continue; const t = fn(e); if (t) { used.add(e[0]); out.push(t); } } return out; };
  const tasks = [];
  // 1) Аудирование: послушайте фразу из диалога — выберите перевод
  tasks.push(...take(L.dlg.map((d) => d.slice(1)), 2, (e) => {
    const others = shuffle(sents.filter((x) => x[2] !== e[2])).slice(0, 2);
    if (others.length < 2) return null;
    return { type: 'listen', ex: e, opts: shuffle([e, ...others]) };
  }));
  // 2) Выберите слово урока для пропуска
  const lw = L.ids.map((id) => WORD_BY_ID[id]).filter((w) => !/[…]/.test(w.hz));
  tasks.push(...take(sents, 2, (e) => {
    const ch = chunkSentence(e) || [];
    const w = shuffle(lw.filter((x) => ch.includes(x.hz) || ([...x.hz].length > 1 && e[0].includes(x.hz))))[0];
    if (!w) return null;
    const opts = shuffle([w.hz, ...shuffle(lw.filter((x) => x !== w && !e[0].includes(x.hz))).slice(0, 3).map((x) => x.hz)]);
    if (opts.length < 3) return null;
    return { type: 'gap', ex: e, key: w.hz, text: e[0].replace(w.hz, '＿＿'), opts, title: 'Выберите подходящее слово' };
  }));
  // 3) Грамматика: вставьте ключевое слово темы
  const keys = [...new Set(COURSE.filter((x) => x.lvl <= L.lvl).flatMap((x) => x.gram.map((g) => g.k)).filter(Boolean))];
  L.gram.filter((g) => g.k).forEach((g) => {
    tasks.push(...take(g.ex, 1, (e) => {
      if (!e[0].includes(g.k)) return null;
      const opts = shuffle([g.k, ...shuffle(keys.filter((k) => k !== g.k && !e[0].includes(k) && !g.k.includes(k) && !k.includes(g.k))).slice(0, 3)]);
      return { type: 'gap', ex: e, key: g.k, text: e[0].replace(g.k, '＿＿'), opts, title: `Грамматика: ${g.t}` };
    }));
  });
  // 4) Порядок слов
  tasks.push(...take(sents, 2, (e) => {
    const ch = chunkSentence(e);
    if (!ch || ch.length < 3 || ch.length > 9) return null;
    return { type: 'order', ex: e, chunks: ch, picked: [] };
  }));
  // 5) Как сказать по-китайски
  tasks.push(...take(sents, 1, (e) => {
    const others = shuffle([...sents, ...levelSents].filter((x) => x[0] !== e[0])).slice(0, 2);
    return { type: 'pick', ex: e, opts: shuffle([e, ...others]) };
  }));
  return tasks;
}
function lsHomework(head) {
  const t = ls.hw[ls.i];
  if (!t) return goStep(STEP.done);
  const answered = ls.hwState !== null;
  let body = '';
  if (t.type === 'order') {
    if (!t.pool) t.pool = shuffle(t.chunks.map((c, i) => ({ c, i })));
    body = `<div class="muted small">Составьте предложение из слов: «${esc(t.ex[2])}»</div>
      <div class="build">${t.picked.map((p, j) => `<button class="tok on" data-un="${j}" ${answered ? 'disabled' : ''}>${esc(p.c)}</button>`).join('') || '<span class="muted small">нажимайте на слова ниже</span>'}</div>
      <div class="build pool">${t.pool.map((p, j) => t.picked.includes(p) ? '' : `<button class="tok" data-pk="${j}" ${answered ? 'disabled' : ''}>${esc(p.c)}</button>`).join('')}</div>`;
  } else if (t.type === 'gap') {
    body = `<div class="muted small">${esc(t.title)}</div>
      <div class="hz" style="font-size:26px;margin:10px 0">${esc(t.text)}</div>
      <div class="muted small" style="margin-bottom:10px">${esc(t.ex[2])}</div>
      <div class="tones-opts">${t.opts.map((o) => `<button class="hz ${answered ? (o === t.key ? 'right' : o === t.chosen ? 'wrong' : '') : ''}" data-gap="${esc(o)}" ${answered ? 'disabled' : ''}>${esc(o)}</button>`).join('')}</div>`;
  } else if (t.type === 'listen') {
    body = `<div class="muted small">Аудирование: послушайте фразу и выберите перевод</div>
      <div class="row" style="justify-content:center;margin:12px 0">${playBtn(t.ex[0], 'big')}<button class="btn sm" data-say="${esc(t.ex[0])}" data-rate="0.5">🐢 медленно</button></div>
      <div class="pick-opts">${t.opts.map((o, j) => `<button class="${answered ? (o === t.ex ? 'right' : j === t.chosen ? 'wrong' : '') : ''}" style="font-size:16px" data-pick="${j}" ${answered ? 'disabled' : ''}>${esc(o[2])}</button>`).join('')}</div>`;
  } else {
    body = `<div class="muted small">Как сказать по-китайски?</div>
      <div class="prompt" style="margin:8px 0">${esc(t.ex[2])}</div>
      <div class="pick-opts">${t.opts.map((o, j) => `<button class="hz ${answered ? (o === t.ex ? 'right' : j === t.chosen ? 'wrong' : '') : ''}" data-pick="${j}" ${answered ? 'disabled' : ''}>${esc(o[0])}</button>`).join('')}</div>`;
  }
  const solution = answered ? `<div class="example"><div class="answer ${ls.hwState ? 'ok' : 'bad'}">${ls.hwState ? '✅ Верно!' : '❌ Правильно так:'}</div>
      <div class="row" style="gap:10px;flex-wrap:nowrap"><div style="flex:1"><div class="hz" style="font-size:22px">${esc(t.ex[0])}</div><div class="py small">${colorPinyin(t.ex[1])}</div><div class="small">${esc(t.ex[2])}</div></div>${playBtn(t.ex[0])}</div></div>` : '';
  app.innerHTML = `${head}
    <div class="muted small" style="margin-bottom:6px">Домашнее задание · ${ls.i + 1} из ${ls.hw.length}</div>
    <div class="card">${body}${solution}</div>
    <div class="row">${answered ? '<button class="btn primary big" id="next">Дальше →</button>'
      : t.type === 'order' ? `<button class="btn" id="reset">Сбросить</button><button class="btn primary" id="checkOrder" style="flex:1" ${t.picked.length === t.chunks.length ? '' : 'disabled'}>Проверить</button>` : ''}</div>`;
  if (t.type === 'listen' && !answered && !t.played) { t.played = true; speak(t.ex[0]); }
  const finish = (ok) => { ls.hwState = ok; if (ok) ls.hwRight++; drawLesson(); speak(t.ex[0]); };
  app.querySelectorAll('[data-pk]').forEach((b) => { b.onclick = () => { t.picked.push(t.pool[+b.dataset.pk]); drawLesson(); }; });
  app.querySelectorAll('[data-un]').forEach((b) => { b.onclick = () => { t.picked.splice(+b.dataset.un, 1); drawLesson(); }; });
  const rs = document.getElementById('reset'); if (rs) rs.onclick = () => { t.picked = []; drawLesson(); };
  const co = document.getElementById('checkOrder'); if (co) co.onclick = () => finish(t.picked.map((p) => p.c).join('') === t.chunks.join(''));
  app.querySelectorAll('[data-gap]').forEach((b) => { b.onclick = () => { t.chosen = b.dataset.gap; finish(t.chosen === t.key); }; });
  app.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { t.chosen = +b.dataset.pick; finish(t.opts[t.chosen] === t.ex); }; });
  const nx = document.getElementById('next'); if (nx) nx.onclick = () => { ls.hwState = null; ls.i++; drawLesson(); };
}

/* 8. Итог */
function lsDone(head) {
  const qTotal = ls.words.length || 1, hTotal = ls.hw.length || 1;
  const score = Math.round(((ls.quizRight / qTotal) * 0.5 + (ls.hwRight / hTotal) * 0.5) * 100);
  if (!ls.saved) {
    S.course = S.course || {};
    const prev = S.course[ls.L.key];
    S.course[ls.L.key] = { date: todayKey(), score: Math.max(score, prev ? prev.score : 0), quiz: `${ls.quizRight}/${ls.words.length}`, hw: `${ls.hwRight}/${ls.hw.length}`, speak: speakAvg() != null ? Math.max(speakAvg(), (prev && prev.speak) || 0) : (prev ? prev.speak : undefined) };
    save(); ls.saved = true;
  }
  const wrong = ls.quizWrong.map((id) => WORD_BY_ID[id]);
  const next = course()[ls.L.n];
  app.innerHTML = `${head}
    <div class="card empty">
      <div class="big-emoji">${score >= 80 ? '🎉' : score >= 50 ? '👍' : '💪'}</div>
      <h2>${lessonName(ls.L)} пройден — ${score}%</h2>
      <p>Слова с первой попытки: <b>${ls.quizRight}/${ls.words.length}</b> · Домашка: <b>${ls.hwRight}/${ls.hw.length}</b>${ls.tonesSkipped ? '' : ` · Тоны: <b>${ls.toneRight}/${ls.tones.length}</b>`}${speakAvg() != null ? ` · Произношение: <b>${speakAvg()}%</b>` : ''}</p>
      ${wrong.length ? `<p class="muted small">Повторите: ${wrong.map((w) => `<span class="hz">${esc(w.hz)}</span> (${esc(w.ru)})`).join(', ')}. Эти слова придут в карточки раньше.</p>` : ''}
      <p class="muted small">Слова урока добавлены в карточки — завтра загляните в «Карточки», чтобы их повторить. Перед следующим уроком перечитайте диалог вслух.</p>
      <div class="row" style="justify-content:center">
        <button class="btn" id="redo">Пройти ещё раз</button>
        ${next ? `<a class="btn primary" href="#/lessons/${next.n}">Следующий урок →</a>` : ''}
      </div>
    </div>`;
  document.getElementById('redo').onclick = () => { startLesson(ls.L.n); router(); };
}
document.addEventListener('keydown', (e) => {
  if (location.hash !== '#/lessons/go' || !ls || e.key !== 'Enter' || e.isComposing || e.target.matches('input,button,select,textarea')) return;
  const nx = document.getElementById('next'); if (nx) { e.preventDefault(); nx.click(); }
});

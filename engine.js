(function () {
  // --- Namespace Fix for renamed elements (quiz- prefixed) ---
  const NS = 'quiz-';
  function $(sel) {
    if (sel.startsWith('#')) return document.querySelector('#' + NS + sel.slice(1));
    if (sel.startsWith('.')) return document.querySelector('.' + NS + sel.slice(1));
    return document.querySelector(sel);
  }
  function $$(sel) {
    if (sel.startsWith('#')) return Array.from(document.querySelectorAll('#' + NS + sel.slice(1)));
    if (sel.startsWith('.')) return Array.from(document.querySelectorAll('.' + NS + sel.slice(1)));
    return Array.from(document.querySelectorAll(sel));
  }

  // --- Utility helpers ---
  const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(v=>v[1]);
  const normSet = arr => new Set((arr || []).map(x => String(x).trim()).filter(Boolean));

  // --- State management ---
  const storageKey = id => `quiz-progress:${id}`;
  function saveProgress() {
    const payload = { i: state.i, answers: state.answers, score: state.score, finished: state.finished };
    localStorage.setItem(storageKey(quiz.metadata.id || 'default'), JSON.stringify(payload));
  }
  function loadProgress() {
    const raw = localStorage.getItem(storageKey(quiz.metadata.id || 'default'));
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      state.i = Math.min(Math.max(+p.i || 0, 0), quiz.questions.length - 1);
      state.answers = p.answers || {};
      state.score = +p.score || 0;
      state.finished = !!p.finished;
    } catch {}
  }
  function resetProgress() {
    localStorage.removeItem(storageKey(quiz.metadata.id || 'default'));
    quiz.questions.forEach(q => { delete q.__scored; });
    state = makeInitialState();
    document.body.classList.remove('quiz-finished');
    const btnReview = $('#btnReview');
    if (btnReview) { btnReview.disabled = true; btnReview.textContent = 'Review'; }
    const s = $('#summary');
    if (s) { s.classList.remove('active'); s.innerHTML = ''; }
    render();
  }

  // --- Initialize quiz ---
  const quiz = JSON.parse(JSON.stringify(quizData));
  if (quiz.settings?.shuffleQuestions) quiz.questions = shuffle(quiz.questions);
  quiz.questions.forEach(q => {
    if (quiz.settings?.shuffleOptions || q.shuffleOptions) q.options = shuffle(q.options);
  });

  function makeInitialState() { return { i: 0, answers: {}, score: 0, finished: false, review: false }; }
  let state = makeInitialState();
  loadProgress();

  // --- Scoring helpers ---
  function allAnswered() {
    let answered = 0;
    for (const q of quiz.questions) {
      const a = state.answers[q.id];
      if (Array.isArray(a) && a.length > 0) answered++;
    }
    return answered === quiz.questions.length;
  }

  function isQuestionCorrect(q) {
    const chosen = normSet(state.answers[q.id]);
    const correct = new Set(q.options.filter(o => o.isCorrect).map(o => String(o.id).trim()));
    return chosen.size === correct.size && [...chosen].every(v => correct.has(v));
  }

  function computeScoreFromAnswers() {
    state.score = 0;
    quiz.questions.forEach(q => {
      const ok = isQuestionCorrect(q);
      if (ok) {
        const pts = q.points ?? quiz.settings?.scoring?.defaultPoints ?? 1;
        state.score += pts;
      }
      q.__scored = ok;
    });
  }

  function maybeAutoFinish() {
    if (!state.finished && allAnswered()) finishQuiz();
  }

  // --- Rendering ---
  function renderHeaderMeta() {
    const m = quiz.metadata;
    const total = quiz.questions.length;
    $('#quizMeta').textContent = `${m.title || 'Quiz'} • ${total} question${total > 1 ? 's' : ''}`;
    $('#pillQTotal').textContent = total;
    $('#pillQNum').textContent = state.i + 1;
    $('#pillScore').textContent = `Score: ${state.score}`;
    const answeredCount = quiz.questions.reduce((n,q)=> n + ((state.answers[q.id]||[]).length>0 ? 1 : 0), 0);
    const pct = Math.round((answeredCount / total) * 100);
    $('#progressBar').style.width = pct + '%';
  }

  function renderQuestion() {
    const q = quiz.questions[state.i];
    $('#tagDifficulty').textContent = `difficulty: ${q.difficulty ?? '-'}`;
    $('#tagType').textContent = `type: ${q.type}`;

    const card = $('#qcard');
    card.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'qhead';
    head.innerHTML = `
      <div class="qtitle">${escapeHTML(q.text?.html ?? q.text?.plain ?? '')}</div>
      <div class="qmeta small">Points: ${q.points ?? quiz.settings?.scoring?.defaultPoints ?? 1}</div>
    `;
    card.appendChild(head);

    if (q.media && q.media.length) {
      const m = document.createElement('div');
      m.className = 'qmedia';
      q.media.forEach(item => {
        if (item.type === 'image') {
          const img = document.createElement('img');
          img.src = resolveSrc(item.src);
          img.alt = item.alt || '';
          m.appendChild(img);
        } else if (item.type === 'video') {
          const v = document.createElement('video');
          v.src = resolveSrc(item.src);
          v.controls = true;
          v.playsInline = true;
          v.preload = 'metadata';
          m.appendChild(v);
        }
      });
      card.appendChild(m);
    }

    const isMulti = q.type === 'multiple_choice_multiple';
    const groupName = `q-${q.id}`;
    const wrap = document.createElement('div');
    wrap.className = 'options';
    const prevAns = state.answers[q.id] || [];

    q.options.forEach((opt, idx) => {
      const id = `${groupName}-opt-${idx}`;
      const label = document.createElement('label');
      label.className = 'option';
      const input = document.createElement('input');
      input.type = isMulti ? 'checkbox' : 'radio';
      input.name = groupName;
      input.value = opt.id;
      input.id = id;
      input.checked = prevAns.includes(opt.id);
      input.addEventListener('change', () => onSelect(q, opt, isMulti));
      const text = document.createElement('div');
      text.className = 'label';
      text.innerHTML = escapeHTML(opt.text);
      label.appendChild(input);
      label.appendChild(text);
      wrap.appendChild(label);
    });
    card.appendChild(wrap);

    const fb = document.createElement('div');
    fb.id = 'feedback';
    card.appendChild(fb);

    const footer = document.createElement('div');
    footer.className = 'footer';
    const left = document.createElement('div');
    left.className = 'small';
    left.textContent = isMulti ? 'Select all correct answers' : 'Select one answer';
    const navWrap = document.createElement('div');
    navWrap.className = 'nav-wrap';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '← Prev';
    prevBtn.id = 'btnPrevInline';
    prevBtn.className = 'ghost';
    prevBtn.disabled = state.i === 0;
    prevBtn.addEventListener('click', () => {
      if (state.i > 0) { state.i--; saveProgress(); render(); }
    });

    const checkBtn = document.createElement('button');
    checkBtn.textContent = 'Check Answer';
    checkBtn.id = 'btnCheckInline';
    checkBtn.addEventListener('click', () => {
      checkAnswer(q);
      saveProgress();
      renderHeaderMeta();
      maybeAutoFinish();
    });

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next →';
    nextBtn.id = 'btnNextInline';
    nextBtn.disabled = state.i >= quiz.questions.length - 1;
    nextBtn.addEventListener('click', () => {
      if (state.i < quiz.questions.length - 1) { state.i++; saveProgress(); render(); }
    });

    navWrap.append(prevBtn, checkBtn, nextBtn);
    footer.append(left, navWrap);
    card.appendChild(footer);

    if (state.review || state.finished) checkAnswer(q, true);
    if ($('#btnPrev')) $('#btnPrev').disabled = state.i === 0;
    if ($('#btnNext')) $('#btnNext').disabled = state.i >= quiz.questions.length - 1;
    $('#btnReview').disabled = !state.finished;
    renderHeaderMeta();
  }

  function onSelect(q, opt, isMulti) {
    const arr = state.answers[q.id] ? [...state.answers[q.id]] : [];
    if (isMulti) {
      if (arr.includes(opt.id)) {
        const next = arr.filter(v => v !== opt.id);
        state.answers[q.id] = next;
        if (next.length === 0) delete state.answers[q.id];
      } else {
        arr.push(opt.id);
        state.answers[q.id] = arr;
      }
    } else {
      state.answers[q.id] = [opt.id];
    }
    saveProgress();
    renderHeaderMeta();
    maybeAutoFinish();
  }

  function checkAnswer(q, silent = false) {
    const chosen = normSet(state.answers[q.id]);
    const correctSet = new Set(q.options.filter(o => o.isCorrect).map(o => String(o.id).trim()));
    $$('.option').forEach(lbl => {
      const input = lbl.querySelector('input');
      const id = String(input.value).trim();
      lbl.classList.remove('correct','wrong');
      if (chosen.has(id) && correctSet.has(id)) lbl.classList.add('correct');
      if (chosen.has(id) && !correctSet.has(id)) lbl.classList.add('wrong');
    });
    const allCorrect = chosen.size === correctSet.size && [...chosen].every(v => correctSet.has(v));
    if (!silent) {
      const fb = $('#feedback');
      fb.className = 'feedback ' + (allCorrect ? 'ok' : 'no');
      fb.innerHTML = allCorrect
        ? `<strong>Correct!</strong>`
        : `<strong>Not quite.</strong>`;
      const previouslyScored = q.__scored === true;
      if (allCorrect && !previouslyScored) {
        const pts = q.points ?? 1;
        state.score += pts;
        q.__scored = true;
        saveProgress();
        renderHeaderMeta();
      }
    }
    return allCorrect;
  }

  function resolveSrc(src) {
    const base = quiz.assets?.baseUrl || '';
    if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
    return base.replace(/\/$/, '') + '/' + src.replace(/^\//, '');
  }

  function renderSummary() {
    const s = $('#summary');
    const totalPts = quiz.questions.reduce((a,q)=> a + (q.points ?? 1), 0);
    s.classList.add('active');
    s.innerHTML = `
      <h2 style="margin:0 0 8px;">Quiz Summary</h2>
      <div class="small">${escapeHTML(quiz.metadata.title)} • ${quiz.questions.length} questions</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin:12px 0 16px;">
        <span class="pill">Score: ${state.score} / ${totalPts}</span>
        <span class="pill">Completed: ${Object.values(state.answers).filter(a=>a&&a.length>0).length}/${quiz.questions.length}</span>
      </div>
    `;
  }

  function finishQuiz() {
    computeScoreFromAnswers();
    const totalPts = quiz.questions.reduce((a,q)=> a + (q.points ?? 1), 0);
    const allCorrect = state.score === totalPts;
    state.finished = true;
    saveProgress();
    $('#btnReview').disabled = false;
    document.body.classList.add('quiz-finished');
    renderSummary();
    renderHeaderMeta();
  }

  function render() {
    renderQuestion();
    if (state.finished) renderSummary();
    else { $('#summary').classList.remove('active'); $('#summary').innerHTML = ''; }
    maybeAutoFinish();
    document.body.classList.toggle('quiz-finished', !!state.finished);
  }

  // --- Event bindings ---
  if ($('#btnNext')) $('#btnNext').addEventListener('click', () => { if (state.i < quiz.questions.length - 1) { state.i++; saveProgress(); render(); } });
  if ($('#btnPrev')) $('#btnPrev').addEventListener('click', () => { if (state.i > 0) { state.i--; saveProgress(); render(); } });
  $('#btnFinish').addEventListener('click', () => finishQuiz());
  $('#btnReset').addEventListener('click', () => { if (confirm('Clear saved progress?')) resetProgress(); });
  $('#btnReview').addEventListener('click', () => { state.review = !state.review; $('#btnReview').textContent = state.review ? 'Exit Review' : 'Review'; render(); });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && $('#btnNext')) $('#btnNext').click();
    if (e.key === 'ArrowLeft'  && $('#btnPrev')) $('#btnPrev').click();
  });

  function escapeHTML(str) {
    return String(str ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  }

  // Initial render
  render();
  maybeAutoFinish();

})();

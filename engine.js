(function () {
  // --- Utility helpers ---
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const shuffle = arr => arr.map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(v=>v[1]);
  const normSet = arr => new Set((arr || []).map(x => String(x).trim()).filter(Boolean));

  // --- State management ---
  const storageKey = id => `quiz-progress:${id}`;
  function saveProgress() {
    const payload = { i: state.i, answers: state.answers, score: state.score, finished: state.finished };
    localStorage.setItem(storageKey(quiz.metadata.id), JSON.stringify(payload));
  }
  function loadProgress() {
    const raw = localStorage.getItem(storageKey(quiz.metadata.id));
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
  localStorage.removeItem(storageKey(quiz.metadata.id));

  // clear any per-question scoring flags
  quiz.questions.forEach(q => { delete q.__scored; });

  // reset state
  state = makeInitialState();

  // remove finished UI state
  document.body.classList.remove('quiz-finished');

  // reset Review button + summary block
  const btnReview = $('#btnReview');
  if (btnReview) { btnReview.disabled = true; btnReview.textContent = 'Review'; }
  const s = $('#summary');
  if (s) { s.classList.remove('active'); s.innerHTML = ''; }

  render();
}


  // --- Initialize quiz (shuffle once) ---
  const quiz = JSON.parse(JSON.stringify(quizData));
  if (quiz.settings?.shuffleQuestions) quiz.questions = shuffle(quiz.questions);
  quiz.questions.forEach(q => { if (quiz.settings?.shuffleOptions || q.shuffleOptions) q.options = shuffle(q.options); });

  function makeInitialState() { return { i: 0, answers: {}, score: 0, finished: false, review: false }; }
  let state = makeInitialState();
  loadProgress();

  // -----------------------------
  // Auto-finish + reliable scoring
  // -----------------------------
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
      q.__scored = ok; // prevent later double-award
    });
  }

  function maybeAutoFinish() {
    if (!state.finished && allAnswered()) {
      finishQuiz();
    }
  }
  // -----------------------------

  // --- Rendering ---
  function renderHeaderMeta() {
    const m = quiz.metadata;
    const total = quiz.questions.length;
    $('#quizMeta').textContent = `${m.title} • ${m.subject} • ${total} question${total>1?'s':''}`;
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

    // Media
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
          v.src = resolveSrc(item.src); v.controls = true; v.playsInline = true; v.preload = 'metadata';
          m.appendChild(v);
        }
      });
      card.appendChild(m);
    }

    // Options
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

    // Feedback / explanation container
    const fb = document.createElement('div');
    fb.id = 'feedback';
    card.appendChild(fb);

    // Footer controls 
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
      const ok = checkAnswer(q);
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

    // Review state visuals
    if (state.review || state.finished) {
      checkAnswer(q, /*silent*/ true);
    }

    // Sidebar button states
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
        if (next.length === 0) delete state.answers[q.id]; // don't count empties
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

    // Visuals
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
        ? `<strong>Correct!</strong> ${escapeHTML(pickFeedback(q, chosen))}`
        : `<strong>Not quite.</strong> ${escapeHTML(pickFeedback(q, chosen))}`;

      // award once if first time made fully correct
      const previouslyScored = (q.__scored === true);
      if (allCorrect && !previouslyScored) {
        const pts = q.points ?? quiz.settings?.scoring?.defaultPoints ?? 1;
        state.score += pts;
        q.__scored = true;
        saveProgress();
        renderHeaderMeta();
      }
    }
    return allCorrect;
  }

  function pickFeedback(q, chosen) {
    const fb = [];
    q.options.forEach(o => { if (chosen.has(String(o.id).trim()) && o.feedback) fb.push(o.feedback); });
    if (fb.length) return fb.join(' ');
    return quiz.settings?.showExplanations && q.explanation ? q.explanation : '';
  }

  function resolveSrc(src) {
    const base = quiz.assets?.baseUrl || '';
    if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return src;
    return base.replace(/\/$/, '') + '/' + src.replace(/^\//, '');
  }

  function renderSummary() {
    const s = $('#summary');
    const totalPts = quiz.questions.reduce((a,q)=> a + (q.points ?? quiz.settings?.scoring?.defaultPoints ?? 1), 0);
    s.classList.add('active');
    s.innerHTML = `
      <h2 style="margin:0 0 8px;">Quiz Summary</h2>
      <div class="small">${escapeHTML(quiz.metadata.title)} • ${quiz.questions.length} questions</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin:12px 0 16px;">
        <span class="pill">Score: ${state.score} / ${totalPts}</span>
        <span class="pill">Completed: ${Object.values(state.answers).filter(a=>a&&a.length>0).length}/${quiz.questions.length}</span>
      </div>
      <div style="display:grid; gap:10px;">
        ${quiz.questions.map((q,idx)=>{
          const chosen = normSet(state.answers[q.id]);
          const correctSet = new Set(q.options.filter(o=>o.isCorrect).map(o=>String(o.id).trim()));
          const ok = chosen.size === correctSet.size && [...chosen].every(v => correctSet.has(v));
          return `
            <div class="panel" style="padding:12px">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline;">
                <div style="font-weight:700;">Q${idx+1}. ${escapeHTML(q.text?.plain || q.text?.html || '')}</div>
                <div class="tag">${ok ? '✔ Correct' : '✖ Incorrect'}</div>
              </div>
              <div class="small" style="margin-top:6px;">Your answer: ${[...chosen].join(', ') || '-'} • Correct: ${[...correctSet].join(', ')}</div>
              ${q.explanation ? `<div class="feedback" style="margin-top:8px;">${escapeHTML(q.explanation)}</div>` : ''}
            </div>`;
        }).join('')}
      </div>
    `;
  }
function makeOverlay(bannerText, perfect=false, confettiCount=80) {
  const overlay = document.createElement('div');
  overlay.className = 'celebrate';

  const banner = document.createElement('div');
  banner.className = 'banner' + (perfect ? ' perfect' : '');
  banner.textContent = bannerText;
  overlay.appendChild(banner);

  document.body.appendChild(overlay);

  // spawn confetti
  spawnConfetti(confettiCount, perfect);

  // remove overlay after animation
  setTimeout(() => overlay.remove(), 3200);
}

function spawnConfetti(n=80, perfect=false) {
  const colors = perfect
    ? ['#6effc5','#9ec4ff','#f7c948','#ff6b6b','#e6ecff']
    : ['#9ec4ff','#e6ecff','#6effc5'];
  for (let i=0;i<n;i++){
    const bit = document.createElement('div');
    bit.className = 'confetti';
    const x = Math.random()*100;            // vw start
    const xEnd = x + (Math.random()*20-10); // drift
    const dur = 2.0 + Math.random()*1.6;    // 2–3.6s
    const rot = Math.random()*360+'deg';
    const color = colors[i % colors.length];
    bit.style.background = color;
    bit.style.left = x+'vw';
    bit.style.setProperty('--x', '0vw');
    bit.style.setProperty('--x-end', (xEnd-x)+'vw');
    bit.style.setProperty('--r', rot);
    bit.style.animationDuration = dur+'s';
    document.body.appendChild(bit);
    setTimeout(()=>bit.remove(), dur*1000 + 200);
  }
}

function finishQuiz() {
  computeScoreFromAnswers();

  // determine perfect
  const totalPts = quiz.questions.reduce((a,q)=> a + (q.points ?? quiz.settings?.scoring?.defaultPoints ?? 1), 0);
  const allCorrect = (state.score === totalPts);

  state.finished = true;
  saveProgress();
  $('#btnReview').disabled = false;
  document.body.classList.add('quiz-finished');

  // Effects 🎉
  if (allCorrect) {
    // glow the score pill
    const pill = document.getElementById('pillScore');
    if (pill) { pill.classList.add('glow'); setTimeout(()=>pill.classList.remove('glow'), 3000); }
    makeOverlay('Perfect score! 🎯', true, 150);
  } else {
    makeOverlay('Completed! ✅', false, 80);
  }

  renderSummary();
  renderHeaderMeta();
}


  function render() {
    renderQuestion();
    if (state.finished) renderSummary();
    else { $('#summary').classList.remove('active'); $('#summary').innerHTML = ''; }
    maybeAutoFinish();
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

  // Initial render + handle restored state
  render();
  maybeAutoFinish(); // in case restored answers already complete
})();



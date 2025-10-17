(function () {
  // ---------------------------
  // Constructor
  // ---------------------------
  function QuizEngine(root) {
    this.root = root;
    this.quiz = null;
    this.state = { i: 0, answers: {}, score: 0, finished: false, review: false };
  }

  // ---------------------------
  // Load (URL string or object)
  // ---------------------------
  QuizEngine.prototype.load = async function (packed) {
    if (typeof packed === "string") {
      const res = await fetch(packed, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to load quiz: ${res.status}`);
      this.quiz = await res.json();
    } else {
      this.quiz = JSON.parse(JSON.stringify(packed || {}));
    }
    if (!this.quiz || !Array.isArray(this.quiz.questions))
      throw new Error("Invalid quiz data: missing questions array");

    // Shuffle according to settings
    if (this.quiz.settings?.shuffleQuestions)
      this.quiz.questions = shuffle(this.quiz.questions);
    this.quiz.questions.forEach((q) => {
      if (this.quiz.settings?.shuffleOptions || q.shuffleOptions)
        q.options = shuffle(q.options);
    });

    // Restore progress and render
    this.restore();
    this.render();
  };

  // ---------------------------
  // Persistence
  // ---------------------------
  QuizEngine.prototype.key = function () {
    const id = this.quiz?.metadata?.id || "anon";
    return `quiz-progress:${id}`;
  };

  QuizEngine.prototype.save = function () {
    if (!this.quiz) return;
    const p = {
      i: this.state.i,
      answers: this.state.answers,
      score: this.state.score,
      finished: this.state.finished,
    };
    localStorage.setItem(this.key(), JSON.stringify(p));
  };

  QuizEngine.prototype.restore = function () {
    if (!this.quiz) return;
    const raw = localStorage.getItem(this.key());
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      this.state.i = Math.min(
        Math.max(+p.i || 0, 0),
        this.quiz.questions.length - 1
      );
      this.state.answers = p.answers || {};
      this.state.score = +p.score || 0;
      this.state.finished = !!p.finished;
    } catch {}
  };

  QuizEngine.prototype.reset = function () {
    localStorage.removeItem(this.key());
    this.state = { i: 0, answers: {}, score: 0, finished: false, review: false };
    this.render();
  };

  // ---------------------------
  // Helpers
  // ---------------------------
  QuizEngine.prototype.resolveSrc = function (src) {
    const base = this.quiz?.assets?.baseUrl || "";
    if (/^https?:\/\//i.test(src) || src?.startsWith("data:")) return src;
    return base.replace(/\/$/, "") + "/" + String(src || "").replace(/^\//, "");
  };

  function el(sel) { return document.querySelector(sel); }
  function els(sel) { return Array.from(document.querySelectorAll(sel)); }
  function shuffle(arr) {
    return (arr || []).map(v => [Math.random(), v]).sort((a,b)=>a[0]-b[0]).map(v=>v[1]);
  }
  function esc(str){ return String(str ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

  // ---------------------------
  // Render
  // ---------------------------
  QuizEngine.prototype.renderHeader = function () {
    if (!this.quiz) return;
    const m = this.quiz.metadata || {};
    const total = this.quiz.questions.length;

    const meta = el("#quizMeta");
    if (meta) meta.textContent = `${m.title || "Quiz"} • ${m.subject || "-"} • ${total} question${total>1?"s":""}`;

    const tTotal = el("#pillQTotal"); if (tTotal) tTotal.textContent = total;
    const tNum = el("#pillQNum"); if (tNum) tNum.textContent = this.state.i + 1;
    const pillScore = el("#pillScore"); if (pillScore) pillScore.textContent = `Score: ${this.state.score}`;

    const progress = el("#progressBar");
    if (progress) {
      const pct = Math.round((Object.keys(this.state.answers).length / total) * 100);
      progress.style.width = pct + "%";
    }
  };

  QuizEngine.prototype.render = function () {
    if (!this.quiz) return;
    const q = this.quiz.questions[this.state.i];

    const tagDiff = el("#tagDifficulty");
    if (tagDiff) tagDiff.textContent = `difficulty: ${q.difficulty ?? "-"}`;
    const tagType = el("#tagType");
    if (tagType) tagType.textContent = `type: ${q.type}`;

    const card = el("#qcard");
    if (!card) return;
    card.innerHTML = "";

    // Header
    const head = document.createElement("div");
    head.className = "qhead";
    head.innerHTML = `
      <div class="qtitle">${esc(q.text?.html ?? q.text?.plain ?? "")}</div>
      <div class="qmeta small">Points: ${q.points ?? this.quiz.settings?.scoring?.defaultPoints ?? 1}</div>
    `;
    card.appendChild(head);

    // Media
    if (q.media && q.media.length) {
      const m = document.createElement("div");
      m.className = "qmedia";
      q.media.forEach((item) => {
        if (item.type === "image") {
          const img = document.createElement("img");
          img.src = this.resolveSrc(item.src);
          img.alt = item.alt || "";
          m.appendChild(img);
        } else if (item.type === "video") {
          const v = document.createElement("video");
          v.src = this.resolveSrc(item.src);
          v.controls = true; v.playsInline = true; v.preload = "metadata";
          m.appendChild(v);
        }
      });
      card.appendChild(m);
    }

    // Options
    const isMulti = q.type === "multiple_choice_multiple";
    const groupName = `q-${q.id}`;
    const wrap = document.createElement("div");
    wrap.className = "options";

    const prevAns = this.state.answers[q.id] || [];
    (q.options || []).forEach((opt, idx) => {
      const id = `${groupName}-opt-${idx}`;
      const label = document.createElement("label");
      label.className = "option";
      const input = document.createElement("input");
      input.type = isMulti ? "checkbox" : "radio";
      input.name = groupName;
      input.value = opt.id;
      input.id = id;
      input.checked = prevAns.includes(opt.id);
      input.addEventListener("change", () => this.onSelect(q, opt, isMulti));
      const text = document.createElement("div");
      text.className = "label";
      text.innerHTML = esc(opt.text);
      label.appendChild(input);
      label.appendChild(text);
      wrap.appendChild(label);
    });
    card.appendChild(wrap);

    // Feedback
    const fb = document.createElement("div");
    fb.id = "feedback";
    card.appendChild(fb);

    // Footer
    const footer = document.createElement("div");
    footer.className = "footer";
    const left = document.createElement("div");
    left.className = "small";
    left.textContent = isMulti ? "Select all correct answers" : "Select one answer";
    const right = document.createElement("div");
    const checkBtn = document.createElement("button");
    checkBtn.textContent = "Check Answer";
    checkBtn.addEventListener("click", () => this.checkAnswer(q));
    right.appendChild(checkBtn);
    footer.appendChild(left);
    footer.appendChild(right);
    card.appendChild(footer);

    // Controls state
    const btnPrev = el("#btnPrev"); if (btnPrev) btnPrev.disabled = this.state.i === 0;
    const btnNext = el("#btnNext"); if (btnNext) btnNext.disabled = this.state.i >= this.quiz.questions.length - 1;
    const btnReview = el("#btnReview"); if (btnReview) btnReview.disabled = !this.state.finished;

    // Review state
    if (this.state.review || this.state.finished) this.checkAnswer(q, true);

    this.renderHeader();
  };

  QuizEngine.prototype.onSelect = function (q, opt, isMulti) {
    const arr = this.state.answers[q.id] ? [...this.state.answers[q.id]] : [];
    if (isMulti) {
      if (arr.includes(opt.id)) this.state.answers[q.id] = arr.filter((v) => v !== opt.id);
      else { arr.push(opt.id); this.state.answers[q.id] = arr; }
    } else {
      this.state.answers[q.id] = [opt.id];
    }
    this.save();
    this.renderHeader();
  };

  QuizEngine.prototype.checkAnswer = function (q, silent = false) {
    const chosen = new Set(this.state.answers[q.id] || []);
    const correctSet = new Set((q.options || []).filter((o) => o.isCorrect).map((o) => o.id));

    els(".option").forEach((lbl) => {
      const input = lbl.querySelector("input");
      const id = input?.value;
      lbl.classList.remove("correct", "wrong");
      if (id && chosen.has(id) && correctSet.has(id)) lbl.classList.add("correct");
      if (id && chosen.has(id) && !correctSet.has(id)) lbl.classList.add("wrong");
    });

    const allCorrect = this.equalSets(chosen, correctSet);
    if (!silent) {
      const fb = el("#feedback");
      if (fb) {
        fb.className = "feedback " + (allCorrect ? "ok" : "no");
        const detail = this.pickFeedback(q, chosen);
        fb.innerHTML = (allCorrect ? "<strong>Correct!</strong> " : "<strong>Not quite.</strong> ") + esc(detail);
      }
      if (allCorrect && q.__scored !== true) {
        const pts = q.points ?? this.quiz.settings?.scoring?.defaultPoints ?? 1;
        this.state.score += pts; q.__scored = true; this.save(); this.renderHeader();
      }
    }
    return allCorrect;
  };

  QuizEngine.prototype.pickFeedback = function (q, chosen) {
    const fb = [];
    (q.options || []).forEach((o) => {
      if (chosen.has(o.id) && o.feedback) fb.push(o.feedback);
    });
    if (fb.length) return fb.join(" ");
    return this.quiz.settings?.showExplanations && q.explanation ? q.explanation : "";
  };

  QuizEngine.prototype.equalSets = function (a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  };

  QuizEngine.prototype.finish = function () {
    this.state.finished = true;
    this.save();
    const btnReview = el("#btnReview"); if (btnReview) btnReview.disabled = false;
    this.renderSummary();
  };

  QuizEngine.prototype.renderSummary = function () {
    const s = el("#summary");
    if (!s) return;
    const totalPts = this.quiz.questions.reduce(
      (a, q) => a + (q.points ?? this.quiz.settings?.scoring?.defaultPoints ?? 1),
      0
    );
    s.classList.add("active");
    s.innerHTML = `
      <h2 style="margin:0 0 8px;">Quiz Summary</h2>
      <div class="small">${esc(this.quiz.metadata?.title || "")} • ${this.quiz.questions.length} questions</div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin:12px 0 16px;">
        <span class="pill">Score: ${this.state.score} / ${totalPts}</span>
        <span class="pill">Completed: ${Object.keys(this.state.answers).length}/${this.quiz.questions.length}</span>
      </div>
      <div style="display:grid; gap:10px;">
        ${this.quiz.questions.map((q, idx) => {
          const chosen = new Set(this.state.answers[q.id] || []);
          const correctSet = new Set((q.options || []).filter(o => o.isCorrect).map(o => o.id));
          const ok = this.equalSets(chosen, correctSet);
          return `
            <div class="panel" style="padding:12px">
              <div style="display:flex; justify-content:space-between; gap:10px; align-items:baseline;">
                <div style="font-weight:700;">Q${idx + 1}. ${esc(q.text?.plain || q.text?.html || "")}</div>
                <div class="tag">${ok ? "✔ Correct" : "✖ Incorrect"}</div>
              </div>
              <div class="small" style="margin-top:6px;">Your answer: ${[...chosen].join(", ") || "-"} • Correct: ${[...correctSet].join(", ")}</div>
              ${q.explanation ? `<div class="feedback" style="margin-top:8px;">${esc(q.explanation)}</div>` : ""}
            </div>`;
        }).join("")}
      </div>
    `;
  };

  // Expose
  window.QuizEngine = QuizEngine;
})();

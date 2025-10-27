(function () {
  const $ = (s) => document.querySelector(s);
  const normSet = (arr) =>
    new Set((arr || []).map((x) => String(x).trim()).filter(Boolean));

  const quiz = window.quizData;
  if (!quiz) {
    console.error("❌ quizData not found");
    return;
  }

  let state = { i: 0, answers: {}, score: 0, finished: false };
  const storageKey = (id) => `quiz-progress:${id}`;

  function saveProgress() {
    localStorage.setItem(storageKey(quiz.metadata.id), JSON.stringify(state));
  }

  function resetProgress() {
    localStorage.removeItem(storageKey(quiz.metadata.id));
    quiz.questions.forEach((q) => delete q.__scored);
    state = { i: 0, answers: {}, score: 0, finished: false };
    render();
  }

  function isQuestionCorrect(q) {
    const chosen = normSet(state.answers[q.id]);
    const correct = new Set(
      q.options.filter((o) => o.isCorrect).map((o) => String(o.id).trim())
    );
    return (
      chosen.size === correct.size && [...chosen].every((v) => correct.has(v))
    );
  }

  function computeScoreFromAnswers() {
    state.score = 0;
    quiz.questions.forEach((q) => {
      if (isQuestionCorrect(q)) state.score += q.points || 1;
    });
  }

  function renderHeaderMeta() {
    const total = quiz.questions.length;
    $("#quizMeta").textContent = `${quiz.metadata.title} • ${total} Soalan`;
  }

  function renderQuestion() {
    const q = quiz.questions[state.i];
    const card = $("#quiz-qcard");
    card.innerHTML = "";

    const head = document.createElement("div");
    head.innerHTML = `<div class="quiz-qtitle">${q.text.plain}</div>
                      <div class="quiz-qmeta">Points: ${q.points}</div>`;
    card.appendChild(head);
    
if (q.media && q.media.length) {
  const m = document.createElement("div");
  m.className = "quiz-qmedia";

  q.media.forEach((item) => {
    if (item.type === "image") {
      const img = document.createElement("img");
      img.src = item.src;
      img.alt = item.alt || "";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "10px";

      img.onerror = () => {
        console.warn(`⚠️ Image failed to load: ${item.src}`);
        img.remove(); // remove the broken <img>
        // Optional: remove the entire container if all images fail
        if (!m.querySelector("img, video")) m.remove();
      };

      m.appendChild(img);
    } else if (item.type === "video") {
      const v = document.createElement("video");
      v.src = item.src;
      v.controls = true;
      v.playsInline = true;
      v.preload = "metadata";
      m.appendChild(v);
    }
  });

  if (m.children.length > 0) card.appendChild(m);
}

    const wrap = document.createElement("div");
    wrap.className = "quiz-options";
    const prev = state.answers[q.id] || [];

    q.options.forEach((opt) => {
      const lbl = document.createElement("label");
      lbl.className = "quiz-option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.id;
      input.value = opt.id;
      input.checked = prev.includes(opt.id);
      input.addEventListener("change", () => onSelect(q, opt));
      const txt = document.createElement("div");
      txt.textContent = opt.text;
      lbl.append(input, txt);
      wrap.appendChild(lbl);
    });

    card.appendChild(wrap);

    const fb = document.createElement("div");
    fb.id = "quiz-feedback";
    fb.className = "quiz-feedback";
    card.appendChild(fb);

    // --- Footer buttons (Prev, Check, Next)
    const footer = document.createElement("div");
    footer.style.marginTop = "16px";
    footer.style.display = "flex";
    footer.style.gap = "8px";
    footer.style.justifyContent = "space-between";

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "← Prev";
    prevBtn.className = "quiz-button-ghost";
    prevBtn.disabled = state.i === 0;
    prevBtn.onclick = () => {
      if (state.i > 0) {
        state.i--;
        saveProgress();
        render();
      }
    };

    const checkBtn = document.createElement("button");
    checkBtn.textContent = "Check Answer";
    checkBtn.className = "quiz-btn";
    checkBtn.onclick = () => checkAnswer(q);

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next →";
    nextBtn.className = "quiz-btn";
    nextBtn.disabled = state.i >= quiz.questions.length - 1;
    nextBtn.onclick = () => {
      if (state.i < quiz.questions.length - 1) {
        state.i++;
        saveProgress();
        render();
      }
    };

    footer.append(prevBtn, checkBtn, nextBtn);
    card.appendChild(footer);

    renderHeaderMeta();
  }

  function onSelect(q, opt) {
    state.answers[q.id] = [opt.id];
    saveProgress();
  }

  function checkAnswer(q) {
    const chosen = normSet(state.answers[q.id]);
    const correctSet = new Set(
      q.options.filter((o) => o.isCorrect).map((o) => String(o.id).trim())
    );
    const fb = $("#quiz-feedback");
    const ok =
      chosen.size === correctSet.size &&
      [...chosen].every((v) => correctSet.has(v));
    fb.className = "quiz-feedback " + (ok ? "ok" : "no");
    fb.textContent = ok ? "✅ Correct!" : "❌ Not quite.";
    if (ok && !q.__scored) {
      state.score += q.points || 1;
      q.__scored = true;
    }
  }

  function finishQuiz() {
    computeScoreFromAnswers();
    state.finished = true;
    const totalPts = quiz.questions.reduce((a, q) => a + (q.points || 1), 0);
    makeOverlay(
      state.score === totalPts ? "Perfect score! 🎯" : "Completed! ✅",
      state.score === totalPts,
      100
    );
    renderSummary();
  }

  function renderSummary() {
    const s = $("#quiz-summary");
    const totalPts = quiz.questions.reduce((a, q) => a + (q.points || 1), 0);
    s.innerHTML = `
      <h2 style="margin-bottom:8px;">🎯 Quiz Summary</h2>
      <p style="margin-bottom:12px;">Score: ${state.score}/${totalPts}</p>
      ${quiz.questions
        .map((q, i) => {
          const chosen = normSet(state.answers[q.id]);
          const correct = new Set(
            q.options.filter((o) => o.isCorrect).map((o) => String(o.id).trim())
          );
          const ok =
            chosen.size === correct.size &&
            [...chosen].every((v) => correct.has(v));
          const userAnswer =
            [...chosen]
              .map((id) => q.options.find((o) => o.id === id)?.text || id)
              .join(", ") || "-";
          const correctAnswer = [...correct]
            .map((id) => q.options.find((o) => o.id === id)?.text || id)
            .join(", ");
          return `<div style="background:${
            ok ? "rgba(46,204,113,.1)" : "rgba(255,107,107,.1)"
          };border-left:5px solid ${
            ok ? "#2ecc71" : "#ff6b6b"
          };padding:12px;border-radius:10px;">
            <b>Q${i + 1}.</b> ${q.text.plain}<br>
            <strong>Your:</strong> ${userAnswer}<br>
            <strong>Correct:</strong> ${correctAnswer}
          </div>`;
        })
        .join("")}`;
  }

  function makeOverlay(text, perfect = false, count = 80) {
    const overlay = document.createElement("div");
    overlay.className = "celebrate";
    const banner = document.createElement("div");
    banner.className = "banner";
    banner.textContent = text;
    overlay.appendChild(banner);
    document.body.appendChild(overlay);
    spawnConfetti(count, perfect);
    setTimeout(() => overlay.remove(), 3200);
  }

  function spawnConfetti(n = 80, perfect = false) {
    const colors = perfect
      ? ["#6effc5", "#9ec4ff", "#f7c948", "#ff6b6b", "#e6ecff"]
      : ["#9ec4ff", "#e6ecff", "#6effc5"];
    for (let i = 0; i < n; i++) {
      const bit = document.createElement("div");
      bit.className = "confetti";
      const x = Math.random() * 100;
      const xEnd = x + (Math.random() * 20 - 10);
      const dur = 2 + Math.random() * 1.6;
      const rot = Math.random() * 360 + "deg";
      bit.style.background = colors[i % colors.length];
      bit.style.left = x + "vw";
      bit.style.setProperty("--x", "0vw");
      bit.style.setProperty("--x-end", xEnd - x + "vw");
      bit.style.setProperty("--r", rot);
      bit.style.animationDuration = dur + "s";
      document.body.appendChild(bit);
      setTimeout(() => bit.remove(), dur * 1000 + 200);
    }
  }

  $("#quiz-btnFinish").onclick = () => finishQuiz();
  $("#quiz-btnReset").onclick = () => {
    if (confirm("Clear progress?")) resetProgress();
  };

  function render() {
    renderQuestion();
    renderHeaderMeta();
  }
  render();
})();




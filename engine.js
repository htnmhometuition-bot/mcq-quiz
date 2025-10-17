(function(){
QuizEngine.prototype.pickFeedback = function(q, chosen){
const fb = [];
q.options.forEach(o => { if (chosen.has(o.id) && o.feedback) fb.push(o.feedback); });
if (fb.length) return fb.join(' ');
return this.quiz.settings?.showExplanations && q.explanation ? q.explanation : '';
};


QuizEngine.prototype.equalSets = function(a,b){ if (a.size!==b.size) return false; for (const v of a) if (!b.has(v)) return false; return true; };


QuizEngine.prototype.finish = function(){ this.state.finished = true; this.save(); $('#btnReview').disabled = false; this.renderSummary(); };


QuizEngine.prototype.renderSummary = function(){
const s = $('#summary');
const totalPts = this.quiz.questions.reduce((a,q)=> a + (q.points ?? this.quiz.settings?.scoring?.defaultPoints ?? 1), 0);
s.classList.add('active');
s.innerHTML = `
<h2 style="margin:0 0 8px;">Quiz Summary</h2>
<div class="small">${escapeHTML(this.quiz.metadata.title)} • ${this.quiz.questions.length} questions</div>
<div style="display:flex; gap:10px; flex-wrap:wrap; margin:12px 0 16px;">
<span class="pill">Score: ${this.state.score} / ${totalPts}</span>
<span class="pill">Completed: ${Object.keys(this.state.answers).length}/${this.quiz.questions.length}</span>
</div>
<div style="display:grid; gap:10px;">
${this.quiz.questions.map((q,idx)=>{
const chosen = new Set(this.state.answers[q.id] || []);
const correctSet = new Set(q.options.filter(o=>o.isCorrect).map(o=>o.id));
const ok = this.equalSets(chosen, correctSet);
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
};


window.QuizEngine = QuizEngine;
})();
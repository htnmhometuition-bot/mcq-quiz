(function(){
const engine = new QuizEngine(document.getElementById('app'));


// Wire buttons
$('#btnNext').addEventListener('click', () => { if (engine.state.i < engine.quiz.questions.length - 1) { engine.state.i++; engine.save(); engine.render(); } });
$('#btnPrev').addEventListener('click', () => { if (engine.state.i > 0) { engine.state.i--; engine.save(); engine.render(); } });
$('#btnFinish').addEventListener('click', () => engine.finish());
$('#btnReset').addEventListener('click', () => { if (confirm('Clear saved progress?')) engine.reset(); });
$('#btnReview').addEventListener('click', () => { engine.state.review = !engine.state.review; $('#btnReview').textContent = engine.state.review ? 'Exit Review' : 'Review'; engine.render(); });


// URL param ?quiz=/quizzes/sample.json
const urlQuiz = new URLSearchParams(location.search).get('quiz');
const defaultPack = urlQuiz || '/quizzes/sample.json';


// Manual loader
$('#btnLoad').addEventListener('click', async () => {
const u = $('#quizUrl').value.trim(); if (!u) return;
await engine.load(u).catch(e => alert(e.message));
});


$('#quizUrl').value = defaultPack;
engine.load(defaultPack).catch(e => alert(e.message));
})();
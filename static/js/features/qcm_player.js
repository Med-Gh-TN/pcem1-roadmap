/**
 * @file static/js/features/qcm_player.js
 * @description Renders interactive QCMs, shuffles answers, applies gamification math, and links to Auto-Mastery Agent.
 */
import { State } from '../core/state.js';

const API = window.API;

export function shuffleArray(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

export async function fetchQcmHistory(resourceId) {
    const list = document.getElementById('qcm-history-list');
    if (!list) return;
    try {
        const res = await fetch(`/api/qcm/history/${resourceId}`);
        const history = await res.json();
        list.innerHTML = '';
        if (history.length === 0) {
            list.innerHTML = `<div class="text-[10px] text-slate-400 italic mt-2">Aucune évaluation passée.</div>`;
            return;
        }
        history.forEach(h => {
            const date = new Date(h.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
            const pct = Math.round((h.score / h.total) * 100);
            const color = pct >= 80 ? 'text-emerald-600' : (pct >= 60 ? 'text-amber-600' : 'text-rose-600');
            list.innerHTML += `
                <div class="flex justify-between items-center bg-white p-2.5 rounded-xl border border-slate-100 shadow-sm text-[10px]">
                    <div class="flex flex-col space-y-0.5">
                        <span class="font-bold text-slate-700">${date} - ${h.difficulty}</span>
                        <span class="text-slate-500 font-mono text-[9px]">⏱️ ${h.time_spent_sec}s au total</span>
                    </div>
                    <span class="font-extrabold ${color} text-xs bg-slate-50 px-2 py-1 rounded-md border">${h.score}/${h.total}</span>
                </div>
            `;
        });
    } catch (e) { console.error('Failed to fetch QCM history', e); }
}

export function generateWorkbenchQCM() {
    if (!State.currentWorkbenchResourceId) return;
    const count = document.getElementById('qcm-config-count').value;
    const difficulty = document.getElementById('qcm-config-difficulty').value;
    const optionsCount = document.getElementById('qcm-config-options').value;

    const setupView = document.getElementById('qcm-setup-view');
    const loadingView = document.getElementById('qcm-loading-view');
    const contentBox = document.getElementById('workbench-qcm-content');
    
    setupView.classList.remove('flex'); setupView.classList.add('hidden');
    contentBox.classList.add('hidden');
    loadingView.classList.remove('hidden'); loadingView.classList.add('flex');
    
    State.currentQuizContainerId = 'workbench-qcm-content';
    
    API.streamAI('/api/ai/quiz', { topic: State.currentWorkbenchTheme, subject: State.currentWorkbenchFilename, count, difficulty, options: optionsCount },
        (progress) => {
            document.getElementById('qcm-loading-text').innerText = progress.message;
            if (progress.eta) document.getElementById('qcm-loading-eta').innerText = `~${progress.eta}s`;
        },
        (result) => {
            loadingView.classList.remove('flex'); loadingView.classList.add('hidden'); contentBox.classList.remove('hidden');
            if (result.data && result.data.items) { renderInteractiveQuizPlayer(result.data.items); } 
            else { setupView.classList.remove('hidden'); alert("Erreur de génération des QCMs."); }
        },
        (errorMsg) => {
            loadingView.classList.remove('flex'); loadingView.classList.add('hidden'); setupView.classList.remove('hidden'); alert(`Erreur IA: ${errorMsg}`);
        }
    );
}

export function renderInteractiveQuizPlayer(qcms) {
    State.activeQuizQuestions = qcms;
    State.currentQuestionIdx = 0;
    State.userQuizAnswers = {};
    State.totalQuizTime = 0;
    renderQuizQuestionStep();
}

export function renderQuizQuestionStep() {
    const content = document.getElementById(State.currentQuizContainerId);
    if (!content) return;
    
    const q = State.activeQuizQuestions[State.currentQuestionIdx];
    const total = State.activeQuizQuestions.length;
    if (!q) return;

    State.questionTimeElapsed = 0;
    if (State.questionTimeInterval) clearInterval(State.questionTimeInterval);
    State.questionTimeInterval = setInterval(() => {
        State.questionTimeElapsed++;
        const timerEl = document.getElementById('qcm-question-timer');
        if (timerEl) {
            const m = Math.floor(State.questionTimeElapsed / 60).toString().padStart(2, '0');
            const s = (State.questionTimeElapsed % 60).toString().padStart(2, '0');
            timerEl.innerText = `${m}:${s}`;
            if (State.questionTimeElapsed > 45) {
                timerEl.classList.add('text-rose-600', 'bg-rose-50', 'border-rose-200');
            }
        }
    }, 1000);

    let rawOptions = [];
    ['a','b','c','d','e','f','g','h'].forEach(letter => {
        const optKey = `option_${letter}`;
        if (q[optKey] && q[optKey].trim() !== '') {
            rawOptions.push({ letter: letter.toUpperCase(), text: q[optKey] });
        }
    });

    const shuffledOptions = shuffleArray(rawOptions);

    let html = `
        <div class="space-y-6 pb-4">
            <div class="flex justify-between items-center border-b border-[rgba(15,23,42,0.08)] pb-3">
                <span class="text-xs font-bold uppercase tracking-wider text-purple-600 flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full bg-purple-500"></span> 
                    Question ${State.currentQuestionIdx + 1} sur ${total}
                </span>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-mono font-bold px-2.5 py-1 rounded-md bg-[rgba(2,132,199,0.1)] text-[rgb(2,132,199)] uppercase border border-[rgba(2,132,199,0.2)]">PCEM1</span>
                    <span id="qcm-question-timer" class="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 transition-colors">00:00</span>
                </div>
            </div>

            <h4 class="text-base font-bold text-[rgb(15,23,42)] leading-relaxed">${q.question || q.id}</h4>

            <div class="space-y-2.5">
                ${shuffledOptions.map((opt, idx) => `
                    <button onclick="selectQuizAnswer('${opt.letter}')" 
                            data-letter="${opt.letter}"
                            class="quiz-opt-btn w-full text-left p-3.5 rounded-xl border border-[rgba(15,23,42,0.12)] hover:border-purple-500 hover:bg-purple-50 hover:shadow-sm text-sm font-medium transition-all flex items-center gap-3">
                        <span class="w-7 h-7 shrink-0 rounded-lg bg-[rgb(241,245,249)] border border-[rgba(15,23,42,0.1)] text-xs font-bold flex items-center justify-center">${idx + 1}</span>
                        <span>${opt.text}</span>
                    </button>
                `).join('')}
            </div>

            <div id="quiz-explanation" class="hidden p-4 rounded-xl space-y-1.5 mt-4 transition-all">
                <strong class="text-xs font-bold uppercase block tracking-wide" id="quiz-exp-title">Explication Médicale:</strong>
                <p class="text-xs font-medium" id="quiz-exp-body">${q.explanation}</p>
            </div>

            <div class="flex justify-end gap-3 pt-4 border-t border-[rgba(15,23,42,0.08)]">
                ${State.currentQuestionIdx < total - 1 ? `
                    <button onclick="nextQuizQuestion()" class="px-6 py-3 rounded-xl bg-[rgb(15,23,42)] hover:bg-purple-600 text-white font-extrabold text-xs shadow-md transition-all">Question Suivante ➔</button>
                ` : `
                    <button onclick="finishQuizScore()" class="px-6 py-3 rounded-xl bg-[rgb(16,185,129)] hover:bg-emerald-600 text-white font-extrabold text-xs shadow-md transition-all">Analyser ma Maîtrise ✅</button>
                `}
            </div>
        </div>
    `;

    content.innerHTML = html;
}

export function selectQuizAnswer(selectedLetter) {
    if (State.questionTimeInterval) clearInterval(State.questionTimeInterval);
    State.totalQuizTime += State.questionTimeElapsed * 1000;

    const q = State.activeQuizQuestions[State.currentQuestionIdx];
    const isCorrect = selectedLetter.toUpperCase() === (q.correct_option || '').toUpperCase();
    State.userQuizAnswers[State.currentQuestionIdx] = { selected: selectedLetter, isCorrect };

    document.querySelectorAll('.quiz-opt-btn').forEach(btn => {
        btn.disabled = true; 
        const btnLetter = btn.getAttribute('data-letter');
        
        if (btnLetter === q.correct_option.toUpperCase()) {
            btn.className = 'quiz-opt-btn w-full text-left p-3.5 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm text-sm font-bold flex items-center gap-3 transition-all';
        } else if (btnLetter === selectedLetter && !isCorrect) {
            btn.className = 'quiz-opt-btn w-full text-left p-3.5 rounded-xl border-2 border-rose-500 bg-rose-50 text-rose-900 shadow-sm text-sm font-bold flex items-center gap-3 transition-all opacity-90';
        } else {
            btn.classList.add('opacity-40', 'cursor-not-allowed', 'bg-slate-50');
            btn.classList.remove('hover:border-purple-500', 'hover:bg-purple-50');
        }
    });

    const exp = document.getElementById('quiz-explanation');
    const expTitle = document.getElementById('quiz-exp-title');
    const expBody = document.getElementById('quiz-exp-body');
    if (exp) {
        if (isCorrect) {
            exp.className = 'p-4 rounded-xl space-y-1.5 mt-4 transition-all bg-emerald-50 border border-emerald-200';
            expTitle.className = 'text-xs font-extrabold uppercase block tracking-wide text-emerald-800';
            expBody.className = 'text-xs font-medium text-emerald-900 leading-relaxed';
        } else {
            exp.className = 'p-4 rounded-xl space-y-1.5 mt-4 transition-all bg-rose-50 border border-rose-200';
            expTitle.className = 'text-xs font-extrabold uppercase block tracking-wide text-rose-800 flex items-center gap-1';
            expTitle.innerHTML = '<span>💡 Correction & Explication:</span>';
            expBody.className = 'text-xs font-medium text-rose-900 leading-relaxed';
        }
        exp.classList.remove('hidden');
    }
}

export function nextQuizQuestion() {
    State.currentQuestionIdx++;
    renderQuizQuestionStep();
}

export function finishQuizScore() {
    const content = document.getElementById(State.currentQuizContainerId);
    if (!content) return;
    
    let score = 0;
    Object.values(State.userQuizAnswers).forEach(ans => { if (ans.isCorrect) score++; });

    const total = State.activeQuizQuestions.length;
    const pct = Math.round((score / total) * 100);
    const timeSpentSec = Math.round(State.totalQuizTime / 1000);

    let html = `
        <div class="text-center py-8 space-y-4">
            <div class="w-16 h-16 rounded-full bg-[rgba(16,185,129,0.15)] text-[rgb(16,185,129)] border border-[rgba(16,185,129,0.3)] mx-auto flex items-center justify-center text-3xl font-bold mb-4">🏆</div>
            <h4 class="text-2xl font-extrabold text-[rgb(15,23,42)]">Bilan de Compétence</h4>
            <div class="flex justify-center gap-6 font-mono font-bold text-lg mb-4">
                <div class="flex flex-col items-center"><span class="text-xs text-slate-500 uppercase">Score Brut</span><span class="text-purple-600">${score}/${total}</span></div>
                <div class="flex flex-col items-center"><span class="text-xs text-slate-500 uppercase">Précision</span><span class="text-[rgb(2,132,199)]">${pct}%</span></div>
                <div class="flex flex-col items-center"><span class="text-xs text-slate-500 uppercase">Temps Global</span><span class="text-amber-600">${timeSpentSec}s</span></div>
            </div>
            
            <div id="qcm-mastery-alert" class="mt-6 mx-auto max-w-sm p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold shadow-sm">
                <span class="animate-pulse">Agent IA: Évaluation de la Maîtrise en cours... 🤖</span>
            </div>

            <div class="pt-6">
                ${State.currentQuizContainerId === 'ai-modal-content' 
                    ? `<button onclick="closeAiModal()" class="px-8 py-3 rounded-xl bg-[rgb(15,23,42)] text-white font-extrabold text-xs shadow-md">Terminer l'examen</button>`
                    : `<button onclick="switchWorkbenchTab('notes'); window.fetchQcmHistory(${State.currentWorkbenchResourceId});" class="px-8 py-3 rounded-xl bg-[rgb(15,23,42)] hover:bg-slate-800 text-white font-extrabold text-xs shadow-md transition-all">Retour aux Notes</button>`}
            </div>
        </div>
    `;

    content.innerHTML = html;

    if (State.currentWorkbenchResourceId && State.currentQuizContainerId === 'workbench-qcm-content') {
        const difficulty = document.getElementById('qcm-config-difficulty').value;
        fetch('/api/qcm/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resource_id: State.currentWorkbenchResourceId, score, total, difficulty, time_spent_sec: timeSpentSec })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const masteryAlert = document.getElementById('qcm-mastery-alert');
                let colorClass = data.verdict === 'mastered' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 
                                 data.verdict === 'in_progress' ? 'bg-amber-50 border-amber-200 text-amber-800' : 
                                 'bg-rose-50 border-rose-200 text-rose-800';
                
                let icon = data.verdict === 'mastered' ? '✅' : data.verdict === 'in_progress' ? '🟡' : '🔄';
                let stateText = data.verdict === 'mastered' ? 'Maîtrisé' : data.verdict === 'in_progress' ? 'En cours' : 'À réviser';

                if (masteryAlert) {
                    masteryAlert.className = `mt-6 mx-auto max-w-sm p-3.5 rounded-xl border shadow-sm text-xs font-bold transition-all ${colorClass}`;
                    masteryAlert.innerHTML = `
                        <div class="flex items-center justify-between mb-1.5">
                            <span>Verdict de l'Agent:</span>
                            <span class="px-2 py-0.5 rounded-md bg-white border uppercase tracking-wider">${icon} ${stateText}</span>
                        </div>
                        <div class="text-[10px] font-medium opacity-80">Score pondéré par difficulté et temps: ${data.final_score_calculated}%</div>
                    `;
                }
                
                document.querySelectorAll('.workbench-status-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-status') === data.verdict);
                });
                
                if(window.appEngine) window.appEngine.fetchAndRenderRoadmap(); 
            }
        }).catch(err => console.error("Auto-mastery failed:", err));
    } else {
        const alertEl = document.getElementById('qcm-mastery-alert');
        if (alertEl) alertEl.style.display = 'none';
    }
}

export function openAiModal(title) {
    const modal = document.getElementById('ai-modal');
    if (document.getElementById('ai-modal-title')) document.getElementById('ai-modal-title').innerText = title;
    if (modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
}

export function closeAiModal() {
    const modal = document.getElementById('ai-modal');
    if (modal) { modal.classList.add('hidden'); document.body.style.overflow = ''; }
}

export function updateAiProgressDrawer(message, etaSeconds, isWarning = false) {
    const statusBox = document.getElementById('ai-status-box');
    const messageEl = document.getElementById('ai-status-message');
    const etaEl = document.getElementById('ai-status-eta');

    if (statusBox) statusBox.classList.remove('hidden');
    if (messageEl) {
        messageEl.innerText = message;
        messageEl.className = isWarning ? "text-xs font-semibold text-amber-600" : "text-xs font-semibold text-[rgb(2,132,199)]";
    }
    if (etaEl && etaSeconds !== undefined) {
        etaEl.innerText = `Temps estimé: ~${etaSeconds}s`;
    }
}

export function hideAiProgressDrawer() {
    const statusBox = document.getElementById('ai-status-box');
    if (statusBox) statusBox.classList.add('hidden');
}

export function triggerGlobalThemeQuiz(theme, semester) {
    State.currentWorkbenchTheme = theme;
    State.currentWorkbenchFilename = semester;
    State.currentQuizContainerId = 'ai-modal-content';
    openAiModal(`🎯 Global Theme Quiz: ${theme}`);
    
    const content = document.getElementById('ai-modal-content');
    content.innerHTML = '';
    document.getElementById('ai-status-box').classList.remove('hidden');
    
    API.streamAI('/api/ai/quiz', { topic: theme, subject: semester, count: 10, difficulty: 'Moyen', options: 4 },
        (progress) => {
            document.getElementById('ai-status-message').innerText = progress.message;
            if (progress.eta) document.getElementById('ai-status-eta').innerText = `~${progress.eta}s`;
        },
        (result) => {
            document.getElementById('ai-status-box').classList.add('hidden');
            if (result.data && result.data.items) { renderInteractiveQuizPlayer(result.data.items); } 
            else { content.innerHTML = `<p class="text-sm text-red-500">Erreur lors de la génération du QCM.</p>`; }
        },
        (errorMsg) => {
            document.getElementById('ai-status-box').classList.add('hidden');
            content.innerHTML = `<p class="text-sm text-red-500 font-semibold">❌ ${errorMsg}</p>`;
        }
    );
}

export function triggerAiExplain(term) {
    if (!term || term === 'Général') return;
    openAiModal(`💡 Explication Médicale: ${term}`);
    const content = document.getElementById('ai-modal-content');
    content.innerHTML = '';
    document.getElementById('ai-status-box').classList.remove('hidden');
    document.getElementById('ai-status-message').innerText = 'Génération de l\'explication synthétique...';

    API.streamAI('/api/ai/explain', { term: term },
        (progress) => {
            document.getElementById('ai-status-message').innerText = progress.message;
            if (progress.eta) document.getElementById('ai-status-eta').innerText = `~${progress.eta}s`;
        },
        (result) => {
            document.getElementById('ai-status-box').classList.add('hidden');
            if (result.data && result.data.items && result.data.items[0]) {
                const item = result.data.items[0];
                content.innerHTML = `
                    <div class="space-y-4 p-4 rounded-2xl bg-[rgba(2,132,199,0.06)] border border-[rgba(2,132,199,0.2)]">
                        <h4 class="text-lg font-bold text-[rgb(2,132,199)]">${item.term || term}</h4>
                        <p class="text-sm font-medium text-[rgb(15,23,42)]">${item.definition}</p>
                        <div class="p-3 rounded-xl bg-white border border-[rgba(15,23,42,0.08)]">
                            <strong class="text-xs font-bold text-[rgb(180,83,9)] block mb-1">🎯 Retenir pour l'Examen:</strong>
                            <p class="text-xs text-[rgb(71,85,105)]">${item.key_takeaway}</p>
                        </div>
                    </div>
                `;
            }
        },
        (errorMsg) => {
            document.getElementById('ai-status-box').classList.add('hidden');
            content.innerHTML = `<p class="text-sm text-red-500 font-semibold">❌ ${errorMsg}</p>`;
        }
    );
}
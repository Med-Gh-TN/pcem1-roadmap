/**
 * @file static/js/main.js
 * @description Single entry point that ties the ES6 modules together, renders the roadmap, and binds global scope.
 */
import { State } from './core/state.js';
import { 
    initExamCountdown, initGlobalStudyStats, fetchAndRenderHeatmap, 
    togglePomodoro, resetPomodoro 
} from './features/gamification.js';
import { 
    triggerPdfConversion, openWorkbench, closeWorkbench, switchWorkbenchTab, 
    toggleWorkbenchFullscreen, handleNotesInput, setWorkbenchMastery, generateWorkbenchResume
} from './features/workbench.js';
import { 
    fetchQcmHistory, generateWorkbenchQCM, selectQuizAnswer, 
    nextQuizQuestion, finishQuizScore, openAiModal, closeAiModal, 
    triggerGlobalThemeQuiz, triggerAiExplain 
} from './features/qcm_player.js';

const API = window.API;

// ==========================================
// CORE ROADMAP UI RENDERING ENGINE
// ==========================================
window.appEngine = {
    fetchAndRenderRoadmap: async function() {
        try {
            const response = await API.getRoadmap();
            State.roadmapData = response.data;
            State.latestRoadmapStats = response.stats;
            this.updateProgressDisplay();
            
            const statTotal = document.getElementById('stat-total-courses');
            if(statTotal) statTotal.innerText = State.latestRoadmapStats.total;
            const statMastered = document.getElementById('stat-mastered-count');
            if(statMastered) statMastered.innerText = State.latestRoadmapStats.completed;
            const statRevision = document.getElementById('stat-revision-count');
            if(statRevision) statRevision.innerText = State.latestRoadmapStats.needs_revision || 0;
            
            await initGlobalStudyStats();
            this.renderCurrentView();
        } catch (err) { console.error(err); }
    },
    
    updateProgressDisplay: function() {
        if (!State.latestRoadmapStats) return;
        const pct = State.isWeightedProgress ? State.latestRoadmapStats.weighted_percentage : State.latestRoadmapStats.percentage;
        const bar = document.getElementById('progress-bar');
        if (bar) bar.style.width = `${pct}%`;
        const txt = document.getElementById('progress-text');
        if (txt) txt.innerText = State.isWeightedProgress ? `Progression (Coeff): ${pct}%` : `Progression: ${pct}%`;
    },

    toggleWeightedProgress: function() {
        State.isWeightedProgress = !State.isWeightedProgress;
        const btn = document.getElementById('btn-toggle-weighted');
        if (btn) {
            btn.innerText = State.isWeightedProgress ? 'Coef. Faculté: ⚖️ On' : 'Coef. Faculté: ⚖️ Off';
            btn.className = State.isWeightedProgress ? 
                'text-[10px] text-emerald-700 font-extrabold hover:underline cursor-pointer bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200' : 
                'text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer';
        }
        this.updateProgressDisplay();
    },

    handleExportRevision: async function() {
        try { await API.exportRevisionList(); } catch (err) { alert('Erreur lors de l\'exportation.'); }
    },

    switchViewMode: function(mode) {
        State.currentViewMode = mode;
        document.querySelectorAll('.view-btn').forEach(btn => {
            const btnMode = btn.getAttribute('data-view');
            if (btnMode === mode) {
                btn.className = 'view-btn px-4 py-2.5 rounded-xl bg-[rgb(15,23,42)] text-[rgb(255,255,255)] font-semibold text-xs transition-all shadow-md';
                btn.setAttribute('aria-selected', 'true');
            } else {
                btn.className = 'view-btn px-4 py-2.5 rounded-xl bg-[rgb(255,255,255)] hover:bg-[rgb(241,245,249)] text-[rgb(71,85,105)] font-medium text-xs border border-[rgba(15,23,42,0.1)] transition-all';
                btn.setAttribute('aria-selected', 'false');
            }
        });
        this.renderCurrentView();
    },

    renderCurrentView: function() {
        const flowchartContainer = document.getElementById('flowchart-view');
        const gridContainer = document.getElementById('roadmap-container');
        const timelineContainer = document.getElementById('timeline-view');

        if (flowchartContainer) flowchartContainer.classList.add('hidden');
        if (gridContainer) gridContainer.classList.add('hidden');
        if (timelineContainer) timelineContainer.classList.add('hidden');

        if (State.currentViewMode === 'flowchart') {
            if (flowchartContainer) {
                flowchartContainer.classList.remove('hidden');
                if (typeof initRoadmapGraph === 'function') initRoadmapGraph(State.roadmapData);
            }
        } else if (State.currentViewMode === 'timeline') {
            if (timelineContainer) {
                timelineContainer.classList.remove('hidden');
                this.renderTimelineView();
            }
        } else {
            if (gridContainer) {
                gridContainer.classList.remove('hidden');
                this.renderRoadmapGrid();
            }
        }
    },

    filterSemester: function(sem) {
        State.currentSemester = sem;
        document.querySelectorAll('.sem-btn').forEach(btn => {
            const isMatch = (sem === 'ALL' && btn.getAttribute('data-sem') === 'ALL') || btn.getAttribute('data-sem') === sem;
            if (isMatch) {
                btn.className = 'sem-btn px-5 py-2.5 rounded-xl bg-[rgb(15,23,42)] text-[rgb(255,255,255)] font-semibold text-xs tracking-wide shadow-md transition-all';
                btn.setAttribute('aria-selected', 'true');
            } else {
                btn.className = 'sem-btn px-5 py-2.5 rounded-xl bg-[rgb(255,255,255)] hover:bg-[rgb(241,245,249)] text-[rgb(71,85,105)] font-medium text-xs tracking-wide border border-[rgba(15,23,42,0.1)] transition-all';
                btn.setAttribute('aria-selected', 'false');
            }
        });
        this.renderCurrentView();
    },

    toggleFilter: function(type) {
        if (type === 'high_yield') {
            State.filterHighYieldOnly = !State.filterHighYieldOnly;
            const btnHY = document.getElementById('btn-hy');
            if (btnHY) {
                btnHY.className = State.filterHighYieldOnly ? 
                    'px-4 py-2.5 rounded-xl bg-[rgba(245,158,11,0.15)] text-[rgb(180,83,9)] border border-[rgba(245,158,11,0.4)] text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm' : 
                    'px-4 py-2.5 rounded-xl bg-[rgb(255,255,255)] hover:bg-[rgb(241,245,249)] border border-[rgba(15,23,42,0.12)] text-[rgb(71,85,105)] text-xs font-semibold transition-all flex items-center gap-1.5';
                btnHY.setAttribute('aria-pressed', State.filterHighYieldOnly ? 'true' : 'false');
            }
        } else if (type === 'annales') {
            State.filterAnnalesOnly = !State.filterAnnalesOnly;
            const btnAnnales = document.getElementById('btn-annales');
            if (btnAnnales) {
                btnAnnales.className = State.filterAnnalesOnly ? 
                    'px-4 py-2.5 rounded-xl bg-[rgba(79,70,229,0.12)] text-[rgb(67,56,202)] border border-[rgba(79,70,229,0.3)] text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm' : 
                    'px-4 py-2.5 rounded-xl bg-[rgb(255,255,255)] hover:bg-[rgb(241,245,249)] border border-[rgba(15,23,42,0.12)] text-[rgb(71,85,105)] text-xs font-semibold transition-all flex items-center gap-1.5';
                btnAnnales.setAttribute('aria-pressed', State.filterAnnalesOnly ? 'true' : 'false');
            }
        }
        this.handleSearchInput();
    },

    handleSearchInput: async function() {
        const searchInput = document.getElementById('search-input');
        const query = searchInput ? searchInput.value.trim() : '';
        const subjectFilter = document.getElementById('subject-filter');
        const subject = subjectFilter ? subjectFilter.value : 'ALL';
        
        const searchContainer = document.getElementById('search-results-container');
        const gridContainer = document.getElementById('roadmap-container');
        const flowchartContainer = document.getElementById('flowchart-view');
        const timelineContainer = document.getElementById('timeline-view');
        const resultsList = document.getElementById('search-results-list');

        if (!query && subject === 'ALL' && !State.filterHighYieldOnly && !State.filterAnnalesOnly) {
            if (searchContainer) searchContainer.classList.add('hidden');
            this.renderCurrentView();
            return;
        }

        try {
            const data = await API.search(query, subject, State.filterHighYieldOnly, State.filterAnnalesOnly);
            const searchCount = document.getElementById('search-count');
            if (searchCount) searchCount.innerText = data.count;

            if (resultsList) {
                resultsList.innerHTML = '';
                if (data.results.length === 0) {
                    resultsList.innerHTML = `
                        <div class="text-center py-12 text-[rgb(100,116,139)] text-sm font-medium">
                            Aucun résultat ne correspond à votre recherche.
                        </div>
                    `;
                } else {
                    data.results.forEach(file => {
                        resultsList.appendChild(this.createFileCard(file));
                    });
                }
            }

            if (searchContainer) searchContainer.classList.remove('hidden');
            if (gridContainer) gridContainer.classList.add('hidden');
            if (flowchartContainer) flowchartContainer.classList.add('hidden');
            if (timelineContainer) timelineContainer.classList.add('hidden');
        } catch (err) { console.error(err); }
    },

    getFileTypeIcon: function(ext) {
        const type = (ext || '').toLowerCase();
        if (['pdf'].includes(type)) return '📕';
        if (['pptx', 'ppt', 'ppsx', 'ppsm'].includes(type)) return '📊';
        if (['mp4', 'mkv', 'webm', 'mov'].includes(type)) return '🎬';
        if (['docx', 'doc', 'rtf', 'odt'].includes(type)) return '📝';
        if (['mp3', 'wav', 'm4a'].includes(type)) return '🎵';
        if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(type)) return '🖼️';
        return '📄';
    },

    createFileCard: function(file) {
        const safePath = file.relative_path.split('/').map(encodeURIComponent).join('/');
        const icon = this.getFileTypeIcon(file.file_type);

        const isMastered = file.status === 'completed' || file.status === 'mastered';
        const isInProgress = file.status === 'in_progress';
        const isNeedsRevision = file.status === 'needs_revision';

        let statusStyle = 'text-[rgb(71,85,105)] border-[rgba(100,116,139,0.2)] bg-[rgba(241,245,249,0.8)] font-medium';
        if (isMastered) statusStyle = 'text-emerald-700 border-emerald-300 bg-emerald-50 font-semibold';
        else if (isInProgress) statusStyle = 'text-amber-700 border-amber-300 bg-amber-50 font-semibold';
        else if (isNeedsRevision) statusStyle = 'text-rose-700 border-rose-300 bg-rose-50 font-semibold';

        const hyBadge = file.is_high_yield === 1 ? 
            '<span class="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(245,158,11,0.12)] text-[rgb(180,83,9)] border border-[rgba(245,158,11,0.3)] font-bold flex items-center gap-1 shadow-sm">🌟 High-Yield</span>' : '';
        const annaleBadge = file.is_annale === 1 ? 
            '<span class="text-[10px] px-2 py-0.5 rounded-full bg-[rgba(79,70,229,0.12)] text-[rgb(67,56,202)] border border-[rgba(79,70,229,0.3)] font-bold flex items-center gap-1 shadow-sm">📑 Exam/QCM</span>' : '';

        const div = document.createElement('div');
        div.className = 'glass-card p-3.5 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all';
        
        const escapedFilename = file.filename.replace(/'/g, "\\'");
        const escapedTheme = file.theme.replace(/'/g, "\\'");
        
        div.innerHTML = `
            <div class="overflow-hidden pr-2 space-y-1.5 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                    <a href="/source/${safePath}" target="_blank" class="text-sm font-semibold text-[rgb(15,23,42)] hover:text-[rgb(2,132,199)] transition-colors truncate max-w-md flex items-center gap-2">
                        <span>${icon}</span><span class="truncate">${file.filename}</span>
                    </a>
                    ${hyBadge} ${annaleBadge}
                </div>
                <div class="flex items-center gap-2 text-[11px] text-[rgb(100,116,139)] font-mono font-medium">
                    <span class="uppercase text-[rgb(2,132,199)] font-bold">${file.file_type}</span><span>•</span>
                    <span class="hover:underline cursor-pointer" onclick="triggerAiExplain('${file.subject}')">${file.subject || 'Général'}</span>
                    <span>•</span><span class="text-[rgb(148,163,184)]">${file.theme}</span>
                </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 self-end sm:self-center">
                <button onclick="openWorkbench(${file.id}, '${escapedFilename}', '${safePath}', '${file.file_type}', '${escapedTheme}', ${file.has_pdf_cache||0}, '${file.pdf_cache_path||''}', 'notes')" 
                        class="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition-all border border-indigo-200">📖 Workbench</button>
                <select onchange="handleProgressUpdate(${file.id}, this.value)" class="text-xs px-3 py-1.5 rounded-lg border ${statusStyle} focus:outline-none cursor-pointer transition-all font-semibold">
                    <option value="not_started" ${file.status === 'not_started' ? 'selected' : ''}>⏳ Non commencé</option>
                    <option value="in_progress" ${isInProgress ? 'selected' : ''}>🟡 En cours</option>
                    <option value="mastered" ${isMastered ? 'selected' : ''}>✅ Maîtrisé</option>
                    <option value="needs_revision" ${isNeedsRevision ? 'selected' : ''}>🔄 À réviser</option>
                </select>
            </div>
        `;
        return div;
    },

    openThemeModal: function(sem, theme) {
        State.currentPomodoroTheme = theme;
        const sections = State.roadmapData[sem]?.[theme];
        if (!sections) return;
        const modalTitle = document.getElementById('modal-title');
        if (modalTitle) modalTitle.innerText = theme;
        const modalSubtitle = document.getElementById('modal-subtitle');
        if (modalSubtitle) modalSubtitle.innerText = `${sem} • Module Médical FMT`;

        const content = document.getElementById('modal-content');
        if (content) {
            content.innerHTML = '';
            for (const [section, files] of Object.entries(sections)) {
                const secBlock = document.createElement('div');
                secBlock.className = 'pt-4 space-y-3';
                secBlock.innerHTML = `
                    <div class="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] pb-2">
                        <h4 class="font-bold text-xs text-[rgb(2,132,199)] uppercase tracking-wider flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-[rgb(2,132,199)]"></span>${section}
                        </h4>
                        <span class="text-xs text-[rgb(100,116,139)] font-mono font-medium">${files.length} fichiers</span>
                    </div><div class="space-y-2.5">`;
                const listContainer = secBlock.querySelector('.space-y-2\\.5');
                files.forEach(file => listContainer.appendChild(this.createFileCard(file)));
                content.appendChild(secBlock);
            }
        }
        const modal = document.getElementById('modal');
        if (modal) { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
    },

    renderRoadmapGrid: function() {
        const container = document.getElementById('roadmap-container');
        if (!container) return;
        container.innerHTML = '';

        for (const [semester, themes] of Object.entries(State.roadmapData)) {
            if (State.currentSemester !== 'ALL' && semester !== State.currentSemester) continue;

            const semSection = document.createElement('section');
            semSection.className = 'glass-panel p-6 sm:p-8 rounded-3xl space-y-6';
            let html = `
                <div class="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] pb-4">
                    <h2 class="text-xl font-bold text-[rgb(15,23,42)] flex items-center gap-2.5 tracking-tight">
                        <span class="w-3.5 h-3.5 rounded-full bg-[rgb(2,132,199)] shadow-sm"></span>${semester}
                    </h2>
                    <span class="text-xs font-semibold px-3 py-1 rounded-full bg-[rgba(2,132,199,0.1)] text-[rgb(2,132,199)] border border-[rgba(2,132,199,0.2)]">
                        ${Object.keys(themes).length} Thèmes
                    </span>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            `;

            for (const [theme, sections] of Object.entries(themes)) {
                let totalRes = 0, completedRes = 0, annalesCount = 0;
                Object.values(sections).forEach(secList => {
                    secList.forEach(item => {
                        totalRes++;
                        if (item.status === 'completed' || item.status === 'mastered') completedRes++;
                        if (item.is_annale === 1) annalesCount++;
                    });
                });

                const pct = totalRes > 0 ? Math.round((completedRes / totalRes) * 100) : 0;
                const badgeStyle = pct === 100 ? 'bg-[rgba(16,185,129,0.12)] text-[rgb(6,95,70)] border-[rgba(16,185,129,0.3)]' : 'bg-[rgba(2,132,199,0.1)] text-[rgb(2,132,199)] border-[rgba(2,132,199,0.25)]';

                html += `
                    <div onclick="openThemeModal('${semester}', '${theme}')" tabindex="0" role="button" class="glass-card p-6 rounded-2xl cursor-pointer group relative overflow-hidden flex flex-col justify-between">
                        <div>
                            <div class="flex justify-between items-start mb-4 gap-2">
                                <h3 class="font-bold text-[rgb(15,23,42)] group-hover:text-[rgb(2,132,199)] transition-colors text-lg tracking-tight">${theme}</h3>
                                <span class="text-xs px-2.5 py-1 rounded-full border ${badgeStyle} font-bold font-mono">${pct}%</span>
                            </div>
                            <div class="flex items-center gap-3 text-xs text-[rgb(71,85,105)] mb-6">
                                <span class="flex items-center gap-1 font-medium">📚 <strong class="text-[rgb(15,23,42)] font-semibold">${totalRes}</strong> cours</span><span>•</span>
                                <span class="flex items-center gap-1 text-[rgb(67,56,202)] font-semibold">📑 <strong>${annalesCount}</strong> Annales</span>
                            </div>
                        </div>
                        <div class="space-y-3">
                            <div class="w-full bg-[rgb(241,245,249)] h-2 rounded-full overflow-hidden border border-[rgba(15,23,42,0.06)] p-0.5"><div class="bg-gradient-to-r from-[rgb(2,132,199)] to-[rgb(16,185,129)] h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div></div>
                            <button onclick="event.stopPropagation(); triggerGlobalThemeQuiz('${theme}', '${semester}')" class="w-full py-1.5 rounded-xl bg-[rgba(2,132,199,0.08)] hover:bg-[rgb(2,132,199)] text-[rgb(2,132,199)] hover:text-white font-bold text-xs border border-[rgba(2,132,199,0.2)] transition-all flex items-center justify-center gap-1.5">
                                🎯 Global Theme Quiz (5 QCMs)
                            </button>
                        </div>
                    </div>
                `;
            }
            html += `</div>`;
            semSection.innerHTML = html;
            container.appendChild(semSection);
        }
    },

    renderTimelineView: function() {
        const container = document.getElementById('timeline-view');
        if (!container) return;
        const milestoneBlocks = [
            { title: '📅 Étape 1: Session Principale - Semestre 1 (Janvier)', semester: 'Semestre 1', badge: 'Session Principale S1', themes: ['Th 1', 'Th 2A', 'Th 3', 'Th 4', 'Th 5A', 'Th 7'] },
            { title: '📅 Étape 2: Session Principale - Semestre 2 (Mai / Juin)', semester: 'Semestre 2', badge: 'Session Principale S2', themes: ['Th 2B', 'Th 5B', 'Th 6', 'Th 8', 'Th 9', 'Anglais', 'Informatique', 'Secourisme'] }
        ];

        let html = `<div class="relative border-l-2 border-[rgb(2,132,199)] ml-4 sm:ml-8 pl-6 sm:pl-10 space-y-12">`;
        milestoneBlocks.forEach((milestone, idx) => {
            html += `
                <div class="relative group">
                    <div class="absolute -left-[31px] sm:-left-[47px] top-1 w-6 h-6 rounded-full bg-[rgb(2,132,199)] border-4 border-white shadow-md flex items-center justify-center text-white text-[10px] font-bold">${idx + 1}</div>
                    <div class="glass-panel p-6 rounded-3xl space-y-4">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-[rgba(15,23,42,0.08)] pb-3">
                            <h3 class="text-lg font-bold text-[rgb(15,23,42)]">${milestone.title}</h3>
                            <span class="text-xs px-3 py-1 rounded-full bg-[rgba(2,132,199,0.12)] text-[rgb(2,132,199)] font-bold">${milestone.badge}</span>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            `;
            milestone.themes.forEach(themeKey => {
                const themeObj = State.roadmapData[milestone.semester]?.[themeKey];
                if (themeObj) {
                    let totalRes = 0, completedRes = 0;
                    Object.values(themeObj).forEach(secList => {
                        secList.forEach(item => { totalRes++; if (item.status === 'completed' || item.status === 'mastered') completedRes++; });
                    });
                    const pct = totalRes > 0 ? Math.round((completedRes / totalRes) * 100) : 0;
                    html += `
                        <div onclick="openThemeModal('${milestone.semester}', '${themeKey}')" class="glass-card p-4 rounded-xl cursor-pointer hover:border-[rgb(2,132,199)] transition-all">
                            <div class="flex justify-between items-center mb-2">
                                <span class="font-bold text-sm text-[rgb(15,23,42)]">${themeKey}</span><span class="text-xs font-mono font-bold text-[rgb(2,132,199)]">${pct}%</span>
                            </div>
                            <div class="w-full bg-[rgb(241,245,249)] h-1.5 rounded-full overflow-hidden"><div class="bg-[rgb(2,132,199)] h-full rounded-full" style="width: ${pct}%"></div></div>
                        </div>`;
                }
            });
            html += `</div></div></div>`;
        });
        html += `</div>`;
        container.innerHTML = html;
    }
};

// ==========================================
// GLOBAL BINDINGS FOR INLINE HTML (ONCLICK)
// ==========================================
window.toggleWeightedProgress = () => window.appEngine.toggleWeightedProgress();
window.switchViewMode = (m) => window.appEngine.switchViewMode(m);
window.filterSemester = (s) => window.appEngine.filterSemester(s);
window.toggleFilter = (t) => window.appEngine.toggleFilter(t);
window.handleSearchInput = () => window.appEngine.handleSearchInput();
window.handleExportRevision = () => window.appEngine.handleExportRevision();
window.openThemeModal = (s, t) => window.appEngine.openThemeModal(s, t);

window.closeModal = () => {
    const modal = document.getElementById('modal');
    if (modal) { modal.classList.add('hidden'); document.body.style.overflow = ''; }
};

window.handleProgressUpdate = async (id, status) => {
    try { await API.updateProgress(id, status); await window.appEngine.fetchAndRenderRoadmap(); } catch (err) {}
};

// Map imported module functions to global scope
window.togglePomodoro = togglePomodoro;
window.resetPomodoro = resetPomodoro;
window.triggerPdfConversion = triggerPdfConversion;
window.openWorkbench = openWorkbench;
window.switchWorkbenchTab = switchWorkbenchTab;
window.toggleWorkbenchFullscreen = toggleWorkbenchFullscreen;
window.closeWorkbench = closeWorkbench;
window.handleNotesInput = handleNotesInput;
window.setWorkbenchMastery = setWorkbenchMastery;
window.generateWorkbenchResume = generateWorkbenchResume;

// Gamification QCM Map
window.fetchQcmHistory = fetchQcmHistory;
window.generateWorkbenchQCM = generateWorkbenchQCM;
window.selectQuizAnswer = selectQuizAnswer;
window.nextQuizQuestion = nextQuizQuestion;
window.finishQuizScore = finishQuizScore;
window.openAiModal = openAiModal;
window.closeAiModal = closeAiModal;
window.triggerGlobalThemeQuiz = triggerGlobalThemeQuiz;
window.triggerAiExplain = triggerAiExplain;

// Boot
window.addEventListener('DOMContentLoaded', () => {
    window.appEngine.fetchAndRenderRoadmap();
    fetchAndRenderHeatmap();
    initExamCountdown();
    initGlobalStudyStats();
});
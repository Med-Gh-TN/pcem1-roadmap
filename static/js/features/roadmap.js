/**
 * @file static/js/features/roadmap.js
 * @description State Controller for PCEM1 Curriculum. Renders Grid & Dynamic Timeline Views.
 * @layer Core Logic / State Persistence
 */

import { State } from '../core/state.js';
import { openWorkbench } from './workbench.js';

const API = window.API;

let activeView = 'grid'; // Default back to grid
let activeSemester = 'ALL';
let activeHighYieldOnly = false;
let activeAnnalesOnly = false;

export function initRoadmapController() {
    bindGlobalHooks();
}

function bindGlobalHooks() {
    window.switchViewMode = switchViewMode;
    window.filterSemester = filterSemester;
    window.openThemeDrawer = openThemeDrawer;
    window.closeThemeDrawer = closeThemeDrawer;
    window.handleSearchInput = handleSearchInput;
    window.toggleFilter = toggleFilter;
    window.handleExportRevision = handleExportRevision;
}

export function switchViewMode(mode) {
    activeView = mode;
    
    const gridContainer = document.getElementById('roadmap-container');
    const timelineSection = document.getElementById('timeline-view');
    const searchResultsContainer = document.getElementById('search-results-container');

    if (searchResultsContainer) searchResultsContainer.classList.add('hidden');

    document.querySelectorAll('.view-btn').forEach(btn => {
        const isTarget = btn.getAttribute('data-view') === mode;
        if (isTarget) {
            btn.className = 'view-btn px-4 py-2 rounded-xl bg-[rgb(15,23,42)] text-white text-xs font-bold shadow-xs transition-all';
        } else {
            btn.className = 'view-btn px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold border border-slate-200/80 transition-all';
        }
    });

    if (gridContainer) gridContainer.classList.toggle('hidden', mode !== 'grid');
    if (timelineSection) timelineSection.classList.toggle('hidden', mode !== 'timeline');

    if (mode === 'grid') {
        renderRoadmapGrid(State.roadmapData);
    } else if (mode === 'timeline') {
        renderTimelineView(State.roadmapData);
    }
}

export function filterSemester(sem) {
    activeSemester = sem;

    document.querySelectorAll('.sem-btn').forEach(btn => {
        const isTarget = btn.getAttribute('data-sem') === sem;
        if (isTarget) {
            btn.className = 'sem-btn px-4 py-2 rounded-xl bg-[rgb(15,23,42)] text-white text-xs font-bold shadow-xs transition-all';
        } else {
            btn.className = 'sem-btn px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold border border-slate-200/80 transition-all';
        }
    });

    if (activeView === 'grid') renderRoadmapGrid(State.roadmapData);
    else if (activeView === 'timeline') renderTimelineView(State.roadmapData);
}

export function renderRoadmapGrid(roadmapData) {
    const container = document.getElementById('roadmap-container');
    if (!container || !roadmapData) return;

    container.innerHTML = '';

    for (const [semester, themes] of Object.entries(roadmapData)) {
        if (activeSemester !== 'ALL' && activeSemester !== semester) continue;

        const semSection = document.createElement('section');
        semSection.className = 'space-y-6';

        const semHeader = document.createElement('div');
        semHeader.className = 'flex items-center gap-3 pb-3 border-b-2 border-slate-200/80';
        semHeader.innerHTML = `
            <span class="w-3 h-3 rounded-full bg-[rgb(2,132,199)]"></span>
            <h2 class="text-lg font-extrabold text-slate-900 tracking-tight">${semester}</h2>
            <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-[rgb(2,132,199)] border border-sky-200">${Object.keys(themes).length} Thèmes</span>
        `;
        semSection.appendChild(semHeader);

        const cardsGrid = document.createElement('div');
        cardsGrid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5';

        for (const [themeName, sections] of Object.entries(themes)) {
            let totalItems = 0;
            let completedItems = 0;
            let hasMatch = false;

            Object.values(sections).forEach(fileList => {
                fileList.forEach(item => {
                    totalItems++;
                    if (item.status === 'completed' || item.status === 'mastered') completedItems++;
                    
                    const matchesHY = !activeHighYieldOnly || item.is_high_yield === 1;
                    const matchesAnnales = !activeAnnalesOnly || item.is_annale === 1;
                    if (matchesHY && matchesAnnales) hasMatch = true;
                });
            });

            if (!hasMatch && (activeHighYieldOnly || activeAnnalesOnly)) continue;

            const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

            const card = document.createElement('div');
            card.className = 'group glass-card p-5 rounded-3xl bg-white border border-slate-200/80 hover:border-sky-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-4 cursor-pointer';
            
            card.onclick = () => openThemeDrawer(themeName.replace(/'/g, "\\'"), semester);

            card.innerHTML = `
                <div>
                    <div class="flex justify-between items-start mb-2.5">
                        <span class="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-1 rounded-lg">Thème</span>
                        <span class="text-xs font-mono font-extrabold ${pct === 100 ? 'text-emerald-600' : 'text-slate-600'}">${pct}%</span>
                    </div>
                    <h3 class="font-extrabold text-slate-900 text-sm group-hover:text-[rgb(2,132,199)] transition-colors leading-snug line-clamp-2">${themeName}</h3>
                </div>

                <div class="space-y-1.5">
                    <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-[rgb(2,132,199)] to-indigo-500 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                    </div>
                    <div class="flex justify-between text-[10px] text-slate-400 font-semibold">
                        <span>${completedItems} / ${totalItems} Ressources</span>
                        <span>${Object.keys(sections).length} Modules</span>
                    </div>
                </div>

                <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button class="flex-1 py-2 px-3 rounded-xl bg-slate-50 hover:bg-sky-50 text-slate-700 hover:text-[rgb(2,132,199)] text-xs font-bold transition-all border border-slate-200/80 hover:border-sky-200 text-center">
                        📂 Explorer
                    </button>
                </div>
            `;

            cardsGrid.appendChild(card);
        }

        semSection.appendChild(cardsGrid);
        container.appendChild(semSection);
    }
}

export function openThemeDrawer(themeId, semester, targetSection = null) {
    const drawer = document.getElementById('theme-drawer');
    const titleEl = document.getElementById('drawer-theme-title');
    const badgeEl = document.getElementById('drawer-theme-badge');
    const subBadgeEl = document.getElementById('drawer-subject-badge');
    const matrixEl = document.getElementById('drawer-resource-matrix');
    const tutoBtn = document.getElementById('btn-drawer-launch-tuto');
    const doneBadge = document.getElementById('drawer-done-badge');

    if (!drawer || !titleEl || !matrixEl) return;

    titleEl.innerText = targetSection ? targetSection : themeId;

    let sections = null;
    if (State.roadmapData && State.roadmapData[semester] && State.roadmapData[semester][themeId]) {
        sections = State.roadmapData[semester][themeId];
    } else if (State.roadmapData) {
        for (const sem in State.roadmapData) {
            if (State.roadmapData[sem][themeId]) {
                sections = State.roadmapData[sem][themeId];
                break;
            }
        }
    }

    matrixEl.innerHTML = '';
    let firstItem = null;
    let allCompleted = true;
    let totalItems = 0;

    if (sections) {
        for (const [sectionName, fileList] of Object.entries(sections)) {
            if (targetSection && sectionName !== targetSection) continue;
            if (fileList.length === 0) continue;

            fileList.forEach(item => {
                if (!firstItem) firstItem = item;
                totalItems++;
                
                const isDone = (item.status === 'completed' || item.status === 'mastered');
                if (!isDone) allCompleted = false;

                const ext = (item.file_type || '').toLowerCase();
                let tagClass = "bg-slate-100 text-slate-800";
                let tagText = "Doc";
                
                if (['pdf', 'docx'].includes(ext)) {
                    tagClass = "bg-[#fef08a] text-[#854d0e]";
                    tagText = "Article";
                } else if (['mp4', 'mov', 'webm'].includes(ext)) {
                    tagClass = "bg-[#e9d5ff] text-[#6b21a8]";
                    tagText = "Video";
                } else if (item.is_annale) {
                    tagClass = "bg-[#bbf7d0] text-[#166534]";
                    tagText = "Course";
                }

                const itemBtn = document.createElement('button');
                itemBtn.className = 'w-full text-left p-1.5 hover:bg-slate-50 transition-all flex items-center justify-between group text-xs border-b border-dashed border-slate-200 last:border-0';
                
                itemBtn.innerHTML = `
                    <div class="flex items-center gap-3 truncate pr-2">
                        <span class="${tagClass} text-[9px] font-bold px-1.5 py-0.5 rounded shadow-[1px_1px_0_0_rgba(0,0,0,0.1)] uppercase w-12 text-center tracking-wide shrink-0 border border-[rgba(0,0,0,0.05)]">${tagText}</span>
                        <span class="font-semibold text-slate-800 truncate group-hover:text-blue-600 transition-colors ${isDone ? 'line-through text-slate-400' : ''}">${item.filename}</span>
                    </div>
                `;
                
                itemBtn.onclick = () => {
                    closeThemeDrawer();
                    openWorkbench(item.id, item.filename, item.relative_path, item.file_type, themeId, item.has_pdf_cache, item.pdf_cache_path);
                };
                matrixEl.appendChild(itemBtn);
            });
        }
    } else {
        matrixEl.innerHTML = `<p class="text-xs text-slate-400 italic">No resources found.</p>`;
    }

    if (doneBadge) {
        if (totalItems > 0 && allCompleted) doneBadge.classList.remove('hidden');
        else doneBadge.classList.add('hidden');
    }

    if (tutoBtn) {
        tutoBtn.onclick = () => {
            closeThemeDrawer();
            if (firstItem) openWorkbench(firstItem.id, firstItem.filename, firstItem.relative_path, firstItem.file_type, themeId, firstItem.has_pdf_cache, firstItem.pdf_cache_path, 'tuto', true);
            else alert("Aucun document disponible pour charger le Tuteur IA.");
        };
    }

    drawer.classList.remove('hidden');
    setTimeout(() => drawer.classList.remove('translate-x-full'), 10);
}

export function closeThemeDrawer() {
    const drawer = document.getElementById('theme-drawer');
    if (drawer) {
        drawer.classList.add('translate-x-full');
        setTimeout(() => drawer.classList.add('hidden'), 300);
    }
}

export async function handleSearchInput() {
    const searchInput = document.getElementById('search-input');
    const subjectFilter = document.getElementById('subject-filter');
    const resultsContainer = document.getElementById('search-results-container');
    const resultsList = document.getElementById('search-results-list');
    const searchCount = document.getElementById('search-count');

    if (!searchInput || !resultsContainer || !resultsList) return;

    const q = searchInput.value.trim();
    const subject = subjectFilter ? subjectFilter.value : 'ALL';

    if (!q && subject === 'ALL' && !activeHighYieldOnly && !activeAnnalesOnly) {
        resultsContainer.classList.add('hidden');
        return;
    }

    try {
        const url = `/api/search?q=${encodeURIComponent(q)}&subject=${encodeURIComponent(subject)}&high_yield=${activeHighYieldOnly ? '1' : ''}&annales=${activeAnnalesOnly ? '1' : ''}`;
        const res = await fetch(url);
        const data = await res.json();

        resultsList.innerHTML = '';
        if (searchCount) searchCount.innerText = data.count || 0;

        if (data.results && data.results.length > 0) {
            data.results.forEach(item => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'p-3 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-sky-300 flex items-center justify-between gap-3 text-xs transition-all cursor-pointer';
                itemDiv.innerHTML = `
                    <div class="flex items-center gap-2.5 truncate">
                        <span class="text-base">📄</span>
                        <div class="truncate">
                            <h4 class="font-bold text-slate-900 truncate">${item.filename}</h4>
                            <p class="text-[10px] text-slate-500 font-semibold">${item.semester} • ${item.theme} • ${item.subject}</p>
                        </div>
                    </div>
                `;
                itemDiv.onclick = () => {
                    openWorkbench(item.id, item.filename, item.relative_path, item.file_type, item.theme, item.has_pdf_cache, item.pdf_cache_path);
                };
                resultsList.appendChild(itemDiv);
            });
            resultsContainer.classList.remove('hidden');
        } else {
            resultsList.innerHTML = `<p class="text-xs text-slate-400 italic">Aucun résultat trouvé.</p>`;
            resultsContainer.classList.remove('hidden');
        }
    } catch (err) {}
}

export function toggleFilter(type) {
    if (type === 'high_yield') {
        activeHighYieldOnly = !activeHighYieldOnly;
        document.getElementById('btn-hy').classList.toggle('border-amber-400', activeHighYieldOnly);
        document.getElementById('btn-hy').classList.toggle('bg-amber-50', activeHighYieldOnly);
    } else if (type === 'annales') {
        activeAnnalesOnly = !activeAnnalesOnly;
        document.getElementById('btn-annales').classList.toggle('border-purple-400', activeAnnalesOnly);
        document.getElementById('btn-annales').classList.toggle('bg-purple-50', activeAnnalesOnly);
    }
    handleSearchInput();
}

export function handleExportRevision() {
    window.location.href = '/api/export/revision-list';
}

function renderTimelineView(roadmapData) {
    const timelineSection = document.getElementById('timeline-view');
    if (!timelineSection || !roadmapData) return;

    let html = `<div class="relative border-l-2 border-slate-200 ml-4 sm:ml-6 pl-6 sm:pl-8 space-y-12">`;
    let stepIndex = 1;

    for (const [semester, themes] of Object.entries(roadmapData)) {
        if (activeSemester !== 'ALL' && activeSemester !== semester) continue;

        let sessionBadge = semester === 'Semestre 1' ? 'Session Janvier' : 'Session Mai/Juin';
        let colorClass = semester === 'Semestre 1' ? 'bg-[rgb(2,132,199)]' : 'bg-indigo-600';

        html += `
            <div class="relative group">
                <div class="absolute -left-[35px] sm:-left-[45px] top-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full ${colorClass} border-4 border-[rgb(248,250,252)] shadow-md flex items-center justify-center text-white text-[10px] sm:text-xs font-bold z-10">${stepIndex}</div>
                <div class="glass-panel p-5 sm:p-6 rounded-3xl bg-white/80 border border-slate-200/80 shadow-sm mb-6">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/80 pb-3">
                        <h3 class="text-lg font-extrabold text-slate-900 tracking-tight">Étape ${stepIndex} : ${semester}</h3>
                        <span class="text-xs px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-bold border border-slate-200">${sessionBadge}</span>
                    </div>
                </div>
        `;

        for (const [themeName, sections] of Object.entries(themes)) {
            // Compute Theme Progress
            let totalThemeItems = 0;
            let completedThemeItems = 0;
            let hasMatch = false;

            let fileCardsHtml = '';

            Object.values(sections).forEach(fileList => {
                fileList.forEach(item => {
                    totalThemeItems++;
                    const isDone = (item.status === 'completed' || item.status === 'mastered');
                    if (isDone) completedThemeItems++;
                    
                    const matchesHY = !activeHighYieldOnly || item.is_high_yield === 1;
                    const matchesAnnales = !activeAnnalesOnly || item.is_annale === 1;
                    
                    if (matchesHY && matchesAnnales) {
                        hasMatch = true;

                        // Generate Inner File Card
                        const ext = (item.file_type || '').toLowerCase();
                        let tagClass = "bg-slate-100 text-slate-800";
                        let tagText = "Doc";
                        
                        if (['pdf', 'docx'].includes(ext)) {
                            tagClass = "bg-[#fef08a] text-[#854d0e]";
                            tagText = "Article";
                        } else if (['mp4', 'mov', 'webm'].includes(ext)) {
                            tagClass = "bg-[#e9d5ff] text-[#6b21a8]";
                            tagText = "Video";
                        } else if (item.is_annale) {
                            tagClass = "bg-[#bbf7d0] text-[#166534]";
                            tagText = "Course";
                        }

                        // Attach openWorkbench directly to global window scope so it bypasses appEngine ghosts!
                        fileCardsHtml += `
                            <button onclick="window.openWorkbench(${item.id}, '${item.filename.replace(/'/g, "\\'")}', '${item.relative_path.replace(/'/g, "\\'")}', '${item.file_type}', '${themeName.replace(/'/g, "\\'")}', ${item.has_pdf_cache||0}, '${item.pdf_cache_path||''}')" 
                                    class="w-full text-left mt-2 p-2 hover:bg-slate-50 rounded-xl border border-slate-200 transition-all flex items-center justify-between group shadow-sm bg-white">
                                <div class="flex items-center gap-3 truncate pr-2">
                                    <span class="${tagClass} text-[9px] font-bold px-1.5 py-0.5 rounded shadow-[1px_1px_0_0_rgba(0,0,0,0.1)] uppercase w-12 text-center tracking-wide shrink-0 border border-[rgba(0,0,0,0.05)]">${tagText}</span>
                                    <span class="font-semibold text-xs text-slate-800 truncate group-hover:text-blue-600 transition-colors ${isDone ? 'line-through text-slate-400' : ''}">${item.filename}</span>
                                </div>
                            </button>
                        `;
                    }
                });
            });

            if (!hasMatch && (activeHighYieldOnly || activeAnnalesOnly)) continue;
            const themePct = totalThemeItems > 0 ? Math.round((completedThemeItems / totalThemeItems) * 100) : 0;

            // Render the Timeline Theme Header + Nested Resources
            html += `
                <div class="mb-8 relative border-l-2 border-slate-300 ml-4 pl-6">
                    <div class="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-slate-300 border-4 border-[rgb(248,250,252)]"></div>
                    <div class="flex justify-between items-center mb-3">
                        <h4 class="font-extrabold text-slate-900 text-sm leading-snug">${themeName}</h4>
                        <span class="text-[10px] font-mono font-extrabold bg-slate-100 px-2 py-0.5 rounded ${themePct === 100 ? 'text-emerald-600' : 'text-slate-600'}">${themePct}%</span>
                    </div>
                    <!-- The nested files -->
                    <div class="pl-2">
                        ${fileCardsHtml}
                    </div>
                </div>
            `;
        }

        html += `</div></div></div>`;
        stepIndex++;
    }

    html += `</div>`;
    timelineSection.innerHTML = html;
}

initRoadmapController();
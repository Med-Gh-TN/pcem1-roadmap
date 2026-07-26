/**
 * @file static/js/features/workbench.js
 * @description Handles PDF/Media Readers, Tab Switching, Note Taking, HTML Summaries, Tuto IA, and Instant Optimistic UI Updates.
 * @layer Core Logic / State Persistence
 * @dependencies ../core/state.js, ./qcm_player.js, ./tuto.js
 */

import { State } from '../core/state.js';
import { fetchQcmHistory } from './qcm_player.js';
import { initTuto, startTutoSession, stopTutoSession } from './tuto.js';

const API = window.API;

export async function triggerPdfConversion(resourceId) {
    const btn = document.getElementById('btn-convert-pdf');
    if (btn) btn.innerHTML = `<span class="animate-spin inline-block w-4 h-4 border-2 border-[rgb(15,23,42)] border-t-transparent rounded-full mr-2"></span> Traitement...`;
    try {
        const res = await fetch(`/api/convert/${resourceId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const result = await res.json();
        if (result.success && result.cached_url) {
            const r = State.getResourceById(resourceId);
            if (r) { r.has_pdf_cache = 1; r.pdf_cache_path = result.cached_url.split('/').pop().split('?')[0]; }
            document.getElementById('workbench-media-placeholder').classList.add('hidden');
            document.getElementById('workbench-pdf-frame').src = `${result.cached_url}?t=${Date.now()}`;
            document.getElementById('workbench-pdf-frame').classList.remove('hidden');
        }
    } catch (err) { console.error(err); }
}

export async function openWorkbench(resourceId, filename, safePath, fileType, theme, initialHasPdfCache = 0, initialPdfCachePath = '', targetTab = 'notes', autoTrigger = false) {
    const modal = document.getElementById('modal');
    if (modal) modal.classList.add('hidden');

    State.currentWorkbenchResourceId = resourceId;
    State.currentWorkbenchFilename = filename;
    State.currentWorkbenchTheme = theme || 'Général';
    State.workbenchStartTime = Date.now();

    initTuto();
    switchWorkbenchTab(targetTab);

    const resumeSetupView = document.getElementById('resume-setup-view');
    const resumeLoadingView = document.getElementById('resume-loading-view');
    const resumeFrame = document.getElementById('workbench-resume-frame');
    if (resumeSetupView) { resumeSetupView.classList.remove('hidden'); resumeSetupView.classList.add('flex'); }
    if (resumeLoadingView) { resumeLoadingView.classList.remove('flex'); resumeLoadingView.classList.add('hidden'); }
    if (resumeFrame) { resumeFrame.classList.add('hidden'); resumeFrame.srcdoc = ''; }

    // Silent Cache Pre-load Check
    fetch(`/api/ai/summarize?resource_id=${resourceId}&check_cache_only=true`)
        .then(res => res.json())
        .then(data => {
            if (data.has_cache && data.html) {
                if (resumeSetupView) { resumeSetupView.classList.remove('flex'); resumeSetupView.classList.add('hidden'); }
                if (resumeFrame) { 
                    resumeFrame.srcdoc = data.html; 
                    resumeFrame.classList.remove('hidden'); 
                }
            } else if (targetTab === 'resume' && autoTrigger) {
                generateWorkbenchResume();
            }
        }).catch(err => console.error("Cache pre-load check failed", err));

    const qcmContentBox = document.getElementById('workbench-qcm-content');
    if (qcmContentBox) qcmContentBox.innerHTML = ''; 
    document.getElementById('qcm-setup-view').classList.remove('hidden');
    document.getElementById('qcm-setup-view').classList.add('flex');

    fetchQcmHistory(resourceId);

    let hasPdfCache = initialHasPdfCache, pdfCachePath = initialPdfCachePath;
    const freshestData = State.getResourceById(resourceId);
    if (freshestData) { hasPdfCache = freshestData.has_pdf_cache || 0; pdfCachePath = freshestData.pdf_cache_path || ''; }

    document.getElementById('workbench-modal-title').innerText = filename || 'Espace de Travail';
    document.getElementById('workbench-file-label').innerText = filename || '';

    // Unquote safePath to cleanly decode encoded colons (%3A) or slashes (%2F)
    let cleanPath = safePath || '';
    try {
        cleanPath = decodeURIComponent(cleanPath);
    } catch(e) {}

    const isCdn = cleanPath.startsWith('http://') || 
                  cleanPath.startsWith('https://') || 
                  cleanPath.includes('.r2.dev');

    let fullUrl = isCdn ? cleanPath : `/source/${cleanPath}`;
    if (isCdn) {
        fullUrl = fullUrl.replace(/ /g, '%20');
    }

    const pdfFrame = document.getElementById('workbench-pdf-frame');
    const videoPlayer = document.getElementById('workbench-video-player');
    const mediaPlaceholder = document.getElementById('workbench-media-placeholder');

    [pdfFrame, videoPlayer, mediaPlaceholder].forEach(el => { if (el) el.classList.add('hidden'); });

    const ext = (fileType || '').toLowerCase();

    if (isCdn && ext === 'pdf') {
        pdfFrame.src = fullUrl; 
        pdfFrame.classList.remove('hidden');
    } else if (hasPdfCache === 1 && pdfCachePath && !isCdn) {
        pdfFrame.src = `/cache/${pdfCachePath}`; 
        pdfFrame.classList.remove('hidden');
    } else if (ext === 'pdf') {
        pdfFrame.src = fullUrl; 
        pdfFrame.classList.remove('hidden');
    } else if (['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext)) {
        document.getElementById('workbench-video-source').src = fullUrl;
        videoPlayer.load(); 
        videoPlayer.classList.remove('hidden');
    } else {
        mediaPlaceholder.classList.remove('hidden');
    }

    // Set active status button UI state immediately
    if (freshestData) {
        document.querySelectorAll('.workbench-status-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-status') === freshestData.status);
        });
    }

    try {
        const notesData = await API.getNotes(State.currentWorkbenchTheme);
        document.getElementById('workbench-notes-input').value = notesData.content || '';
        const stats = await API.getStudyStats(State.currentWorkbenchTheme);
        document.getElementById('workbench-theme-time').innerText = `${stats.weekly_hours || 0.0}h`;
    } catch (e) { }

    document.getElementById('workbench-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function switchWorkbenchTab(tabId) {
    ['notes', 'tuto', 'resume', 'qcm'].forEach(id => {
        const btn = document.getElementById(`tab-btn-${id}`);
        const tab = document.getElementById(`workbench-tab-${id}`);
        if (!btn || !tab) return;
        
        if (id === tabId) {
            tab.classList.remove('hidden'); tab.classList.add('flex');
            btn.classList.add('font-extrabold', 'border-[rgb(2,132,199)]', 'text-[rgb(2,132,199)]');
            btn.classList.remove('font-semibold', 'border-transparent', 'text-[rgb(100,116,139)]');
            
            if (id === 'tuto') {
                const notes = document.getElementById('workbench-notes-input').value || "Aucune note pour le moment.";
                const contextData = {
                    theme: State.currentWorkbenchTheme,
                    filename: State.currentWorkbenchFilename,
                    notes: notes
                };
                startTutoSession(contextData);
            }
        } else {
            tab.classList.add('hidden'); tab.classList.remove('flex');
            btn.classList.remove('font-extrabold', 'border-[rgb(2,132,199)]', 'text-[rgb(2,132,199)]');
            btn.classList.add('font-semibold', 'border-transparent', 'text-[rgb(100,116,139)]');
            
            if (id === 'tuto') {
                stopTutoSession();
            }
        }
    });
}

export function toggleWorkbenchFullscreen() {
    const modal = document.getElementById('workbench-modal');
    const isFullscreen = modal.classList.toggle('is-fullscreen');
    document.getElementById('btn-workbench-fullscreen').innerText = isFullscreen ? '🗗' : '⛶';
}

export async function closeWorkbench() {
    if (State.workbenchStartTime && State.currentWorkbenchTheme) {
        const elapsedSec = Math.round((Date.now() - State.workbenchStartTime) / 1000);
        if (elapsedSec >= 10) await API.recordStudyLog(State.currentWorkbenchTheme, elapsedSec, 'workbench');
    }
    State.workbenchStartTime = null;

    if (State.questionTimeInterval) clearInterval(State.questionTimeInterval);

    try { await API.saveNotes(State.currentWorkbenchTheme, document.getElementById('workbench-notes-input').value); } catch(e){}

    const workbenchModal = document.getElementById('workbench-modal');
    if (workbenchModal) { workbenchModal.classList.add('hidden'); workbenchModal.classList.remove('is-fullscreen'); }
    
    const frame = document.getElementById('workbench-resume-frame');
    if (frame) { frame.srcdoc = ''; frame.classList.add('hidden'); }
    
    stopTutoSession();

    document.body.style.overflow = '';
    // Background refresh when closing workbench so dashboard updates naturally
    if(window.appEngine) window.appEngine.fetchAndRenderRoadmap();
}

export function handleNotesInput() {
    document.getElementById('notes-save-status').classList.add('opacity-0');
    clearTimeout(State.notesDebounceTimer);
    State.notesDebounceTimer = setTimeout(async () => {
        await API.saveNotes(State.currentWorkbenchTheme, document.getElementById('workbench-notes-input').value);
        document.getElementById('notes-save-status').classList.remove('opacity-0');
    }, 800);
}

/**
 * ⚡ OPTIMISTIC UI UPDATE:
 * Updates the local DOM node instantly (<10ms) while persisting changes to Neon DB in the background.
 */
export async function setWorkbenchMastery(status) {
    if (!State.currentWorkbenchResourceId) return;
    
    // 1. INSTANT UI UPDATE (<10ms)
    document.querySelectorAll('.workbench-status-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-status') === status);
    });

    // 2. Update local state cache
    const r = State.getResourceById(State.currentWorkbenchResourceId);
    if (r) { r.status = status; }

    // 3. Persist to Neon DB asynchronously in background (Non-blocking)
    try {
        await API.updateProgress(State.currentWorkbenchResourceId, status);
    } catch(err) {
        console.error("Background progress update failed:", err);
    }
}

export function generateWorkbenchResume() {
    if (!State.currentWorkbenchResourceId) return;
    const setupView = document.getElementById('resume-setup-view');
    const loadingView = document.getElementById('resume-loading-view');
    const frame = document.getElementById('workbench-resume-frame');
    
    setupView.classList.remove('flex'); setupView.classList.add('hidden'); 
    frame.classList.add('hidden');
    loadingView.classList.remove('hidden'); loadingView.classList.add('flex');
    
    API.streamAI('/api/ai/summarize', { resource_id: State.currentWorkbenchResourceId, topic: State.currentWorkbenchTheme, filename: State.currentWorkbenchFilename },
        (progress) => {
            document.getElementById('resume-loading-text').innerText = progress.message;
            if (progress.eta) document.getElementById('resume-loading-eta').innerText = `~${progress.eta}s`;
        },
        (result) => {
            loadingView.classList.remove('flex'); loadingView.classList.add('hidden');
            if (result.data && result.data.html) { frame.srcdoc = result.data.html; frame.classList.remove('hidden'); }
        },
        (errorMsg) => {
            loadingView.classList.remove('flex'); loadingView.classList.add('hidden'); 
            setupView.classList.remove('hidden'); setupView.classList.add('flex');
            alert(`Erreur IA: ${errorMsg}`);
        }
    );
}
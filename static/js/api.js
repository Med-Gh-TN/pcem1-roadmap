/**
 * @file static/js/api.js
 * @description Asynchronous API HTTP Client with Server-Sent Events (SSE) stream support for AI tasks, Productivity Tools, and Module 5 Analytics.
 * @layer Core Logic / Client API Communication
 */

const API_MODULE = {
    /**
     * Fetches the full roadmap hierarchy and global statistics (including faculty weighted progress).
     */
    async getRoadmap() {
        try {
            const response = await fetch('/api/roadmap');
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Failed to fetch roadmap`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API Error] getRoadmap failed:', error);
            throw error;
        }
    },

    /**
     * Performs instant multi-criteria filtering across all resources.
     */
    async search(query, subject, highYieldOnly, annalesOnly) {
        try {
            const params = new URLSearchParams({
                q: query || '',
                subject: subject || 'ALL',
                high_yield: highYieldOnly ? '1' : '',
                annales: annalesOnly ? '1' : ''
            });
            const response = await fetch(`/api/search?${params.toString()}`);
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Search query failed`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API Error] search failed:', error);
            throw error;
        }
    },

    /**
     * Updates study completion status for a specific resource ID in SQLite.
     * Supports 4 mastery states: 'not_started', 'in_progress', 'completed'/'mastered', 'needs_revision'.
     * @param {number|string} id
     * @param {string} status
     * @param {string} [notes]
     */
    async updateProgress(id, status, notes = '') {
        try {
            const response = await fetch('/api/progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status, notes })
            });
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Failed to update progress`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API Error] updateProgress failed:', error);
            throw error;
        }
    },

    /**
     * Records a study session duration for a specific theme in SQLite.
     * @param {string} theme
     * @param {number} durationSeconds
     * @param {string} [sessionType='pomodoro']
     */
    async recordStudyLog(theme, durationSeconds, sessionType = 'pomodoro') {
        try {
            const response = await fetch('/api/study-log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    theme,
                    duration_seconds: Math.round(durationSeconds),
                    session_type: sessionType
                })
            });
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Failed to record study log`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API Error] recordStudyLog failed:', error);
            throw error;
        }
    },

    /**
     * Fetches aggregated study time statistics per theme or overall.
     * @param {string} [theme]
     */
    async getStudyStats(theme = '') {
        try {
            const url = theme 
                ? `/api/study-log/stats?theme=${encodeURIComponent(theme)}`
                : '/api/study-log/stats';
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Failed to fetch study stats`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API Error] getStudyStats failed:', error);
            throw error;
        }
    },

    /**
     * Fetches saved split-screen notes for a specific theme.
     * @param {string} theme
     */
    async getNotes(theme) {
        try {
            const response = await fetch(`/api/notes?theme=${encodeURIComponent(theme || '')}`);
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Failed to fetch notes`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API Error] getNotes failed:', error);
            throw error;
        }
    },

    /**
     * Saves split-screen notes for a specific theme.
     * @param {string} theme
     * @param {string} content
     */
    async saveNotes(theme, content) {
        try {
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ theme, content })
            });
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Failed to save notes`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API Error] saveNotes failed:', error);
            throw error;
        }
    },

    /**
     * Fetches exam session dates for the countdown widget.
     */
    async getExamCountdown() {
        try {
            const response = await fetch('/api/exam-countdown');
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Failed to fetch exam countdown`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API Error] getExamCountdown failed:', error);
            throw error;
        }
    },

    /**
     * Fetches daily study heatmap history, current streak, and longest streak statistics.
     */
    async getStreakAnalytics() {
        try {
            const response = await fetch('/api/analytics/streak');
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Failed to fetch streak analytics`);
            }
            return await response.json();
        } catch (error) {
            console.error('[API Error] getStreakAnalytics failed:', error);
            throw error;
        }
    },

    /**
     * Triggers a browser download of the Markdown summary for topics marked 'needs_revision'.
     */
    async exportRevisionList() {
        try {
            const response = await fetch('/api/export/revision-list');
            if (!response.ok) {
                throw new Error(`HTTP Error ${response.status}: Failed to export revision list`);
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'PCEM1_Revision_Summary.md';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            return { success: true };
        } catch (error) {
            console.error('[API Error] exportRevisionList failed:', error);
            throw error;
        }
    },

    /**
     * Listens to Server-Sent Events (SSE) AI generation stream with status callbacks.
     * @param {string} endpoint Stream URL path (/api/ai/quiz, /api/ai/explain, etc.)
     * @param {Object} params Query string parameters.
     * @param {Function} onProgress Callback for status & ETA updates.
     * @param {Function} onComplete Callback when TOON result is received.
     * @param {Function} onError Callback for errors.
     */
    streamAI(endpoint, params, onProgress, onComplete, onError) {
        const queryString = new URLSearchParams(params).toString();
        const eventSource = new EventSource(`${endpoint}?${queryString}`);

        eventSource.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);

                if (payload.status === 'COMPLETE') {
                    eventSource.close();
                    if (onComplete) onComplete(payload);
                } else if (payload.status === 'ERROR') {
                    eventSource.close();
                    if (onError) onError(payload.message);
                } else {
                    if (onProgress) onProgress(payload);
                }
            } catch (err) {
                eventSource.close();
                if (onError) onError('Failed to parse SSE payload');
            }
        };

        eventSource.onerror = (err) => {
            eventSource.close();
            if (onError) onError('Connection error during AI generation stream.');
        };
    }
};

// 🐛 BUG FIX: Explicitly bind the object to the window so ES6 modules can access it globally.
window.API = API_MODULE;
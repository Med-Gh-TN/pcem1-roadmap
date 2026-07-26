/**
 * @file static/js/core/state.js
 * @description Centralized State Manager for cross-module communication.
 */

export const State = {
    // Roadmap State
    roadmapData: {},
    latestRoadmapStats: null,
    currentSemester: 'ALL',
    currentViewMode: 'grid', 
    filterHighYieldOnly: false,
    filterAnnalesOnly: false,
    isWeightedProgress: false,

    // Gamification State
    pomodoroSeconds: 25 * 60,
    pomodoroTimerId: null,
    pomodoroRunning: false,
    currentPomodoroTheme: 'Général',

    // Workbench State
    workbenchStartTime: null,
    currentWorkbenchTheme: '',
    currentWorkbenchFilename: '',
    currentWorkbenchResourceId: null,
    notesDebounceTimer: null,

    // QCM & Gamified AI State
    activeQuizQuestions: [],
    currentQuestionIdx: 0,
    userQuizAnswers: {},
    currentQuizContainerId: 'ai-modal-content', 
    questionTimeInterval: null,
    questionTimeElapsed: 0,
    totalQuizTime: 0,

    getResourceById(id) {
        if (!this.roadmapData) return null;
        for (const sem in this.roadmapData) {
            for (const thm in this.roadmapData[sem]) {
                for (const sec in this.roadmapData[sem][thm]) {
                    const found = this.roadmapData[sem][thm][sec].find(item => item.id === id);
                    if (found) return found;
                }
            }
        }
        return null;
    }
};
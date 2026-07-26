/**
 * @file static/js/features/gamification.js
 * @description Gamification: Pomodoro Timers, Study Streaks, and Heatmap.
 */
import { State } from '../core/state.js';

const API = window.API;

export async function initExamCountdown() {
    try {
        const res = await API.getExamCountdown();
        if (res && res.sessions) {
            const janSession = res.sessions.find(s => s.id === 'janvier');
            const maiSession = res.sessions.find(s => s.id === 'mai');
            const now = new Date();

            if (janSession) {
                const diffDaysJan = Math.max(0, Math.ceil((new Date(janSession.target_date) - now) / (1000 * 60 * 60 * 24)));
                const janEl = document.getElementById('countdown-janvier');
                if (janEl) janEl.innerText = `Janvier: ${diffDaysJan}j`;
            }

            if (maiSession) {
                const diffDaysMai = Math.max(0, Math.ceil((new Date(maiSession.target_date) - now) / (1000 * 60 * 60 * 24)));
                const maiEl = document.getElementById('countdown-mai');
                if (maiEl) maiEl.innerText = `Mai: ${diffDaysMai}j`;
            }
        }
    } catch (err) { console.error(err); }
}

export async function initGlobalStudyStats() {
    try {
        const stats = await API.getStudyStats();
        const studyTimeEl = document.getElementById('stat-study-time');
        if (studyTimeEl) studyTimeEl.innerText = `${stats.grand_total_hours || 0.0}h`;
    } catch (err) { console.error(err); }
}

export async function fetchAndRenderHeatmap() {
    try {
        const data = await API.getStreakAnalytics();
        const streakDaysEl = document.getElementById('streak-days-text');
        if (streakDaysEl) streakDaysEl.innerText = `${data.current_streak || 0} Jours d'affilée`;
        const streakMaxEl = document.getElementById('streak-max-text');
        if (streakMaxEl) streakMaxEl.innerText = `(Max: ${data.longest_streak || 0}j)`;

        const gridEl = document.getElementById('heatmap-grid');
        const monthsTrack = document.getElementById('heatmap-months-track');
        if (!gridEl) return;
        gridEl.innerHTML = '';
        if (monthsTrack) monthsTrack.innerHTML = '';

        const today = new Date();
        const currentDayOfWeek = today.getDay(); 
        const dailyMap = data.daily_map || {};
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - (51 * 7 + currentDayOfWeek));
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let lastMonthSeen = -1;

        for (let col = 0; col < 52; col++) {
            const weekCol = document.createElement('div');
            weekCol.className = 'flex flex-col gap-1.5';
            const colSunday = new Date(startDate);
            colSunday.setDate(startDate.getDate() + col * 7);
            const monthIdx = colSunday.getMonth();

            if (monthIdx !== lastMonthSeen) {
                lastMonthSeen = monthIdx;
                if (monthsTrack) {
                    const mLabel = document.createElement('span');
                    mLabel.className = 'heatmap-month-label';
                    mLabel.style.setProperty('--col-idx', col);
                    mLabel.innerText = monthNames[monthIdx];
                    monthsTrack.appendChild(mLabel);
                }
            }
            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
                const tileDate = new Date(colSunday);
                tileDate.setDate(colSunday.getDate() + dayOfWeek);
                const dateStr = tileDate.toISOString().split('T')[0];
                const dayData = dailyMap[dateStr] || { count: 0, hours: 0, level: 0 };
                const level = dayData.level || 0;
                const tile = document.createElement('div');
                tile.className = `heatmap-tile heatmap-level-${level}`;
                tile.title = `${dateStr}: ${dayData.hours || 0}h d'étude (${dayData.count || 0} sessions)`;
                weekCol.appendChild(tile);
            }
            gridEl.appendChild(weekCol);
        }
    } catch (err) { console.error(err); }
}

export function togglePomodoro() { 
    State.pomodoroRunning ? pausePomodoro() : startPomodoro(); 
}

export function startPomodoro() {
    State.pomodoroRunning = true;
    document.getElementById('pomodoro-widget').classList.add('timer-running');
    document.getElementById('btn-timer-toggle').innerText = '⏸';
    State.pomodoroTimerId = setInterval(tickPomodoro, 1000);
}

export function pausePomodoro() {
    State.pomodoroRunning = false;
    if (State.pomodoroTimerId) clearInterval(State.pomodoroTimerId);
    document.getElementById('pomodoro-widget').classList.remove('timer-running');
    document.getElementById('btn-timer-toggle').innerText = '▶';
}

export function resetPomodoro() { 
    pausePomodoro(); 
    State.pomodoroSeconds = 25 * 60; 
    updateTimerDisplay(); 
}

function tickPomodoro() {
    if (State.pomodoroSeconds > 0) { 
        State.pomodoroSeconds--; 
        updateTimerDisplay(); 
    } else {
        pausePomodoro();
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.value = 587.33;
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.6);
        } catch (e) { console.log('Audio alert fallback'); }

        alert(`⏱️ Session Pomodoro terminée! 25 minutes enregistrées.`);
        API.recordStudyLog(State.currentPomodoroTheme, 1500, 'pomodoro').then(() => { 
            if(window.appEngine) window.appEngine.fetchAndRenderRoadmap(); 
            fetchAndRenderHeatmap(); 
        });
        resetPomodoro();
    }
}

function updateTimerDisplay() {
    const mins = Math.floor(State.pomodoroSeconds / 60); 
    const secs = State.pomodoroSeconds % 60;
    document.getElementById('timer-display').innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
"""
@file controllers/gamification_routes.py
@description Routes for Gamification (Streak, Heatmap, Mastery Agent, Study Logs, Notes).
@layer HTTP Controllers
@dependencies flask, repository.user_data_repo, repository.roadmap_repo, services.mastery_engine, datetime
"""

from flask import Blueprint, jsonify, request
from repository import user_data_repo, roadmap_repo
from services.mastery_engine import evaluate_qcm_mastery
from datetime import datetime, timedelta, date

gamification_bp = Blueprint('gamification', __name__)

@gamification_bp.route('/api/analytics/streak', methods=['GET'])
def get_streak_and_heatmap():
    daily_rows = user_data_repo.get_daily_streak_data()
    daily_map = {}
    
    for r in daily_rows:
        log_date_raw = r['log_date']
        # Convert native datetime.date objects from PostgreSQL to string YYYY-MM-DD
        log_date_str = log_date_raw.strftime('%Y-%m-%d') if isinstance(log_date_raw, (date, datetime)) else str(log_date_raw)
        sec = r['total_seconds'] or 0
        if sec <= 0: level = 0
        elif sec <= 1800: level = 1
        elif sec <= 5400: level = 2
        elif sec <= 10800: level = 3
        else: level = 4

        daily_map[log_date_str] = {
            "date": log_date_str, "count": r['session_count'], 
            "duration_seconds": sec, "hours": round(sec / 3600.0, 2), "level": level
        }

    today = datetime.now().date()
    yesterday = today - timedelta(days=1)
    current_streak = longest_streak = temp_streak = 0
    active_dates = sorted([datetime.strptime(d, '%Y-%m-%d').date() for d in daily_map.keys()])

    if active_dates:
        check_date = today if today in active_dates else (yesterday if yesterday in active_dates else None)
        if check_date:
            while check_date in active_dates:
                current_streak += 1
                check_date -= timedelta(days=1)

        prev_date = None
        for d in active_dates:
            if prev_date is None or d == prev_date + timedelta(days=1):
                temp_streak += 1
            else: temp_streak = 1
            longest_streak = max(longest_streak, temp_streak)
            prev_date = d

    return jsonify({"current_streak": current_streak, "longest_streak": longest_streak, "total_days_studied": len(daily_map), "daily_map": daily_map})

@gamification_bp.route('/api/qcm/submit', methods=['POST'])
def submit_qcm_mastery():
    data = request.get_json(silent=True) or {}
    resource_id = data.get('resource_id')
    score = int(data.get('score', 0))
    total = int(data.get('total', 10))
    difficulty = data.get('difficulty', 'Moyen')
    time_spent = int(data.get('time_spent_sec', 0))

    if not resource_id or total <= 0: 
        return jsonify({"error": "Données invalides."}), 400

    # Delegate math to the pure Service Layer
    verdict, final_calc_score, time_per_question = evaluate_qcm_mastery(score, total, difficulty, time_spent)

    # Delegate writes to the Repository Layer
    user_data_repo.log_qcm_attempt(resource_id, score, total, difficulty, time_spent)
    roadmap_repo.update_resource_status_only(resource_id, verdict)

    return jsonify({"success": True, "verdict": verdict, "final_score_calculated": final_calc_score, "time_per_question": time_per_question})

@gamification_bp.route('/api/qcm/history/<int:resource_id>', methods=['GET'])
def get_qcm_history(resource_id):
    return jsonify(user_data_repo.get_qcm_history(resource_id))

@gamification_bp.route('/api/study-log', methods=['POST'])
def record_study_log():
    data = request.get_json(silent=True) or {}
    theme, duration = data.get('theme', '').strip(), data.get('duration_seconds')
    if not theme or not isinstance(duration, int) or duration <= 0: 
        return jsonify({"error": "Invalid inputs"}), 400
        
    log_id = user_data_repo.log_study_session(theme, duration, data.get('session_type', 'pomodoro').strip())
    return jsonify({"success": True, "log_id": log_id, "theme": theme, "duration_seconds": duration})

@gamification_bp.route('/api/study-log/stats', methods=['GET'])
def get_study_stats():
    theme_filter = request.args.get('theme', '').strip()
    if theme_filter:
        r = user_data_repo.get_study_stats_by_theme(theme_filter)
        t, w = r.get('total_seconds') or 0, r.get('weekly_seconds') or 0
        return jsonify({"theme": theme_filter, "total_seconds": t, "total_hours": round(t/3600.0, 2), "weekly_seconds": w, "weekly_hours": round(w/3600.0, 2)})

    rows, gt = user_data_repo.get_all_study_stats()
    by_theme = {}
    for r in rows:
        t, w = r.get('total_seconds') or 0, r.get('weekly_seconds') or 0
        by_theme[r['theme']] = {"total_seconds": t, "total_hours": round(t/3600.0, 2), "weekly_seconds": w, "weekly_hours": round(w/3600.0, 2)}
    return jsonify({"grand_total_seconds": gt, "grand_total_hours": round(gt/3600.0, 2), "themes": by_theme})

@gamification_bp.route('/api/notes', methods=['GET', 'POST'])
def manage_notes():
    if request.method == 'GET':
        theme = request.args.get('theme', '').strip()
        return jsonify({"theme": theme, "content": user_data_repo.get_theme_note(theme)})

    data = request.get_json(silent=True) or {}
    theme = data.get('theme', '').strip()
    user_data_repo.save_theme_note(theme, data.get('content', ''))
    return jsonify({"success": True, "theme": theme})
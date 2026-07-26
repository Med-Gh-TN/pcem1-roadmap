
from repository.db import get_db

def log_study_session(theme: str, duration_seconds: int, session_type: str) -> int:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO study_logs (theme, duration_seconds, session_type) 
        VALUES (%s, %s, %s) RETURNING id
    ''', (theme, duration_seconds, session_type))
    log_id = cursor.fetchone()['id']
    conn.commit()
    conn.close()
    return log_id

def get_daily_streak_data():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT 
            CAST(created_at AS DATE) as log_date,
            COUNT(*) as session_count,
            SUM(duration_seconds) as total_seconds
        FROM study_logs
        GROUP BY CAST(created_at AS DATE)
        ORDER BY log_date ASC
    ''')
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_study_stats_by_theme(theme: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT SUM(duration_seconds) as total_seconds,
               SUM(CASE WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN duration_seconds ELSE 0 END) as weekly_seconds
        FROM study_logs WHERE LOWER(theme) = LOWER(%s)
    ''', (theme,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else {'total_seconds': 0, 'weekly_seconds': 0}

def get_all_study_stats():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT theme, SUM(duration_seconds) as total_seconds,
               SUM(CASE WHEN created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN duration_seconds ELSE 0 END) as weekly_seconds
        FROM study_logs GROUP BY theme ORDER BY total_seconds DESC
    ''')
    rows = cursor.fetchall()
    
    cursor.execute("SELECT SUM(duration_seconds) as grand_total FROM study_logs")
    gt_row = cursor.fetchone()
    conn.close()
    return [dict(r) for r in rows], gt_row['grand_total'] or 0

def get_theme_note(theme: str) -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT content FROM theme_notes WHERE LOWER(theme) = LOWER(%s)", (theme,))
    row = cursor.fetchone()
    conn.close()
    return row['content'] if row else ""

def save_theme_note(theme: str, content: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO theme_notes (theme, content, updated_at) VALUES (%s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT(theme) DO UPDATE SET content = excluded.content, updated_at = CURRENT_TIMESTAMP
    ''', (theme, content))
    conn.commit()
    conn.close()

def log_qcm_attempt(resource_id: int, score: int, total: int, difficulty: str, time_spent_sec: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO qcm_history (resource_id, score, total, difficulty, time_spent_sec) 
        VALUES (%s, %s, %s, %s, %s)
    ''', (resource_id, score, total, difficulty, time_spent_sec))
    conn.commit()
    conn.close()

def get_qcm_history(resource_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT * FROM qcm_history 
        WHERE resource_id = %s 
        ORDER BY created_at DESC LIMIT 10
    ''', (resource_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]
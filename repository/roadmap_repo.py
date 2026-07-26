

from repository.db import get_db

def get_all_resources():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM resources ORDER BY semester, theme, section, subject, filename')
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def search_resources(query: str, subject: str, high_yield: str, annales: str):
    conn = get_db()
    cursor = conn.cursor()
    sql = "SELECT * FROM resources WHERE 1=1"
    params = []

    if query:
        sql += " AND (LOWER(filename) LIKE %s OR LOWER(subject) LIKE %s OR LOWER(theme) LIKE %s)"
        term = f"%{query.lower()}%"
        params.extend([term, term, term])

    if subject and subject != 'ALL':
        sql += " AND LOWER(subject) = LOWER(%s)"
        params.append(subject)

    if high_yield == '1': sql += " AND is_high_yield = 1"
    if annales == '1': sql += " AND is_annale = 1"

    sql += " ORDER BY semester, theme, section, filename LIMIT 100"
    cursor.execute(sql, params)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_resource_by_id(resource_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM resources WHERE id = %s', (resource_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_resource_by_filename(filename: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT id, relative_path FROM resources WHERE filename = %s', (filename,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_first_resource_by_theme(theme: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT relative_path FROM resources WHERE theme = %s LIMIT 1', (theme,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_resource_progress(resource_id: int, status: str, notes: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE resources SET status = %s, notes = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s', 
                 (status, notes, resource_id))
    conn.commit()
    conn.close()

def update_resource_status_only(resource_id: int, status: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('UPDATE resources SET status = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s', 
                 (status, resource_id))
    conn.commit()
    conn.close()

def get_revision_list():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT r.*, n.content as theme_note
        FROM resources r
        LEFT JOIN theme_notes n ON LOWER(r.theme) = LOWER(n.theme)
        WHERE r.status = 'needs_revision'
        ORDER BY r.semester, r.subject, r.theme, r.filename
    ''')
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_summary_cache(resource_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT content FROM course_summaries WHERE resource_id = %s', (resource_id,))
    row = cursor.fetchone()
    conn.close()
    return row['content'] if row else None

def save_summary_cache(resource_id: int, content: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO course_summaries (resource_id, content) 
        VALUES (%s, %s)
        ON CONFLICT(resource_id) DO UPDATE SET content = excluded.content, created_at = CURRENT_TIMESTAMP
    ''', (resource_id, content))
    conn.commit()
    conn.close()

def sync_scanned_resources(resources: list, valid_paths: set) -> int:
    """ Used by the organizer crawler to sync DB state. Returns number of pruned rows. """
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.executemany('''
        INSERT INTO resources (
            semester, theme, section, subject, doc_type, filename, relative_path, 
            file_type, is_high_yield, is_annale, file_size, curriculum_weight, entropy_score
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT(relative_path) DO UPDATE SET
            semester=excluded.semester, theme=excluded.theme, section=excluded.section,
            subject=excluded.subject, doc_type=excluded.doc_type, filename=excluded.filename, 
            file_type=excluded.file_type, is_high_yield=excluded.is_high_yield, 
            is_annale=excluded.is_annale, file_size=excluded.file_size,
            curriculum_weight=excluded.curriculum_weight, entropy_score=excluded.entropy_score;
    ''', resources)
    
    cursor.execute("SELECT id, relative_path FROM resources")
    all_db_rows = cursor.fetchall()
    deleted_count = 0
    for row in all_db_rows:
        if row['relative_path'] not in valid_paths:
            cursor.execute("DELETE FROM resources WHERE id = %s", (row['id'],))
            deleted_count += 1
            
    conn.commit()
    conn.close()
    return deleted_count
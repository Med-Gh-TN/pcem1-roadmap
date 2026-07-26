# @file scripts/migrate_sqlite_to_neon.py
# @description One-time script to migrate legacy user data (logs, notes, gamification) from local SQLite to remote Neon PostgreSQL.
# @layer State Persistence
# @dependencies sqlite3, psycopg2, os, dotenv

import os
import sqlite3
import psycopg2
from psycopg2.extras import execute_batch
from pathlib import Path
from dotenv import load_dotenv

# Ensure we are loading the .env file
load_dotenv()

BASE_DIR = Path(__file__).parent.parent.resolve()
SQLITE_DB = BASE_DIR / "pcem1_roadmap.db"

def get_pg_connection():
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise ValueError("🚨 DATABASE_URL missing from .env")
    return psycopg2.connect(db_url)

def get_sqlite_connection():
    if not SQLITE_DB.exists():
        raise FileNotFoundError(f"🚨 Local SQLite DB not found at {SQLITE_DB}")
    conn = sqlite3.connect(str(SQLITE_DB))
    conn.row_factory = sqlite3.Row
    return conn

def migrate_table(sqlite_conn, pg_conn, table_name, columns):
    """ Migrates a single table using fast batch execution """
    print(f"[🔄] Migrating {table_name}...")
    
    # 1. Fetch from SQLite
    sqlite_cursor = sqlite_conn.cursor()
    sqlite_cursor.execute(f"SELECT {', '.join(columns)} FROM {table_name}")
    rows = sqlite_cursor.fetchall()
    
    if not rows:
        print(f"     └─ 0 rows found. Skipping.")
        return

    # 2. Convert to tuple list for psycopg2
    data_to_insert = [tuple(row[col] for col in columns) for row in rows]
    
    # 3. Insert into Postgres
    pg_cursor = pg_conn.cursor()
    placeholders = ", ".join(["%s"] * len(columns))
    insert_query = f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({placeholders})"
    
    try:
        # execute_batch sends data in massive chunks, taking milliseconds instead of seconds
        execute_batch(pg_cursor, insert_query, data_to_insert)
        pg_conn.commit()
        print(f"     └─ ✅ Successfully migrated {len(rows)} rows.")
    except Exception as e:
        pg_conn.rollback()
        print(f"     └─ ❌ Error migrating {table_name}: {e}")
    finally:
        pg_cursor.close()

def main():
    print("==================================================")
    print(" ☁️  Migrating Local Data to Neon PostgreSQL")
    print("==================================================")
    
    try:
        sqlite_conn = get_sqlite_connection()
        pg_conn = get_pg_connection()
    except Exception as e:
        print(f"Connection Error: {e}")
        return

    # Definition of user-data tables and their exact columns
    tables_to_migrate = {
        "study_logs": ["theme", "duration_seconds", "session_type", "created_at"],
        "theme_notes": ["theme", "content", "updated_at"],
        "course_summaries": ["resource_id", "content", "created_at"],
        "qcm_history": ["resource_id", "score", "total", "difficulty", "time_spent_sec", "created_at"]
    }

    for table, columns in tables_to_migrate.items():
        migrate_table(sqlite_conn, pg_conn, table, columns)

    sqlite_conn.close()
    pg_conn.close()
    print("==================================================")
    print(" 🎉 Migration Complete!")
    print("==================================================")

if __name__ == "__main__":
    main()
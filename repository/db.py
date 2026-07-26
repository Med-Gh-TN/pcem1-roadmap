"""
@file repository/db.py
@description Centralized PostgreSQL Connection Manager and Schema Initializer.
@layer State Persistence
@dependencies psycopg2, os, dotenv
"""

import os
import psycopg2
from psycopg2.extras import RealDictConnection
from dotenv import load_dotenv

# Load local environment variables if running locally
load_dotenv()

def get_db():
    """ Returns an active connection to the PostgreSQL database. """
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise ValueError("🚨 DATABASE_URL environment variable is missing. Add it to .env or your Render dashboard.")
    
    # RealDictConnection makes rows behave like dictionaries (matching sqlite3.Row)
    conn = psycopg2.connect(db_url, connection_factory=RealDictConnection)
    return conn

def init_all_schemas():
    """ Initializes all application schemas (Core & Gamification Extensions) for PostgreSQL. """
    conn = get_db()
    cursor = conn.cursor()
    
    # Core Resources Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS resources (
            id SERIAL PRIMARY KEY, 
            semester TEXT NOT NULL,
            theme TEXT NOT NULL, 
            section TEXT NOT NULL, 
            subject TEXT DEFAULT 'Général',
            doc_type TEXT DEFAULT 'Cours',
            filename TEXT NOT NULL, 
            relative_path TEXT UNIQUE NOT NULL, 
            file_type TEXT,
            is_high_yield INTEGER DEFAULT 1, 
            is_annale INTEGER DEFAULT 0, 
            status TEXT DEFAULT 'not_started', 
            notes TEXT DEFAULT '', 
            file_size INTEGER DEFAULT 0,
            curriculum_weight REAL DEFAULT 1.0,
            entropy_score REAL DEFAULT 0.0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    ''')
    
    # Gamification: Study Logs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS study_logs (
            id SERIAL PRIMARY KEY,
            theme TEXT NOT NULL,
            duration_seconds INTEGER NOT NULL,
            session_type TEXT DEFAULT 'pomodoro',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Feature: Personal Notes
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS theme_notes (
            id SERIAL PRIMARY KEY,
            theme TEXT UNIQUE NOT NULL,
            content TEXT DEFAULT '',
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # AI Feature: HTML Summary Cache
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS course_summaries (
            id SERIAL PRIMARY KEY,
            resource_id INTEGER UNIQUE NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Gamification: QCM History
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS qcm_history (
            id SERIAL PRIMARY KEY,
            resource_id INTEGER NOT NULL,
            score INTEGER NOT NULL,
            total INTEGER NOT NULL,
            difficulty TEXT NOT NULL,
            time_spent_sec INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
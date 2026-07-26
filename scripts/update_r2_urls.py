# @file scripts/force_r2_urls.py
# @description Overwrites all resource paths in Neon DB with direct Cloudflare R2 CDN URLs.
# @layer State Persistence
# @dependencies psycopg2, os, dotenv

import os
import psycopg2
from dotenv import load_dotenv

# Load local .env credentials
load_dotenv()

def main():
    db_url = os.environ.get("DATABASE_URL")
    r2_base = "https://pub-e5182687d5224948b616fa86549c708a.r2.dev/PCEM1 2024"

    if not db_url:
        print("🚨 Error: DATABASE_URL is missing from .env")
        return

    print("==================================================")
    print(" ☁️  FORCING NEON DB TO USE CLOUDFLARE R2 CDN URLS")
    print("==================================================")
    print(f"[🌐] Target CDN Base: {r2_base}")
    print("[🔄] Connecting to Neon PostgreSQL...")

    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()

        # 1. Clean up any existing http prefix to get raw path (e.g. Semestre_1/...)
        cursor.execute("""
            UPDATE resources 
            SET relative_path = SUBSTRING(relative_path FROM 'Semestre_.*')
            WHERE relative_path LIKE 'http%%';
        """)

        # 2. Prepend exact Cloudflare R2 domain and folder prefix
        cursor.execute("""
            UPDATE resources 
            SET relative_path = %s || '/' || relative_path
            WHERE relative_path NOT LIKE 'http%%';
        """, (r2_base,))

        updated_count = cursor.rowcount
        conn.commit()
        conn.close()

        print("==================================================")
        print(f" ✅ SUCCESS! Converted {updated_count} rows in Neon DB to Cloudflare R2 CDN URLs.")
        print("==================================================")

    except Exception as e:
        print(f"❌ Error updating Neon DB: {e}")

if __name__ == "__main__":
    main()
# @file scripts/fix_r2_paths.py
# @description One-time utility to adjust Cloudflare R2 CDN URLs in Neon DB to include the 'PCEM1 2024' directory prefix.
# @layer State Persistence
# @dependencies psycopg2, os, dotenv

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

def main():
    db_url = os.environ.get("DATABASE_URL")
    r2_url = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")

    if not db_url or not r2_url:
        print("🚨 Error: DATABASE_URL or R2_PUBLIC_URL missing from .env")
        return

    print(f"[🌐] Target CDN Base: {r2_url}")
    print("[🔄] Injecting 'PCEM1 2024/' prefix into database resource paths...")

    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()

        # Safely insert 'PCEM1 2024/' into R2 URLs if not already present
        cursor.execute("""
            UPDATE resources 
            SET relative_path = REPLACE(relative_path, %s, %s)
            WHERE relative_path LIKE %s AND relative_path NOT LIKE %s;
        """, (
            r2_url + "/", 
            r2_url + "/PCEM1 2024/", 
            r2_url + "%", 
            r2_url + "/PCEM1 2024/%"
        ))

        updated_count = cursor.rowcount
        conn.commit()
        conn.close()

        print("==================================================")
        print(f" ✅ Success! Corrected {updated_count} resource paths in Neon PostgreSQL.")
        print("==================================================")

    except Exception as e:
        print(f"❌ Error updating database: {e}")

if __name__ == "__main__":
    main()
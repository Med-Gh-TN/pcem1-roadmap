# @file scripts/update_r2_urls.py
# @description Updates resource relative_path entries in Neon DB to point to Cloudflare R2 public CDN URLs.
# @layer State Persistence
# @dependencies psycopg2, os, dotenv

import os
import psycopg2
from dotenv import load_dotenv

# Ensure local .env file is loaded
load_dotenv()

def main():
    r2_url = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
    if not r2_url:
        print("🚨 Error: R2_PUBLIC_URL missing from .env")
        print("   Please add: R2_PUBLIC_URL=\"https://pub-e5182687d5224948b616fa86549c708a.r2.dev\" to your .env file.")
        return

    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("🚨 Error: DATABASE_URL missing from .env")
        return

    print(f"[🌐] Target R2 CDN Base Endpoint: {r2_url}")
    print("[🔄] Connecting to Neon PostgreSQL and updating resource paths...")

    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()

        # Update all relative paths to full R2 HTTPS URLs (idempotent: skips if already starting with http)
        cursor.execute("""
            UPDATE resources 
            SET relative_path = %s || '/' || relative_path 
            WHERE relative_path NOT LIKE 'http%%';
        """, (r2_url,))

        updated_count = cursor.rowcount
        conn.commit()
        conn.close()

        print("==================================================")
        print(f" ✅ Success! Updated {updated_count} resource paths to Cloudflare R2 CDN URLs.")
        print("==================================================")

    except Exception as e:
        print(f"❌ Error updating database: {e}")

if __name__ == "__main__":
    main()
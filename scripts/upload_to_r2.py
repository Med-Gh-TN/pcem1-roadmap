# @file scripts/upload_to_r2.py
# @description Bulk uploads all files from local source/ folder to Cloudflare R2 bucket via S3 API.
# @layer Infrastructure
# @dependencies boto3, os, dotenv, pathlib

import os
import boto3
from pathlib import Path
from dotenv import load_dotenv

# Load credentials from .env
load_dotenv()

ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID")
ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "pcem1-assets")

def main():
    print("==================================================")
    print(" ☁️ Cloudflare R2 Automated Bulk Uploader")
    print("==================================================")

    if not all([ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY]):
        print("🚨 Error: Missing R2 API credentials in .env file.")
        print("   Please ensure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are set.")
        return

    # Cloudflare R2 S3 Endpoint
    endpoint_url = f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"

    print(f"[🔌] Connecting to Cloudflare R2 Bucket: '{BUCKET_NAME}'...")
    s3_client = boto3.client(
        service_name="s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=ACCESS_KEY_ID,
        aws_secret_access_key=SECRET_ACCESS_KEY,
        region_name="auto"
    )

    base_dir = Path(__file__).parent.parent.resolve()
    source_dir = base_dir / "source"

    if not source_dir.exists():
        print(f"🚨 Error: Local 'source/' directory not found at {source_dir}")
        return

    # Find all files recursively inside source/
    all_files = [f for f in source_dir.rglob("*") if f.is_file()]
    print(f"[📦] Found {len(all_files)} files in local 'source/' folder.")
    print("[🚀] Starting upload sequence...\n")

    uploaded_count = 0
    error_count = 0

    for idx, file_path in enumerate(all_files, start=1):
        # Determine relative object path inside the bucket
        relative_object_path = str(file_path.relative_to(source_dir))
        
        try:
            print(f"[{idx}/{len(all_files)}] Uploading: {relative_object_path}")
            s3_client.upload_file(
                Filename=str(file_path),
                Bucket=BUCKET_NAME,
                Key=relative_object_path
            )
            uploaded_count += 1
        except Exception as e:
            print(f"   ❌ Failed to upload {relative_object_path}: {e}")
            error_count += 1

    print("\n==================================================")
    print(f" 🎉 Bulk Upload Complete!")
    print(f" ✅ Successfully uploaded: {uploaded_count} files")
    if error_count > 0:
        print(f" ⚠️ Failed uploads: {error_count} files")
    print("==================================================")

if __name__ == "__main__":
    main()
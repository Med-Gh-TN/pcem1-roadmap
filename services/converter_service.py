'''
@file services/converter_service.py
@description Converts Office documents to PDF using LibreOffice and structurally validates them using PyMuPDF (fitz).
@layer Core Logic / Side Effect
'''

import os
import shutil
import subprocess
import hashlib
import logging
from pathlib import Path

# SOTA Sémantique Validation
try:
    import fitz  # PyMuPDF
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False

# ==========================================
# CACHE CONFIGURATION
# ==========================================
SERVICES_DIR = Path(__file__).parent.resolve()
APP_DIR = SERVICES_DIR.parent.resolve()
PDF_CACHE_DIR = APP_DIR / ".pdf_cache"

def get_converter_binary() -> tuple[str, str]:
    """Detects LibreOffice binary. STRICTLY EXCLUDES OnlyOffice to prevent GUI freezing."""
    for cmd in ['libreoffice', 'soffice', 'openoffice', 'soffice.exe', 'libreoffice.exe']:
        p = shutil.which(cmd)
        if not p and os.name == 'nt':
            win_paths = [
                r"C:\Program Files\LibreOffice\program\soffice.exe",
                r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"
            ]
            for wp in win_paths:
                if os.path.exists(wp):
                    return ("libreoffice", wp)
        if p: 
            return ("libreoffice", p)
            
    return (None, None)

def is_structurally_valid_pdf(pdf_path: Path) -> bool:
    """
    Uses PyMuPDF to mathematically verify the PDF is not corrupted.
    If PyMuPDF is not installed, falls back to basic byte-mass validation.
    """
    if not pdf_path.exists():
        return False
        
    if HAS_FITZ:
        try:
            doc = fitz.open(str(pdf_path))
            if doc.page_count > 0:
                doc.close()
                return True
            doc.close()
            return False
        except Exception:
            return False
    else:
        # Fallback if fitz is somehow missing
        return pdf_path.stat().st_size > 5120

def convert_document_to_pdf(input_path_str: str) -> dict:
    """
    Converts an office document to PDF. 
    Checks cache first, invokes headless binary if missing, and validates integrity.
    """
    input_path = Path(input_path_str)
    if not input_path.exists():
        return {"success": False, "error": "Fichier source introuvable sur le disque."}

    # Ensure cache directory exists
    PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    
    # Generate stable, collision-free cache filename using MD5 of the absolute path
    stable_hash = hashlib.md5(str(input_path.resolve()).encode('utf-8')).hexdigest()[:8]
    safe_name = f"{input_path.stem}_{stable_hash}.pdf"
    cached_pdf_path = PDF_CACHE_DIR / safe_name

    # 1. Cache HIT: Return immediately if file exists, is newer than source, AND is structurally sound
    if cached_pdf_path.exists():
        if cached_pdf_path.stat().st_mtime >= input_path.stat().st_mtime:
            if is_structurally_valid_pdf(cached_pdf_path):
                return {
                    "success": True, 
                    "cached_filename": safe_name, 
                    "is_cached": True
                }
            else:
                logging.warning(f"Corrupted cache detected for {safe_name}. Rebuilding...")
                cached_pdf_path.unlink()

    # 2. Cache MISS: Find converter
    engine_type, exe_path = get_converter_binary()
    if not engine_type:
        return {
            "success": False, 
            "error": "LibreOffice n'est pas installé. Veuillez installer LibreOffice pour la conversion PDF hors-ligne."
        }

    # 3. Execute Conversion
    try:
        logging.info(f"Starting PDF conversion for {input_path.name} using {engine_type}...")
        
        cmd = [
            exe_path,
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', str(PDF_CACHE_DIR),
            str(input_path)
        ]
        
        # Execute with a 60s timeout to prevent zombie processes
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        
        # LibreOffice outputs as "OriginalName.pdf" in the output directory.
        default_out_pdf = PDF_CACHE_DIR / f"{input_path.stem}.pdf"
        
        if default_out_pdf.exists():
            if cached_pdf_path.exists():
                cached_pdf_path.unlink()  # Remove old version if exists
            default_out_pdf.rename(cached_pdf_path)

        # 4. Verify Output Structural Integrity
        if is_structurally_valid_pdf(cached_pdf_path):
            return {
                "success": True, 
                "cached_filename": safe_name, 
                "is_cached": False
            }
        else:
            if cached_pdf_path.exists():
                cached_pdf_path.unlink() # Destroy corrupt output to prevent cache poisoning
            return {
                "success": False, 
                "error": "La conversion a échoué. Le fichier généré est corrompu ou illisible."
            }

    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Délai dépassé (Timeout). Le fichier est trop lourd ou bloqué."}
    except Exception as e:
        logging.error(f"Conversion error: {str(e)}")
        return {"success": False, "error": f"Erreur système: {str(e)}"}
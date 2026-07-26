"""
 * @file organizer.py
 * @description State-of-the-Art (SOTA) Ontology-Driven Inference Engine & Curriculum Crawler.
 * @layer Core Logic / Data Ingestion
"""

import os
import sys
import re
import time
import shutil
import subprocess
import unicodedata
from pathlib import Path
from collections import Counter
from typing import Dict, Any

# 🐛 BUG FIX: Dynamically inject the Project Root into Python's path 
# so this script can be executed standalone from the terminal.
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Now we can safely import from the repository layer
from repository import roadmap_repo

# ==========================================
# PATH & HYPER-PARAMETER CONFIGURATION
# ==========================================
SERVICES_DIR = Path(__file__).parent.resolve()
APP_DIR = SERVICES_DIR.parent.resolve()

PRIMARY_SOURCE = APP_DIR / "source" / "PCEM1 2024"
SECONDARY_SOURCE = APP_DIR / "PCEM1 2024"
SOURCE_DIR = PRIMARY_SOURCE if PRIMARY_SOURCE.exists() else SECONDARY_SOURCE

# EXCLUSION RULES
JUNK_PATTERNS = {'.ds_store', 'thumbs.db', 'desktop.ini', 'icon\r'}
JUNK_PREFIXES = ('.', '~', '__macosx')

# TRANSMUTATION HYPER-PARAMETERS
LEGACY_FORMATS = {
    '.ppt', '.pptx', '.ppsx', '.ppsm', 
    '.doc', '.docx', '.dot', '.rtf', '.odt',
    '.xls', '.xlsx', '.csv'
}
MIN_PDF_MASS_BYTES = 5120  # 5KB absolute minimum size for a valid PDF
CONVERSION_TIMEOUT_SEC = 120 # Fault tolerance max execution time

# ==========================================
# SOTA CURRICULUM ONTOLOGY & MATHEMATICAL WEIGHTS
# ==========================================
# Mapped exactly to FMT PCEM1 Curriculum requirements
CURRICULUM_MATRIX = {
    "THEME 1: SANTE, POPULATION & SH": {"coeff": 20, "session": "Janvier", "hours": 30, "subjects": {"Formation médicale": 6, "Santé population": 6, "Ethique médicale": 6, "Histoire de la médecine": 2, "Sciences humaines": 6, "Communication": 4}},
    "THEME 2A: LA CELLULE (Biologie)": {"coeff": 30, "session": "Janvier", "hours": 40, "subjects": {"Biologie cellulaire": 32, "Biochimie structurale": 8}},
    "THEME 2B: LA CELLULE (Biochimie)": {"coeff": 30, "session": "Juin", "hours": 40, "subjects": {"Biochimie structurale": 14, "Biochimie métabolique": 26}},
    "THEME 3: ANATOMIE & TISSUS": {"coeff": 30, "session": "Janvier", "hours": 36, "subjects": {"Histo-embryologie": 26, "Anatomie": 10}},
    "THEME 4: IMAGERIE MEDICALE": {"coeff": 30, "session": "Janvier", "hours": 44, "subjects": {"Biophysique": 44}},
    "THEME 5A: APPAREIL LOCOMOTEUR (Membre Sup)": {"coeff": 30, "session": "Janvier", "hours": 37, "subjects": {"Anatomie": 20, "Histologie-Embryologie": 6, "Biophysique": 11}},
    "THEME 5B: APPAREIL LOCOMOTEUR (Membre Inf)": {"coeff": 30, "session": "Juin", "hours": 37, "subjects": {"Anatomie": 24, "Histologie-Embryologie": 6, "Biochimie": 4, "Physiologie": 4}},
    "THEME 6: MILIEU INTERIEUR & SANG": {"coeff": 40, "session": "Juin", "hours": 62, "subjects": {"Biochimie": 20, "Histologie-Embryologie": 6, "Biophysique": 30, "Hématologie Biologique": 6}},
    "THEME 7: FACTEURS DE MORBIDITE": {"coeff": 20, "session": "Janvier", "hours": 31, "subjects": {"Bactériologie, Virologie & Parasitologie": 16, "Nutrition, Réanimation & Psychiatrie": 7, "Médecine Préventive": 8}},
    "THEME 8: LA RESPIRATION": {"coeff": 40, "session": "Juin", "hours": 46, "subjects": {"Anatomie": 10, "Histologie-Embryologie": 6, "Physiologie": 24, "Biochimie": 6}},
    "THEME 9: APPAREIL CARDIO-VASCULAIRE": {"coeff": 40, "session": "Juin", "hours": 50, "subjects": {"Anatomie": 12, "Biophysique": 12, "Embryologie": 6, "Histologie": 6, "Physiologie": 14}},
    "SECOURISME": {"coeff": 20, "session": "Juin", "hours": 24, "subjects": {"Secourisme": 24}},
    "INFORMATIQUE MEDICALE": {"coeff": 20, "session": "Avril", "hours": 24, "subjects": {"Informatique": 24}},
    "ANGLAIS MEDICAL": {"coeff": 20, "session": "Juin", "hours": 26, "subjects": {"Anglais": 26}},
}

# ==========================================
# UTILITIES & BINARY DETECTION
# ==========================================
def normalize_for_inference(text: str) -> str:
    """Removes accents, underscores, and special chars strictly for regex matching."""
    if not text: return ""
    text = text.replace('_', ' ').replace('-', ' ')
    nfkd_form = unicodedata.normalize('NFKD', text)
    ascii_text = ''.join([c for c in nfkd_form if not unicodedata.combining(c)])
    return ascii_text.lower()

def normalize_slug(text: str, is_file: bool = False) -> str:
    if not text: return ""
    cleaned = text.replace('\012', '').replace('\r', '').replace('\n', '')
    ext = ""
    name_part = cleaned
    if is_file:
        p = Path(cleaned)
        ext = p.suffix.lower()
        name_part = p.stem
    nfkd_form = unicodedata.normalize('NFKD', name_part)
    ascii_text = ''.join([c for c in nfkd_form if not unicodedata.combining(c)])
    ascii_text = re.sub(r"['\"`’“”()[\]{}]", '_', ascii_text)
    ascii_text = re.sub(r'[^a-zA-Z0-9\-]', '_', ascii_text)
    ascii_text = re.sub(r'_+', '_', ascii_text)
    ascii_text = re.sub(r'-+', '-', ascii_text).strip('_ -')
    if not ascii_text: ascii_text = "unnamed_resource"
    if is_file and ext: return f"{ascii_text}{ext}"
    return ascii_text

def get_converter_binary() -> tuple[str, str]:
    """Detects LibreOffice binary for transmutation."""
    for cmd in ['libreoffice', 'soffice', 'openoffice', 'soffice.exe', 'libreoffice.exe']:
        p = shutil.which(cmd)
        if not p and os.name == 'nt':
            win_paths = [r"C:\Program Files\LibreOffice\program\soffice.exe", r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"]
            for wp in win_paths:
                if os.path.exists(wp): return ("libreoffice", wp)
        if p: return ("libreoffice", p)
    return (None, None)

# ==========================================
# SOTA TAXONOMY INFERENCE ENGINE
# ==========================================
def infer_taxonomy(rel_path_str: str, raw_filename: str) -> Dict[str, Any]:
    clean_path = normalize_for_inference(rel_path_str)
    clean_file = normalize_for_inference(raw_filename)
    
    theme_key = "Généralités"
    if 'th 1' in clean_path or 'theme 1' in clean_path: theme_key = "THEME 1: SANTE, POPULATION & SH"
    elif 'th 2a' in clean_path or 'theme 2a' in clean_path: theme_key = "THEME 2A: LA CELLULE (Biologie)"
    elif 'th 2b' in clean_path or 'theme 2b' in clean_path or 'theme 2' in clean_path: theme_key = "THEME 2B: LA CELLULE (Biochimie)"
    elif 'th 3' in clean_path or 'theme 3' in clean_path: theme_key = "THEME 3: ANATOMIE & TISSUS"
    elif 'th 4' in clean_path or 'theme 4' in clean_path: theme_key = "THEME 4: IMAGERIE MEDICALE"
    elif 'th 5a' in clean_path or 'theme 5a' in clean_path: theme_key = "THEME 5A: APPAREIL LOCOMOTEUR (Membre Sup)"
    elif 'th 5b' in clean_path or 'theme 5b' in clean_path or 'theme 5' in clean_path: theme_key = "THEME 5B: APPAREIL LOCOMOTEUR (Membre Inf)"
    elif 'th 6' in clean_path or 'theme 6' in clean_path: theme_key = "THEME 6: MILIEU INTERIEUR & SANG"
    elif 'th 7' in clean_path or 'theme 7' in clean_path: theme_key = "THEME 7: FACTEURS DE MORBIDITE"
    elif 'th 8' in clean_path or 'theme 8' in clean_path: theme_key = "THEME 8: LA RESPIRATION"
    elif 'th 9' in clean_path or 'theme 9' in clean_path: theme_key = "THEME 9: APPAREIL CARDIO-VASCULAIRE"
    elif 'secourisme' in clean_path: theme_key = "SECOURISME"
    elif 'informatique' in clean_path: theme_key = "INFORMATIQUE MEDICALE"
    elif 'anglais' in clean_path: theme_key = "ANGLAIS MEDICAL"

    curriculum_data = CURRICULUM_MATRIX.get(theme_key, {})
    semester = "Semestre 1"
    if curriculum_data and curriculum_data['session'] in ["Juin", "Avril"]:
        semester = "Semestre 2"

    subject = "Général"
    valid_subjects = curriculum_data.get('subjects', {})
    
    for subj_name in valid_subjects.keys():
        if normalize_for_inference(subj_name) in clean_path:
            subject = subj_name
            break
            
    if subject == "Général":
        if 'anatomie' in clean_path or 'anat' in clean_path: subject = "Anatomie"
        elif 'biochimie' in clean_path or 'metabolisme' in clean_path: subject = "Biochimie"
        elif 'biophysique' in clean_path or 'bp' in clean_path: subject = "Biophysique"
        elif 'physio' in clean_path: subject = "Physiologie"
        elif 'histo' in clean_path or 'tissu' in clean_path: subject = "Histologie-Embryologie"
        elif 'embryo' in clean_path: subject = "Embryologie"
        elif 'poly' in clean_file: subject = "Polycopié Officiel"

    doc_type = "Cours"
    section = "Diapos"
    
    if any(k in clean_path for k in ['enregistrement', 'video', 'mp4']):
        section = "Enregistrements"
        doc_type = "Video"
    elif any(k in clean_path for k in ['session', 'epreuve', 'examen', 'qcm', 'annale', 'controle']):
        section = "Sessions"
        doc_type = "Examen/QCM"
    elif 'tp ' in clean_path or '_tp' in clean_path or 'pratique' in clean_path:
        section = "TP"
        doc_type = "TP"
    elif 'td ' in clean_path or 'td_' in clean_path or 'exercice' in clean_path:
        section = "TD"
        doc_type = "TD"
    elif 'resume' in clean_path or 'fiche' in clean_path or 'schema' in clean_path:
        doc_type = "Fiche/Résumé"

    is_annale = 1 if doc_type == "Examen/QCM" else 0
    is_high_yield = 1
    
    if any(st in clean_path for st in ['liens utiles', 'atlas', 'netter', 'book']):
        is_high_yield = 0
        doc_type = "Extra/Livre"
        
    weight = 1.0
    entropy = 0.5
    if curriculum_data and subject in valid_subjects:
        theme_coeff = curriculum_data["coeff"]
        theme_hours = curriculum_data["hours"]
        subj_hours = valid_subjects[subject]
        weight = theme_coeff * (subj_hours / theme_hours)
    elif subject == "Polycopié Officiel":
        weight = curriculum_data.get("coeff", 10) 
        
    if doc_type == "Fiche/Résumé": entropy = 0.9  
    elif doc_type == "Examen/QCM": entropy = 1.0  
    elif doc_type == "Extra/Livre": entropy = 0.1 

    return {
        "semester": semester, 
        "theme": theme_key, 
        "section": section, 
        "subject": subject,
        "doc_type": doc_type,
        "is_high_yield": is_high_yield, 
        "is_annale": is_annale, 
        "curriculum_weight": round(weight, 2),
        "entropy_score": round(entropy, 2)
    }

# ==========================================
# PHASE 2: TRANSMUTATION ENGINE
# ==========================================
def transmute_legacy_files(files_to_convert: list) -> dict:
    engine, exe_path = get_converter_binary()
    if not engine:
        print("⚠️ [WARNING] Transmutation aborted. LibreOffice not found on host OS.")
        return {"converted": 0, "failed": len(files_to_convert)}

    metrics = {"converted": 0, "failed": 0, "bytes_freed": 0}
    print(f"\n{'='*60}\n⚙️  [PHASE 2] TRANSMUTATION ENGINE IGNITED\n{'='*60}")

    for file_path in files_to_convert:
        parent_dir = file_path.parent
        target_pdf = parent_dir / f"{file_path.stem}.pdf"
        legacy_size = file_path.stat().st_size

        print(f" ⟲ Converting: {file_path.name}")
        try:
            cmd = [exe_path, '--headless', '--convert-to', 'pdf', '--outdir', str(parent_dir), str(file_path)]
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=CONVERSION_TIMEOUT_SEC)

            if target_pdf.exists() and target_pdf.stat().st_size > MIN_PDF_MASS_BYTES:
                file_path.unlink()
                metrics["converted"] += 1
                metrics["bytes_freed"] += (legacy_size - target_pdf.stat().st_size)
            else:
                if target_pdf.exists(): target_pdf.unlink() 
                metrics["failed"] += 1
        except Exception as e:
            metrics["failed"] += 1
            print(f"   [!] CRITICAL: {str(e)}")
            
    return metrics

# ==========================================
# MASTER PIPELINE (Crawling & DB Sync)
# ==========================================
def execute_curriculum_scan(run_transmutation: bool = False):
    print(f"\n{'='*60}\n🚀 [PHASE 1] DEEP TOPOLOGICAL CRAWL INITIATED\n{'='*60}")
    
    if not SOURCE_DIR.exists():
        print(f"❌ ERROR: Source directory '{SOURCE_DIR}' does not exist.")
        return {"status": "ERROR"}

    start_time = time.time()
    resources = []
    valid_paths = set()
    legacy_files = []
    metrics = {"total_files": 0, "extensions": Counter()}

    for root, dirs, files in os.walk(SOURCE_DIR):
        dirs[:] = [d for d in dirs if not (d.lower() in JUNK_PATTERNS or d.lower().startswith(JUNK_PREFIXES))]
        root_path = Path(root)
        
        for file_name in files:
            if file_name.lower() in JUNK_PATTERNS or file_name.lower().startswith(JUNK_PREFIXES): continue
                
            file_path = root_path / file_name
            file_type = file_path.suffix.lower()
            file_size = file_path.stat().st_size if file_path.exists() else 0
            
            if file_size == 0: continue 
            if file_type in LEGACY_FORMATS: legacy_files.append(file_path)

            try: rel_path = str(file_path.relative_to(SOURCE_DIR)).replace('\\', '/')
            except ValueError: continue
                
            tax = infer_taxonomy(rel_path, file_name)
            clean_ext = file_type.replace('.', '')
            valid_paths.add(rel_path)
            metrics["total_files"] += 1
            metrics["extensions"][clean_ext] += 1
            
            resources.append((
                tax['semester'], tax['theme'], tax['section'], tax['subject'], tax['doc_type'],
                file_name, rel_path, clean_ext,
                tax['is_high_yield'], tax['is_annale'], file_size, tax['curriculum_weight'], tax['entropy_score']
            ))
            
    print(f"✅ State Snapshot: {metrics['total_files']} files. Found {len(legacy_files)} legacy assets.")

    if run_transmutation and len(legacy_files) > 0:
        if transmute_legacy_files(legacy_files)["converted"] > 0:
            print("🔄 Triggering recursive re-scan to map newly transmuted assets...")
            return execute_curriculum_scan(run_transmutation=False)

    print(f"\n🚀 [PHASE 3] DATABASE RECONCILIATION VIA REPOSITORY")
    # Delegate direct DB interaction to Repository
    deleted_count = roadmap_repo.sync_scanned_resources(resources, valid_paths)
    
    elapsed = round(time.time() - start_time, 2)
    print(f"✅ Indexed {len(resources)} items. Pruned {deleted_count} ghost records.")
    return {"status": "SUCCESS", "total_indexed": len(resources), "pruned": deleted_count}

if __name__ == "__main__":
    execute_curriculum_scan(run_transmutation=True)
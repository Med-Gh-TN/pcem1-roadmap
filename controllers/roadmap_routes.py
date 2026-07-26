'''
@file controllers/roadmap_routes.py
@description Routes for curriculum mapping, search, file serving, and progress tracking.
@layer HTTP Controllers
'''

from flask import Blueprint, jsonify, request, Response, send_from_directory
from repository import roadmap_repo
from services.organizer import SOURCE_DIR, normalize_slug

# 🐛 BUG FIX: Pointing to the new 'converter_service.py' filename
from services.converter_service import convert_document_to_pdf, PDF_CACHE_DIR

from urllib.parse import unquote
from pathlib import Path
from datetime import datetime
import mimetypes
import os

roadmap_bp = Blueprint('roadmap', __name__)
VALID_STATUSES = {'not_started', 'in_progress', 'completed', 'mastered', 'needs_revision'}

@roadmap_bp.route('/api/roadmap', methods=['GET'])
def get_roadmap():
    rows = roadmap_repo.get_all_resources()
    roadmap = {}
    total_items = len(rows)
    completed_items = in_progress_items = needs_revision_items = 0
    high_yield_count = annales_count = 0
    total_weighted_points = completed_weighted_points = 0.0

    for item in rows:
        status = item.get('status', 'not_started')
        true_impact = float(item.get('curriculum_weight', 1.0)) * float(item.get('entropy_score', 0.5))
        total_weighted_points += true_impact

        if status in ('completed', 'mastered'):
            completed_items += 1
            completed_weighted_points += true_impact
        elif status == 'in_progress':
            in_progress_items += 1
            completed_weighted_points += (true_impact * 0.4)
        elif status == 'needs_revision':
            needs_revision_items += 1

        if item.get('is_high_yield') == 1: high_yield_count += 1
        if item.get('is_annale') == 1: annales_count += 1

        sem, thm, sec = item['semester'], item['theme'], item['section']
        if sem not in roadmap: roadmap[sem] = {}
        if thm not in roadmap[sem]: roadmap[sem][thm] = {}
        if sec not in roadmap[sem][thm]: roadmap[sem][thm][sec] = []
        roadmap[sem][thm][sec].append(item)

    not_started = total_items - (completed_items + in_progress_items + needs_revision_items)
    pct = round((completed_items / total_items * 100), 1) if total_items > 0 else 0
    w_pct = round((completed_weighted_points / total_weighted_points * 100), 1) if total_weighted_points > 0 else 0

    return jsonify({
        "stats": {
            "total": total_items, "completed": completed_items, "in_progress": in_progress_items,
            "needs_revision": needs_revision_items, "not_started": max(0, not_started),
            "percentage": pct, "weighted_percentage": w_pct, "high_yield_count": high_yield_count,
            "annales_count": annales_count, "true_impact_total": round(total_weighted_points, 2)
        },
        "data": roadmap
    })

@roadmap_bp.route('/api/export/revision-list', methods=['GET'])
def export_revision_list():
    rows = roadmap_repo.get_revision_list()
    now_str = datetime.now().strftime('%Y-%m-%d %H:%M')
    md_lines = [f"# 🔄 PCEM1 Medical Revision List & Exam Summary\n*Generated on {now_str}*\n**Total Topics Needing Revision:** {len(rows)}\n---\n"]

    if not rows:
        md_lines.append("🎉 **Félicitations!** Aucune matière n'est actuellement marquée comme `À réviser`.\n")
    else:
        current_theme = None
        for r in rows:
            if r['theme'] != current_theme:
                current_theme = r['theme']
                md_lines.append(f"\n## 📚 Thème: {current_theme}")
                if r['theme_note']: md_lines.append(f"> **Notes de Cours:** {r['theme_note']}\n")

            flags = f"[{r['doc_type']}] [{'🌟 HIGH-YIELD' if r['is_high_yield'] else '📚 Extra'}] {'📑 EXAM' if r['is_annale'] else ''}".strip()
            md_lines.append(f"- [ ] **{r['filename']}** ({r['subject']}) {flags}")
            if r['notes']: md_lines.append(f"  - *Remarques:* {r['notes']}")

    return Response("\n".join(md_lines), mimetype='text/markdown', headers={'Content-Disposition': 'attachment; filename="PCEM1_Revision_Summary.md"'})

@roadmap_bp.route('/api/search', methods=['GET'])
def search_resources():
    query = request.args.get('q', '').strip()
    subject = request.args.get('subject', '').strip()
    high_yield = request.args.get('high_yield', '')
    annales = request.args.get('annales', '')
    results = roadmap_repo.search_resources(query, subject, high_yield, annales)
    return jsonify({"count": len(results), "results": results})

@roadmap_bp.route('/api/progress', methods=['POST'])
def update_progress():
    data = request.get_json(silent=True) or {}
    resource_id, status, notes = data.get('id'), data.get('status'), data.get('notes', '')
    if not resource_id or status not in VALID_STATUSES:
        return jsonify({"error": "Invalid input."}), 400
    roadmap_repo.update_resource_progress(resource_id, status, notes)
    return jsonify({"success": True, "id": resource_id, "status": status})

@roadmap_bp.route('/api/exam-countdown', methods=['GET'])
def get_exam_countdown():
    return jsonify({"sessions": [{"id": "janvier", "name": "Session Principale - Janvier", "target_date": "2027-01-12T08:00:00Z"}, {"id": "mai", "name": "Session Principale - Mai", "target_date": "2027-05-18T08:00:00Z"}]})

@roadmap_bp.route('/api/resource/preview-meta/<int:resource_id>', methods=['GET'])
def get_resource_preview_meta(resource_id):
    item = roadmap_repo.get_resource_by_id(resource_id)
    if not item: return jsonify({"error": "Resource not found"}), 404

    file_ext = (item.get('file_type') or '').lower().replace('.', '')
    if file_ext in ['pdf']: viewer_type = 'pdf'
    elif file_ext in ['pptx', 'ppt', 'ppsx', 'ppsm', 'docx', 'doc', 'xlsx', 'xls', 'odt', 'rtf']: viewer_type = 'office'
    elif file_ext in ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp']: viewer_type = 'image'
    elif file_ext in ['mp4', 'webm', 'ogg', 'mov', 'mkv']: viewer_type = 'video'
    elif file_ext in ['mp3', 'wav', 'm4a', 'flac', 'aac']: viewer_type = 'audio'
    elif file_ext in ['txt', 'md', 'json', 'csv']: viewer_type = 'text'
    else: viewer_type = 'download'

    return jsonify({"id": item['id'], "filename": item['filename'], "relative_path": item['relative_path'], "file_type": file_ext, "viewer_type": viewer_type, "file_url": f"/source/{item['relative_path']}", "file_size": item.get('file_size', 0)})

@roadmap_bp.route('/api/convert/<int:resource_id>', methods=['POST', 'GET'])
def convert_resource_to_pdf(resource_id):
    item = roadmap_repo.get_resource_by_id(resource_id)
    if not item: return jsonify({"success": False, "error": "Document introuvable."}), 404

    decoded_path = unquote(item['relative_path']).strip()
    target_file = SOURCE_DIR / decoded_path
    if not target_file.exists():
        parts = Path(decoded_path).parts
        target_file = SOURCE_DIR / Path(*[normalize_slug(p, is_file=(i == len(parts) - 1)) for i, p in enumerate(parts)])
        
    if not target_file.exists(): return jsonify({"success": False, "error": "Le fichier source n'existe pas."}), 404

    result = convert_document_to_pdf(str(target_file))
    if result.get('success'): return jsonify({"success": True, "cached_url": f"/cache/{result['cached_filename']}", "is_cached": result.get('is_cached', False)})
    return jsonify({"success": False, "error": result.get('error', 'Erreur de conversion')}), 500

@roadmap_bp.route('/cache/<path:filename>')
def serve_cached_pdf(filename):
    PDF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    res = send_from_directory(PDF_CACHE_DIR, filename, as_attachment=False)
    res.headers.update({'Content-Type': 'application/pdf', 'Content-Disposition': f'inline; filename="{os.path.basename(filename)}"', 'Access-Control-Allow-Origin': '*', 'X-Frame-Options': 'SAMEORIGIN'})
    return res

@roadmap_bp.route('/source/<path:filename>')
def serve_source_file(filename):
    decoded_path = unquote(filename).strip()
    target_file = SOURCE_DIR / decoded_path
    if not target_file.exists():
        parts = Path(decoded_path).parts
        decoded_path = str(Path(*[normalize_slug(p, is_file=(i == len(parts) - 1)) for i, p in enumerate(parts)]))

    res = send_from_directory(SOURCE_DIR, decoded_path, as_attachment=False)
    mime_type, _ = mimetypes.guess_type(decoded_path)
    if mime_type: res.headers['Content-Type'] = mime_type
    res.headers.update({'Content-Disposition': f'inline; filename="{os.path.basename(decoded_path)}"', 'Access-Control-Allow-Origin': '*', 'X-Frame-Options': 'SAMEORIGIN'})
    return res
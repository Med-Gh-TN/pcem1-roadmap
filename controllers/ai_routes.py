'''
@file controllers/ai_routes.py
@description Routes for streaming AI features (Quiz, Explain, Summarize) via SSE.
@layer HTTP Controllers
'''

from flask import Blueprint, request, Response, jsonify, json
from services.ai_agent import generate_ai_stream_with_circuit_breaker
from repository import roadmap_repo
from services.organizer import SOURCE_DIR
from urllib.parse import unquote

ai_bp = Blueprint('ai', __name__)

@ai_bp.route('/api/ai/quiz', methods=['GET'])
def stream_ai_quiz():
    topic, subject = request.args.get('topic', '').strip(), request.args.get('subject', '').strip()
    qcm_count, difficulty, option_count = int(request.args.get('count', 10)), request.args.get('difficulty', 'Moyen').strip(), int(request.args.get('options', 4))
    
    file_path = None
    if '.' in subject:
        row = roadmap_repo.get_resource_by_filename(subject)
        if row: file_path = str(SOURCE_DIR / unquote(row['relative_path']).strip())
    if not file_path:
        row = roadmap_repo.get_first_resource_by_theme(topic)
        if row: file_path = str(SOURCE_DIR / unquote(row['relative_path']).strip())

    return Response(
        generate_ai_stream_with_circuit_breaker('qcm_generator.jinja', {"topic": topic, "subject": subject, "qcm_count": qcm_count, "difficulty": difficulty, "option_count": option_count, "file_path": file_path}, estimated_duration_sec=max(8, qcm_count * 1.5), parser_type="toon"),
        mimetype='text/event-stream'
    )

@ai_bp.route('/api/ai/explain', methods=['GET'])
def stream_ai_explain():
    term = request.args.get('term', '').strip()
    return Response(generate_ai_stream_with_circuit_breaker('concept_explainer.jinja', {"term": term}, estimated_duration_sec=5, parser_type="toon"), mimetype='text/event-stream')


@ai_bp.route('/api/ai/summarize', methods=['GET'])
def stream_ai_summary():
    resource_id = request.args.get('resource_id', type=int)
    topic, filename = request.args.get('topic', '').strip(), request.args.get('filename', '').strip()
    check_only = request.args.get('check_cache_only', 'false').lower() == 'true'
    
    if not resource_id and filename:
        row = roadmap_repo.get_resource_by_filename(filename)
        if row: resource_id = row['id']

    file_path = None
    if resource_id:
        item = roadmap_repo.get_resource_by_id(resource_id)
        if item: file_path = str(SOURCE_DIR / unquote(item['relative_path']).strip())
        
        # Check SQLite Cache
        cached_content = roadmap_repo.get_summary_cache(resource_id)
        
        # 🐛 BUG FIX: Fast JSON response if we just want to know if a cache exists (Silent pre-load)
        if check_only:
            if cached_content:
                return jsonify({"has_cache": True, "html": cached_content})
            return jsonify({"has_cache": False})

        # Standard SSE Stream behavior if cache exists
        if cached_content:
            def cached_stream():
                yield f"data: {json.dumps({'status': 'PROGRESS', 'message': 'Chargement depuis le cache local...'})}\n\n"
                yield f"data: {json.dumps({'status': 'COMPLETE', 'message': 'Génération chargée (Cache).', 'data': {'html': cached_content}})}\n\n"
            return Response(cached_stream(), mimetype='text/event-stream')

    if check_only:
        return jsonify({"has_cache": False})

    # If no cache, trigger heavy RAG Gemini stream
    def wrapped_generator():
        for chunk in generate_ai_stream_with_circuit_breaker('course_summarizer.jinja', {"topic": topic, "filename": filename, "file_path": file_path}, estimated_duration_sec=18, parser_type="html"):
            if '"status": "COMPLETE"' in chunk and resource_id:
                try:
                    payload = json.loads(chunk.replace('data: ', '').strip())
                    html_content = payload.get('data', {}).get('html', '')
                    if html_content: roadmap_repo.save_summary_cache(resource_id, html_content)
                except Exception as e: print(f"[Error] Failed to save HTML summary cache: {e}")
            yield chunk

    return Response(wrapped_generator(), mimetype='text/event-stream')
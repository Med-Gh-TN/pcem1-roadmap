"""
@file app.py
@description Main Application Factory. Registers Blueprints, initializes global state, and handles Cloudflare CDN routing with URL unquoting.
@layer Application Root
"""

import os
import mimetypes
from urllib.parse import unquote
from flask import Flask, render_template, send_from_directory, redirect

from repository.db import init_all_schemas
from services.organizer import execute_curriculum_scan, APP_DIR
from dotenv import load_dotenv

# Import Modular Blueprints
from controllers.roadmap_routes import roadmap_bp
from controllers.gamification_routes import gamification_bp
from controllers.ai_routes import ai_bp
from controllers.tuto_routes import tuto_bp, sock

load_dotenv(os.path.join(APP_DIR, '.env'))

app = Flask(__name__, template_folder='templates', static_folder='static')

# Initialize WebSocket Extension
sock.init_app(app)

# Explicit MIME type registration
mimetypes.add_type('application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx')
mimetypes.add_type('application/vnd.ms-powerpoint', '.ppt')
mimetypes.add_type('application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx')
mimetypes.add_type('application/msword', '.doc')
mimetypes.add_type('application/pdf', '.pdf')
mimetypes.add_type('video/mp4', '.mp4')
mimetypes.add_type('audio/mpeg', '.mp3')

# Register Domains
app.register_blueprint(roadmap_bp)
app.register_blueprint(gamification_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(tuto_bp)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/source/<path:filename>')
def serve_source(filename):
    # Unquote URL encoding like https%3A// or https%3A%2F%2F
    raw_path = unquote(filename)
    
    # Catch any CDN requests and redirect directly to Cloudflare R2
    if 'http://' in raw_path or 'https://' in raw_path:
        target_url = raw_path[raw_path.find('http'):]
        return redirect(target_url)
        
    return send_from_directory(os.path.join(APP_DIR, 'source'), filename)

if __name__ == '__main__':
    print("[⚙️ INIT] Initializing Data Access Layer...")
    init_all_schemas()
    print("[⚙️ INIT] Running background SOTA curriculum scan...")
    execute_curriculum_scan(run_transmutation=False)
    port = int(os.environ.get('PORT', 5000))
    print(f"PCEM1 Medical Roadmap Server running on http://127.0.0.1:{port}")
    app.run(host='127.0.0.1', port=port, debug=True)
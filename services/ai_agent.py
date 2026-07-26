'''
@file services/ai_agent.py
@description AI Engine featuring Jinja prompt rendering, HTML & Dynamic TOON parsing, Gemini Circuit Breaker failover, and Expanded Document Extraction (RAG).
@layer Core Logic / AI Integration
@dependencies google.genai, jinja2, os, sys, json, re, PyMuPDF (fitz)
'''

import os
import re
import json
import time
from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from google import genai
from google.genai import types

# Optional but highly recommended PDF parser
try:
    import fitz  # PyMuPDF
    HAS_FITZ = True
except ImportError:
    HAS_FITZ = False

# Base Paths
SERVICES_DIR = Path(__file__).parent.resolve()
APP_DIR = SERVICES_DIR.parent.resolve()
PROMPTS_DIR = APP_DIR / "prompts"

# Jinja Environment setup
jinja_env = Environment(loader=FileSystemLoader(str(PROMPTS_DIR)))


def extract_document_text(file_path):
    '''
    Extracts raw text from a document (PDF, TXT) safely.
    Caps the extracted text at ~400,000 characters (~80,000 to 100,000 tokens)
    to leverage large model context windows while remaining well below the 250k token limit.
    '''
    if not file_path or not os.path.exists(file_path):
        return ""
        
    text = ""
    try:
        if file_path.lower().endswith('.pdf') and HAS_FITZ:
            doc = fitz.open(file_path)
            for page in doc:
                text += page.get_text() + "\n"
        elif file_path.lower().endswith(('.txt', '.md', '.csv')):
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
        else:
            text = "Le contenu du fichier n'a pas pu être extrait car le format n'est pas supporté ou PyMuPDF n'est pas installé."
    except Exception as e:
        print(f"[AI Extraction Error] {e}")
        text = "Erreur lors de l'extraction du texte."

    # Expanded Token Guardrail: 400,000 characters (~80k–100k tokens)
    return text[:400000]


def parse_toon_to_dict(toon_text):
    '''
    Parses Token-Oriented Object Notation (TOON) text into Python dictionaries.
    Dynamically scans for the header to safely ignore leading <thought_process> blocks.
    '''
    if not toon_text:
        return {"items": []}

    lines = [line.strip() for line in toon_text.strip().splitlines() if line.strip()]
    if not lines:
        return {"items": []}

    header_pattern = r'^([a-zA-Z0-9_]+)\[(\d+)\]\{([^\}]+)\}:$'
    
    # Scan for the start of the TOON block
    start_idx = -1
    for i, line in enumerate(lines):
        if re.match(header_pattern, line):
            start_idx = i
            break

    if start_idx == -1:
        return {"raw_text": toon_text, "items": []}

    header_match = re.match(header_pattern, lines[start_idx])
    collection_name = header_match.group(1)
    keys = [k.strip() for k in header_match.group(3).split(',')]

    items = []
    for row_line in lines[start_idx+1:]:
        # Skip trailing markdown ticks or lingering thought process tags
        if row_line.startswith('```') or row_line.startswith('<') or not row_line:
            continue
            
        parts = [p.strip() for p in row_line.split(',')]
        if len(parts) >= len(keys):
            row_dict = {}
            for i, key in enumerate(keys):
                # The last key (explanation) absorbs all remaining commas
                if i == len(keys) - 1:
                    row_dict[key] = ",".join(parts[i:])
                else:
                    row_dict[key] = parts[i]
            items.append(row_dict)

    return {
        "collection": collection_name,
        "count": len(items),
        "items": items
    }


def extract_html_content(raw_text):
    ''' Safely extracts HTML content from a markdown code block if present. '''
    match = re.search(r'```html\s*(.*?)\s*```', raw_text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return raw_text.strip()


def render_jinja_prompt(template_name, **context):
    ''' Renders a Jinja prompt template with dynamic runtime hyperparameters '''
    template = jinja_env.get_template(template_name)
    return template.render(**context)


def generate_ai_stream_with_circuit_breaker(template_name, prompt_context, estimated_duration_sec=8, parser_type="toon"):
    '''
    Streams progress updates (SSE), executes Gemini API with Circuit Breaker dynamic failover,
    and returns parsed result payloads (TOON or HTML). Handles physical file extraction dynamically.
    '''
    yield f"data: {json.dumps({'status': 'INIT', 'message': 'Initialisation du moteur IA...', 'eta': estimated_duration_sec})}\n\n"
    time.sleep(0.2)
    
    # RAG INJECTION PHASE
    file_path = prompt_context.pop('file_path', None)
    if file_path:
        yield f"data: {json.dumps({'status': 'PROGRESS', 'message': 'Extraction du texte depuis le document PDF...', 'eta': estimated_duration_sec - 1})}\n\n"
        extracted_text = extract_document_text(file_path)
        prompt_context['document_text'] = extracted_text
        if not extracted_text:
            yield f"data: {json.dumps({'status': 'WARNING', 'message': 'Attention: Impossible de lire le texte du document. L IA va improviser.'})}\n\n"

    try:
        rendered_prompt = render_jinja_prompt(template_name, **prompt_context)
    except Exception as e:
        yield f"data: {json.dumps({'status': 'ERROR', 'message': f'Erreur de template Jinja: {str(e)}'})}\n\n"
        return

    yield f"data: {json.dumps({'status': 'PROGRESS', 'message': 'Analyse sémantique en cours...', 'eta': estimated_duration_sec - 3})}\n\n"

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        yield f"data: {json.dumps({'status': 'ERROR', 'message': 'Clé GEMINI_API_KEY absente dans le fichier .env'})}\n\n"
        return

    model_family_raw = os.environ.get("GEMINI_MODELS", "gemma-4-31b-it,gemini-2.5-flash,gemini-2.5-pro")
    models = [m.strip() for m in model_family_raw.split(",") if m.strip()]

    client = genai.Client(api_key=api_key)
    raw_ai_output = ""
    successful_model = None

    for model in models:
        yield f"data: {json.dumps({'status': 'PROGRESS', 'message': f'Génération via {model}...', 'eta': estimated_duration_sec - 4})}\n\n"
        
        try:
            config = types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=8192
            )

            response = client.models.generate_content(
                model=model,
                contents=rendered_prompt,
                config=config
            )

            if response and response.text:
                raw_ai_output = response.text
                successful_model = model
                yield f"data: {json.dumps({'status': 'PROGRESS', 'message': f'Réponse reçue! Formatage du résultat...', 'eta': 1})}\n\n"
                break
        except Exception as err:
            yield f"data: {json.dumps({'status': 'WARNING', 'message': f'Modèle {model} indisponible ({str(err)}). Basculement vers le modèle suivant...'})}\n\n"
            time.sleep(1)

    if not raw_ai_output:
        yield f"data: {json.dumps({'status': 'ERROR', 'message': 'Tous les modèles de la famille Circuit Breaker ont échoué.'})}\n\n"
        return

    if parser_type == "html":
        parsed_data = {"html": extract_html_content(raw_ai_output)}
    else:
        parsed_data = parse_toon_to_dict(raw_ai_output)

    yield f"data: {json.dumps({'status': 'COMPLETE', 'message': 'Génération IA terminée!', 'model_used': successful_model, 'data': parsed_data})}\n\n"
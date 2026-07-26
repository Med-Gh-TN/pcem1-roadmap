"""
@file controllers/tuto_routes.py
@description Dedicated WebSocket controller proxying bidirectional audio/text to the Gemini Live API.
@layer Core Logic / Side Effect
@dependencies flask_sock, google.genai, asyncio, jinja2
"""

import os
import json
import asyncio
from flask import Blueprint, current_app
from flask_sock import Sock
from google import genai
from google.genai import types

from simple_websocket import ConnectionClosed

tuto_bp = Blueprint('tuto_bp', __name__)
sock = Sock()

# Resolve absolute path to the prompts directory regardless of working directory
PROMPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'prompts')

@sock.route('/ws/tuto')
def tuto_websocket(ws):
    """
    Synchronous Flask WebSocket endpoint that spins up an isolated asyncio event 
    loop to handle the Gemini Live SDK streams concurrently.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        ws.send(json.dumps({"type": "error", "text": "Missing GEMINI_API_KEY on server."}))
        return

    # 1. Wait for initial configuration message containing file context from frontend
    try:
        init_msg_raw = ws.receive()
        init_msg = json.loads(init_msg_raw)
        context_data = init_msg.get('context', {})
        
        # Explicitly load prompt template from the prompts/ directory
        prompt_file_path = os.path.join(PROMPTS_DIR, 'tuto_system_prompt.jinja')
        if not os.path.exists(prompt_file_path):
            raise FileNotFoundError(f"Template file missing at path: {prompt_file_path}")

        with open(prompt_file_path, 'r', encoding='utf-8') as f:
            raw_template = f.read()

        # Render the System Prompt securely via Flask's Jinja environment
        rendered_prompt = current_app.jinja_env.from_string(raw_template).render(
            theme=context_data.get('theme', 'Général'),
            filename=context_data.get('filename', 'Document Inconnu'),
            notes=context_data.get('notes', 'Aucune note.')
        )
    except Exception as e:
        print(f"[WS] Initialization or Jinja rendering error: {e}")
        ws.send(json.dumps({"type": "error", "text": f"Jinja Error: {str(e)}"}))
        return

    client = genai.Client(api_key=api_key)
    
    # Wrap context in Gemini Content object
    system_instruction = types.Content(parts=[types.Part.from_text(text=rendered_prompt)])
    
    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Zephyr")
            )
        ),
        system_instruction=system_instruction,
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        context_window_compression=types.ContextWindowCompressionConfig(
            trigger_tokens=104857,
            sliding_window=types.SlidingWindow(target_tokens=52428),
        )
    )
    
    model = "models/gemini-3.1-flash-live-preview"

    async def gemini_session():
        try:
            async with client.aio.live.connect(model=model, config=config) as session:
                print("[WS] Connected to Gemini Live API with Jinja Context.")
                ws.send(json.dumps({"type": "status", "text": "connected"}))
                
                async def gemini_to_browser():
                    try:
                        while True:
                            async for response in session.receive():
                                server_content = response.server_content
                                if server_content is not None:
                                    if server_content.interrupted:
                                        ws.send(json.dumps({"type": "interrupted"}))
                                        continue
                                    
                                    if server_content.model_turn:
                                        for part in server_content.model_turn.parts:
                                            if part.inline_data and part.inline_data.data:
                                                ws.send(part.inline_data.data)
                                    
                                    if server_content.input_transcription:
                                        ws.send(json.dumps({
                                            "type": "transcription",
                                            "speaker": "user",
                                            "text": server_content.input_transcription.text
                                        }))
                                    if server_content.output_transcription:
                                        ws.send(json.dumps({
                                            "type": "transcription",
                                            "speaker": "model",
                                            "text": server_content.output_transcription.text
                                        }))
                    except ConnectionClosed:
                        print("[WS] Browser disconnected during receive.")
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        print(f"[WS] Gemini Rx Error: {e}")

                async def browser_to_gemini():
                    try:
                        while True:
                            message = await asyncio.to_thread(ws.receive)
                            if message is None:
                                break
                            
                            if isinstance(message, bytes):
                                await session.send_realtime_input(
                                    audio=types.Blob(data=message, mime_type="audio/pcm;rate=16000")
                                )
                            elif isinstance(message, str):
                                try:
                                    data = json.loads(message)
                                    if data.get("type") == "text":
                                        await session.send_realtime_input(text=data["text"])
                                except json.JSONDecodeError:
                                    await session.send_realtime_input(text=message)
                    except ConnectionClosed:
                        print("[WS] Browser closed connection.")
                    except asyncio.CancelledError:
                        pass
                    except Exception as e:
                        print(f"[WS] Gemini Tx Error: {e}")
                
                await asyncio.gather(gemini_to_browser(), browser_to_gemini())
                
        except Exception as e:
            print(f"[WS] Session wrapper error: {e}")
            try:
                ws.send(json.dumps({"type": "error", "text": str(e)}))
            except:
                pass

    asyncio.run(gemini_session())
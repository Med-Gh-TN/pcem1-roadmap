'''
@file run.py
@description Self-healing orchestrator for venv setup, dynamic requirements.txt & .env ingestion, port discovery, process supervision, and auto-launching Chrome.
@layer [Core Logic / System Orchestrator]
@dependencies os, sys, time, socket, signal, venv, subprocess, urllib, webbrowser, pathlib, threading
'''

import os
import sys
import time
import socket
import signal
import venv
import subprocess
import threading
import urllib.request
import urllib.error
import webbrowser
from pathlib import Path

# Base Paths Configuration
BASE_DIR = Path(__file__).parent.resolve()
VENV_DIR = BASE_DIR / ".venv"
REQUIREMENTS_FILE = BASE_DIR / "requirements.txt"
ENV_FILE = BASE_DIR / ".env"
APP_FILE = BASE_DIR / "app.py"
# OS Binary Path Resolution
IS_WINDOWS = sys.platform == "win32"
VENV_PYTHON = VENV_DIR / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")
VENV_PIP = VENV_DIR / ("Scripts/pip.exe" if IS_WINDOWS else "bin/pip")

# Default Fallback Settings
DEFAULT_PORT = 5000
PORT_STEP = 5
MAX_PORT_ATTEMPTS = 20
MAX_RESTART_ATTEMPTS = 5
HEALTH_CHECK_TIMEOUT = 15.0  # seconds

# Global Subprocess Reference for Signal Handling
server_process = None


def read_env_config():
    ''' Dynamically parses configuration variables from .env without external library dependencies '''
    config = {
        "PORT": DEFAULT_PORT,
        "HEALTH_CHECK_TIMEOUT": HEALTH_CHECK_TIMEOUT
    }

    if ENV_FILE.exists():
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        key = key.strip()
                        val = val.strip()

                        if key == "PORT" and val.isdigit():
                            config["PORT"] = int(val)
                        elif key == "HEALTH_CHECK_TIMEOUT":
                            try:
                                config["HEALTH_CHECK_TIMEOUT"] = float(val)
                            except ValueError:
                                pass
        except Exception as e:
            print(f"[⚠️ ENV READ WARNING] Error parsing .env file: {e}")

    return config


def setup_virtual_environment():
    ''' Ensure virtual environment exists, creating it if missing '''
    if not VENV_DIR.exists():
        print(f"[⚙️ VENV] Creating virtual environment at {VENV_DIR}...")
        builder = venv.EnvBuilder(with_pip=True)
        builder.create(VENV_DIR)
        print("[✅ VENV] Virtual environment created successfully.")
    else:
        print("[✅ VENV] Virtual environment detected.")


def setup_environment_file():
    ''' Ensures .env file exists with required Gemini API key placeholders '''
    if not ENV_FILE.exists():
        print("[📝 SETUP] Creating default .env configuration file...")
        default_env_content = (
            "# Google AI Studio API Key\n"
            "GEMINI_API_KEY=\n\n"
            "# Circuit Breaker Fallback Model Family\n"
            "GEMINI_MODELS=gemma-4-31b-it,gemini-2.5-flash,gemini-2.5-pro\n\n"
            "# Default Port\n"
            "PORT=5000\n\n"
            "# Health Check Timeout (Seconds)\n"
            "HEALTH_CHECK_TIMEOUT=15.0\n"
        )
        with open(ENV_FILE, "w", encoding="utf-8") as f:
            f.write(default_env_content)
        print("[⚠️ NOTICE] Created .env file. Please insert your GEMINI_API_KEY in .env to enable AI features.")
    else:
        print("[✅ ENV] Configuration .env file detected.")


def setup_dependencies():
    ''' Dynamically pulls requirements from requirements.txt and installs/updates inside .venv '''
    if not REQUIREMENTS_FILE.exists():
        print(f"[❌ ERROR] '{REQUIREMENTS_FILE.name}' not found. Cannot resolve dependencies.")
        sys.exit(1)

    print(f"[📦 PIP] Dynamically installing/updating packages from '{REQUIREMENTS_FILE.name}' inside .venv...")
    try:
        # Removed --quiet so pip installation traces are visible during debugging
        subprocess.check_call(
            [str(VENV_PIP), "install", "-r", str(REQUIREMENTS_FILE)],
            cwd=str(BASE_DIR)
        )
        print("[✅ PIP] All dependencies verified and up-to-date.")
    except subprocess.CalledProcessError as err:
        print(f"[❌ PIP ERROR] Dependency installation failed: {err}")
        sys.exit(1)


def find_available_port(start_port=DEFAULT_PORT, step=PORT_STEP, max_attempts=MAX_PORT_ATTEMPTS):
    ''' Scans local ports using socket binding, incrementing by step if occupied '''
    current_port = start_port
    for attempt in range(1, max_attempts + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(1)
            result = sock.connect_ex(("127.0.0.1", current_port))
            if result != 0:  # Port is available
                print(f"[🌐 PORT] Port {current_port} is available and bound.")
                return current_port
        
        print(f"[⚠️ PORT BUSY] Port {current_port} in use. Retrying (+{step}) -> Port {current_port + step}...")
        current_port += step

    raise RuntimeError(f"Unable to find an open port after {max_attempts} attempts starting from {start_port}.")


def wait_and_open_browser(url, timeout=HEALTH_CHECK_TIMEOUT):
    ''' Polls server health endpoint until ready, then automatically launches Chrome '''
    health_endpoint = f"{url}/api/roadmap"
    start_time = time.time()

    print(f"[⏳ HEALTH CHECK] Polling {health_endpoint}...")

    while (time.time() - start_time) < timeout:
        try:
            req = urllib.request.urlopen(health_endpoint)
            if req.getcode() == 200:
                print(f"[🚀 BROWSER] Server is healthy! Auto-launching browser tab at {url}...")
                
                # Attempt opening with Google Chrome specifically, fallback to system default
                chrome_opened = False
                try:
                    for chrome_name in ["google-chrome", "chrome", "chromium"]:
                        try:
                            browser = webbrowser.get(chrome_name)
                            browser.open_new_tab(url)
                            chrome_opened = True
                            print(f"[✅ BROWSER] Opened tab using handler: '{chrome_name}'.")
                            break
                        except webbrowser.Error:
                            continue
                except Exception:
                    pass

                if not chrome_opened:
                    webbrowser.open_new_tab(url)
                    print("[✅ BROWSER] Opened tab using system default browser.")
                return True
        except (urllib.error.URLError, ConnectionRefusedError, OSError):
            time.sleep(0.5)

    print("[⚠️ BROWSER WARNING] Server health check timed out. Browser auto-open skipped.")
    return False


def graceful_shutdown(signum=None, frame=None):
    ''' Cleanly terminates child processes on interrupt '''
    global server_process
    print("\n[🛑 SHUTDOWN] Shutting down application gracefully...")
    if server_process and server_process.poll() is None:
        server_process.terminate()
        try:
            server_process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server_process.kill()
        print("[✅ SHUTDOWN] Server process halted.")
    sys.exit(0)


def run_server_with_self_healing(port, timeout):
    ''' Supervises the app.py process, providing high availability and auto-restart on crash '''
    global server_process

    if not APP_FILE.exists():
        print(f"[❌ ERROR] Application entrypoint '{APP_FILE}' not found!")
        sys.exit(1)

    env = os.environ.copy()
    env["PORT"] = str(port)
    env["FLASK_RUN_PORT"] = str(port)

    restart_count = 0
    browser_opened = False

    while restart_count < MAX_RESTART_ATTEMPTS:
        print(f"\n[🚀 LAUNCH] Starting app.py on http://127.0.0.1:{port} (Attempt {restart_count + 1}/{MAX_RESTART_ATTEMPTS})...")
        
        # Start server process
        server_process = subprocess.Popen(
            [str(VENV_PYTHON), str(APP_FILE)],
            cwd=str(BASE_DIR),
            env=env
        )

        # Trigger non-blocking browser launcher thread on initial launch
        if not browser_opened:
            target_url = f"http://127.0.0.1:{port}"
            browser_thread = threading.Thread(
                target=wait_and_open_browser,
                args=(target_url, timeout),
                daemon=True
            )
            browser_thread.start()
            browser_opened = True

        # Monitor process health
        exit_code = server_process.wait()

        # If process exited cleanly, stop supervision loop
        if exit_code in (0, -signal.SIGINT, -signal.SIGTERM):
            print(f"[ℹ️ PROCESS] App closed gracefully with exit code {exit_code}.")
            break

        # High-availability self-healing logic triggered on crash
        restart_count += 1
        print(f"[🚨 CRASH DETECTED] App process exited unexpectedly with code {exit_code}!")
        
        if restart_count < MAX_RESTART_ATTEMPTS:
            backoff_delay = min(2 ** restart_count, 10)
            print(f"[🔄 SELF-HEALING] Restarting server in {backoff_delay} seconds... (Restart {restart_count}/{MAX_RESTART_ATTEMPTS})")
            time.sleep(backoff_delay)
        else:
            print(f"[❌ CRITICAL] Max restart limit ({MAX_RESTART_ATTEMPTS}) reached. Halting self-healing monitor.")
            sys.exit(exit_code)


def main():
    ''' Main execution sequence '''
    signal.signal(signal.SIGINT, graceful_shutdown)
    signal.signal(signal.SIGTERM, graceful_shutdown)

    print("==================================================")
    print(" 🩺 PCEM1 Medical Roadmap Self-Healing Launcher")
    print("==================================================")

    # 1. Virtual Environment Bootstrap
    setup_virtual_environment()

    # 2. Environment Variables (.env) Setup
    setup_environment_file()

    # 3. Dynamic Config Read (.env)
    env_config = read_env_config()

    # 4. Dynamic Dependency Ingestion (requirements.txt)
    setup_dependencies()

    # 5. Dynamic Port Scanner (+5 Retry Logic)
    target_port = find_available_port(start_port=env_config["PORT"], step=PORT_STEP)

    # 6. Supervised Execution with High Availability & Auto-Browser Launch
    run_server_with_self_healing(target_port, env_config["HEALTH_CHECK_TIMEOUT"])


if __name__ == "__main__":
    main()
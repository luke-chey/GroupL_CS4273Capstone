#!/usr/bin/env python3
"""
Backend API for EMS Call Analysis Tool
Flask server that provides grading endpoints for 911 call transcripts
"""

import os
import sys
from pathlib import Path

# Add the backend directory to Python path so imports work
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

from flask import Flask, jsonify
from flask_cors import CORS
from api.routes.grading import grading_bp
from api.routes.health import health_bp
from api.routes.transcription import transcription_bp, initialize_transcriber
from AIGrader import initialize_ollama

def create_app():
    """Application factory pattern"""
    app = Flask(__name__)
    
    # CORS configuration - allow frontend to connect
    # Supports both Vite (5173) and Next.js (3000) dev servers
    CORS(app, resources={
        r"/*": {  # Allow all routes
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })
    
    # Register blueprints
    app.register_blueprint(health_bp, url_prefix='/api')
    app.register_blueprint(grading_bp, url_prefix='/api')
    app.register_blueprint(transcription_bp, url_prefix='/api')
    
    # Add error handler to catch all unhandled errors
    @app.errorhandler(Exception)
    def handle_exception(e):
        import traceback
        import sys
        error_traceback = traceback.format_exc()
        sys.stderr.write(f"\n{'='*60}\n")
        sys.stderr.write(f"UNHANDLED ERROR in Flask app: {str(e)}\n")
        sys.stderr.write(f"Traceback:\n{error_traceback}\n")
        sys.stderr.write(f"{'='*60}\n")
        sys.stderr.flush()
        print(f"\n{'='*60}\nUNHANDLED ERROR: {str(e)}\nTraceback:\n{error_traceback}\n{'='*60}\n", flush=True)
        return jsonify({
            'error': f'Internal server error: {str(e)}',
            'traceback': error_traceback if app.debug else None
        }), 500

    # In containerized environment, defer model initialization to avoid startup issues
    # Models will be initialized on first request if not already loaded
    if not os.getenv('DOCKER_CONTAINER', '').lower() in ('true', '1', 'yes'):
        try:
            # Initialize the transcriber (Preloads the WhisperX model on CPU)
            initialize_transcriber()

            # Initialize Ollama (Preloads the llama3.1:8b model)
            initialize_ollama()
        except Exception as e:
            print(f"Warning: Model initialization failed at startup: {e}")
            print("Models will be initialized on first request.")
    else:
        # In Docker, wait a bit for Ollama to start, then check readiness
        import time
        import threading
        def wait_for_ollama():
            print("Waiting for Ollama to start...")
            time.sleep(5)  # Give Ollama time to start
            try:
                from AIGrader import check_ollama_ready
                if check_ollama_ready(max_retries=10, retry_delay=3):
                    print("Ollama is ready!")
                    initialize_ollama()
                else:
                    print("Warning: Ollama readiness check failed. Will retry on first request.")
            except Exception as e:
                print(f"Warning: Could not check Ollama readiness: {e}")
        
        # Start in background thread so Flask can start immediately
        threading.Thread(target=wait_for_ollama, daemon=True).start()
    return app

if __name__ == '__main__':
    app = create_app()
    
    # Only print banner once (not during reloader restart)
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        print("=" * 60)
        print("EMS Call Analysis API Server")
        print("=" * 60)
        print("Running on: http://localhost:5001")
        print("Health check: http://localhost:5001/api/health")
        print("Grade endpoint: http://localhost:5001/api/grade")
        print("Transcription endpoint: http://localhost:5001/api/transcription")
        print("=" * 60)

        
    
    app.run(host='0.0.0.0', port=5001, debug=True)


"""Small private HTTP worker that keeps the openai/whisper model in memory."""
from __future__ import annotations

import hmac
import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import whisper

MAX_AUDIO_BYTES = 4 * 1024 * 1024
LANGUAGES = set("en de fr es it pt nl sv no da fi pl cs hu el tr ru uk ar he hi zh ja ko ro".split())
EXTENSIONS = {
    "audio/webm": ".webm",
    "audio/mp4": ".mp4",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
}
TOKEN = os.environ.get("WHISPER_SERVICE_TOKEN", "")
MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")
if not TOKEN:
    raise RuntimeError("Set WHISPER_SERVICE_TOKEN before starting the Whisper worker")

print(f"Loading Whisper model: {MODEL_NAME}", flush=True)
MODEL = whisper.load_model(MODEL_NAME)
INFERENCE = threading.BoundedSemaphore(1)


class Handler(BaseHTTPRequestHandler):
    server_version = "WhisperWorker/1.0"

    def respond(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/transcribe":
            self.respond(404, {"error": "not_found"})
            return
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if not hmac.compare_digest(supplied, TOKEN):
            self.respond(401, {"error": "unauthorized"})
            return

        mime = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        length = self.headers.get("Content-Length", "")
        try:
            size = int(length)
        except ValueError:
            self.respond(400, {"error": "invalid_recording"})
            return
        if mime not in EXTENSIONS or size < 128 or size > MAX_AUDIO_BYTES:
            self.respond(400, {"error": "invalid_recording"})
            return

        language = parse_qs(parsed.query).get("language", [""])[0].lower()
        if language not in LANGUAGES:
            self.respond(400, {"error": "invalid_language"})
            return
        if not INFERENCE.acquire(blocking=False):
            self.respond(429, {"error": "transcription_rate_limited"})
            return

        try:
            audio = self.rfile.read(size)
            if len(audio) != size:
                self.respond(400, {"error": "invalid_recording"})
                return
            with tempfile.NamedTemporaryFile(suffix=EXTENSIONS[mime]) as recording:
                recording.write(audio)
                recording.flush()
                result = MODEL.transcribe(recording.name, language=language, fp16=False, verbose=False)
            segments = result.get("segments", [])
            text = " ".join(
                segment.get("text", "").strip()
                for segment in segments
                if not (segment.get("no_speech_prob", 0) > 0.7 and segment.get("avg_logprob", 0) < -1)
            ).strip() if segments else result.get("text", "").strip()
            if not text:
                self.respond(422, {"error": "no_speech"})
                return
            self.respond(200, {"text": text[:4000]})
        except Exception:
            self.respond(503, {"error": "transcription_unavailable"})
        finally:
            INFERENCE.release()

    def log_message(self, format: str, *args: object) -> None:
        print("Whisper worker: " + (format % args), flush=True)


if __name__ == "__main__":
    host = os.environ.get("WHISPER_HOST", "0.0.0.0")
    port = int(os.environ.get("WHISPER_PORT", "8765"))
    print(f"Whisper worker listening on {host}:{port}", flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()

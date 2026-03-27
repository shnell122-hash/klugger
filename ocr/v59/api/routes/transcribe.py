"""
Transcripción de video/audio vía yt-dlp + ffmpeg + OpenAI Whisper.

Flujo:
  1. yt-dlp descarga el audio del URL (YouTube, TikTok, Drive, etc.)
  2. ffmpeg convierte a MP3 mono 32kbps 16kHz (mínimo para Whisper, ahorra espacio)
  3. ffmpeg divide en chunks de 25 min (< 25 MB cada uno — límite Whisper API)
  4. Cada chunk se transcribe con whisper-1
  5. Audio completo se guarda en uploads/ → user_artifacts (source='system')
  6. Transcripción completa se guarda en system_artifacts (artifact_type='transcription')
  7. Job en memoria para polling de progreso desde el frontend
"""

import os, uuid, hashlib, subprocess, tempfile, threading, shutil
from pathlib import Path
from flask import Blueprint, request, jsonify
from tools.db import execute

transcribe_bp = Blueprint('transcribe', __name__)

UPLOAD_DIR = os.path.abspath(
    os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'uploads')
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

CHUNK_SEC  = 1500   # 25 minutos por chunk → ~9.6 MB a 32kbps
AUDIO_KBPS = '32k'  # mono speech: mínima tasa que Whisper acepta bien
AUDIO_HZ   = '16000'

# ── In-memory job store ─────────────────────────────────────────────────────
_jobs: dict = {}   # job_id → {status, progress, message, ...}


# ── Endpoints ───────────────────────────────────────────────────────────────

@transcribe_bp.route('/api/transcribe', methods=['POST'])
def start_transcription():
    body     = request.get_json(force=True) or {}
    case_id  = body.get('case_id', '').strip()
    url      = body.get('url', '').strip()
    language = body.get('language', 'es')

    if not case_id or not url:
        return jsonify(error='case_id y url son requeridos'), 400

    openai_key = os.getenv('OPENAI_API_KEY', '')
    if not openai_key:
        return jsonify(error='OPENAI_API_KEY no configurado en el servidor'), 503

    # Verificar dependencias
    for cmd in ('yt-dlp', 'ffmpeg'):
        if subprocess.run(['which', cmd], capture_output=True).returncode != 0:
            return jsonify(error=f'"{cmd}" no está instalado en el servidor'), 503

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        'status': 'queued', 'progress': 0,
        'message': 'En cola...', 'url': url
    }

    threading.Thread(
        target=_run_transcription,
        args=(job_id, case_id, url, language, openai_key),
        daemon=True
    ).start()

    return jsonify(job_id=job_id, status='queued')


@transcribe_bp.route('/api/transcribe/<job_id>', methods=['GET'])
def transcription_status(job_id):
    job = _jobs.get(job_id)
    if not job:
        return jsonify(error='Job no encontrado'), 404
    return jsonify(job)


# ── Background worker ────────────────────────────────────────────────────────

def _upd(job_id, status, progress, message):
    if job_id in _jobs:
        _jobs[job_id].update(status=status, progress=progress, message=message)


def _ytdlp_args(extra: list) -> list:
    """
    Construye los args base de yt-dlp con:
    - cliente Android (evita detección de bot en YouTube sin cookies)
    - cookies file si YTDLP_COOKIES_FILE está configurado en .env
    """
    args = [
        'yt-dlp', '--no-playlist',
        '--extractor-args', 'youtube:player_client=android,web',
    ]
    cookies = os.getenv('YTDLP_COOKIES_FILE', '').strip()
    if cookies and os.path.isfile(cookies):
        args += ['--cookies', cookies]
    return args + extra


def _run_transcription(job_id, case_id, url, language, openai_key):
    tmp = tempfile.mkdtemp(prefix='vilar_tx_')
    try:
        # ── 1. Obtener título ────────────────────────────────────────────
        _upd(job_id, 'downloading', 3, 'Obteniendo información del video...')
        title_proc = subprocess.run(
            _ytdlp_args(['--get-title', url]),
            capture_output=True, text=True, timeout=60
        )
        video_title = title_proc.stdout.strip()[:120] or 'Video'

        # ── 2. Descargar audio ───────────────────────────────────────────
        _upd(job_id, 'downloading', 8,
             f'Descargando audio: {video_title}...')
        raw_out = os.path.join(tmp, 'raw.%(ext)s')
        dl = subprocess.run(
            _ytdlp_args([
                '-x',                    # solo audio
                '--audio-format', 'mp3',
                '--audio-quality', '5',  # VBR ~130 kbps — recomprimimos después
                '-o', raw_out, url,
            ]),
            capture_output=True, text=True, timeout=1800
        )
        if dl.returncode != 0:
            stderr = dl.stderr or ''
            # Mensaje de error accionable para el usuario
            if 'Sign in to confirm' in stderr or 'bot' in stderr.lower():
                raise RuntimeError(
                    'YouTube bloqueó la descarga por detección de bot.\n\n'
                    'Solución: configura YTDLP_COOKIES_FILE en el .env del servidor:\n'
                    '1. Instala la extensión "Get cookies.txt LOCALLY" en Chrome/Firefox\n'
                    '2. Navega a youtube.com con tu cuenta iniciada\n'
                    '3. Exporta las cookies como cookies.txt\n'
                    '4. Sube el archivo al servidor: /var/www/catalogos/OCR/v59/youtube_cookies.txt\n'
                    '5. Agrega al .env: YTDLP_COOKIES_FILE=/var/www/catalogos/OCR/v59/youtube_cookies.txt\n'
                    '6. Reinicia: pm2 restart vilar-legal-os-v59'
                )
            raise RuntimeError(f'yt-dlp falló (código {dl.returncode}):\n{stderr[-500:]}')

        raw_files = list(Path(tmp).glob('raw.*'))
        if not raw_files:
            raise RuntimeError('yt-dlp no generó archivo de audio')
        raw_path = str(raw_files[0])

        # ── 3. Convertir a MP3 mono 32kbps 16kHz ────────────────────────
        _upd(job_id, 'processing', 25, 'Convirtiendo y comprimiendo audio...')
        converted = os.path.join(tmp, 'converted.mp3')
        subprocess.run(
            ['ffmpeg', '-y', '-i', raw_path,
             '-ac', '1',           # mono
             '-ar', AUDIO_HZ,      # 16 kHz
             '-b:a', AUDIO_KBPS,   # 32 kbps
             converted],
            capture_output=True, timeout=600, check=True
        )

        # ── 4. Dividir en chunks de 25 min ───────────────────────────────
        _upd(job_id, 'processing', 35, 'Dividiendo en segmentos...')
        chunks_pat = os.path.join(tmp, 'chunk_%04d.mp3')
        subprocess.run(
            ['ffmpeg', '-y', '-i', converted,
             '-f', 'segment',
             '-segment_time', str(CHUNK_SEC),
             '-c', 'copy',
             '-reset_timestamps', '1',
             chunks_pat],
            capture_output=True, timeout=300, check=True
        )
        chunk_files = sorted(Path(tmp).glob('chunk_*.mp3'))
        if not chunk_files:
            # Video corto que no se dividió: usar el archivo completo
            chunk_files = [Path(converted)]

        total = len(chunk_files)
        _upd(job_id, 'transcribing', 38,
             f'{total} segmento(s) detectado(s). Transcribiendo con Whisper...')

        # ── 5. Transcribir cada chunk ────────────────────────────────────
        import openai as _oai
        client = _oai.OpenAI(api_key=openai_key)

        transcript_parts = []
        for i, chunk_path in enumerate(chunk_files):
            pct = 38 + int(50 * (i / total))
            _upd(job_id, 'transcribing', pct,
                 f'Segmento {i + 1}/{total} — Whisper procesando...')

            offset_sec = i * CHUNK_SEC
            h  = offset_sec // 3600
            mn = (offset_sec % 3600) // 60
            ts = f'[{h:02d}:{mn:02d}:00]'

            with open(str(chunk_path), 'rb') as fh:
                resp = client.audio.transcriptions.create(
                    model='whisper-1',
                    file=fh,
                    language=language if language != 'auto' else None,
                    response_format='text',
                )
            chunk_text = (resp if isinstance(resp, str) else getattr(resp, 'text', str(resp))).strip()
            transcript_parts.append(f'{ts}\n{chunk_text}')

        full_transcript = '\n\n'.join(transcript_parts)

        # ── 6. Guardar audio completo en uploads/ ────────────────────────
        _upd(job_id, 'saving', 90, 'Guardando audio en expediente...')
        audio_art_id = str(uuid.uuid4())
        audio_dest   = os.path.join(UPLOAD_DIR, f'{audio_art_id}.mp3')
        shutil.copy2(converted, audio_dest)

        audio_size = os.path.getsize(audio_dest)
        sha = hashlib.sha256()
        with open(audio_dest, 'rb') as fh:
            for blk in iter(lambda: fh.read(65536), b''):
                sha.update(blk)

        execute(
            """INSERT INTO user_artifacts
               (artifact_id, case_id, filename, mime_type, file_path,
                file_size_bytes, checksum_sha256, extracted_text, source, uploaded_at)
               VALUES (%s,%s,%s,'audio/mpeg',%s,%s,%s,%s,'system',NOW())""",
            (
                audio_art_id, case_id,
                f'audio_{video_title[:50].replace(" ", "_")}.mp3',
                audio_dest, audio_size, sha.hexdigest(),
                f'[Audio transcripción]\nURL: {url}\nTítulo: {video_title}'
            )
        )

        # ── 7. Guardar transcripción como system artifact ─────────────────
        _upd(job_id, 'saving', 96, 'Guardando transcripción...')
        tx_art_id = str(uuid.uuid4())
        art_name  = f'Transcripción — {video_title[:80]}'
        tx_md = (
            f'# {art_name}\n\n'
            f'**URL fuente:** {url}  \n'
            f'**Idioma:** {language}  \n'
            f'**Segmentos:** {total}  \n\n'
            f'---\n\n'
            f'{full_transcript}'
        )
        execute(
            """INSERT INTO system_artifacts
               (artifact_id, case_id, artifact_name, artifact_type, content,
                mime_type, file_size_bytes, source)
               VALUES (%s,%s,%s,'transcription',%s,'text/markdown',%s,'system')""",
            (tx_art_id, case_id, art_name, tx_md, len(tx_md.encode()))
        )

        word_count = len(full_transcript.split())
        _jobs[job_id].update(
            status='done', progress=100,
            message=f'Listo — {word_count:,} palabras transcritas en {total} segmento(s)',
            artifact_id=tx_art_id,
            audio_id=audio_art_id,
            title=video_title,
            word_count=word_count,
            segments=total,
        )

    except subprocess.CalledProcessError as e:
        err = (e.stderr or b'').decode('utf-8', errors='replace')[-400:] if isinstance(e.stderr, bytes) \
              else str(e.stderr or '')[-400:]
        _jobs[job_id].update(status='error', progress=0,
                             error=f'Error de procesamiento: {err or str(e)}')
    except Exception as e:
        _jobs[job_id].update(status='error', progress=0, error=str(e))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

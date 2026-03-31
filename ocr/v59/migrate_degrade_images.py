#!/usr/bin/env python3
"""
Migración: aplicar degradación (blur + baja calidad JPEG) a imágenes
generadas por IA que ya están almacenadas en user_artifacts.

Aplica estrictamente a registros con source='system' y mime_type LIKE 'image/%'.

Uso (en producción):
    /var/www/catalogos/OCR/v59/venv/bin/python3 migrate_degrade_images.py

Variables de entorno opcionales (si difieren de los defaults):
    DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS
"""

import os, sys, io, hashlib, mysql.connector

# Parámetros de degradación — deben coincidir con imagen.py
BLUR_RADIUS  = 1.4
JPEG_QUALITY = 48


def _degrade_image(raw_bytes: bytes) -> bytes:
    from PIL import Image, ImageFilter
    img = Image.open(io.BytesIO(raw_bytes)).convert('RGB')
    if BLUR_RADIUS > 0:
        img = img.filter(ImageFilter.GaussianBlur(radius=BLUR_RADIUS))
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue()


def main():
    conn = mysql.connector.connect(
        host=os.getenv('DB_HOST', '127.0.0.1'),
        port=int(os.getenv('DB_PORT', 3306)),
        database=os.getenv('DB_NAME', 'vilar_legal_os'),
        user=os.getenv('DB_USER', 'vilar_legal'),
        password=os.getenv('DB_PASS', ''),
        charset='utf8mb4',
        autocommit=False,
    )
    cur = conn.cursor(dictionary=True)

    cur.execute(
        "SELECT artifact_id, file_path FROM user_artifacts "
        "WHERE source='system' AND mime_type LIKE 'image/%'"
    )
    rows = cur.fetchall()
    total = len(rows)
    print(f"Imágenes a procesar: {total}")

    ok = skipped = errors = 0

    for i, row in enumerate(rows, 1):
        artifact_id = row['artifact_id']
        file_path   = row['file_path']

        prefix = f"[{i}/{total}] {artifact_id[:8]}…"

        if not file_path or not os.path.isfile(file_path):
            print(f"{prefix} OMITIDA — archivo no encontrado: {file_path}")
            skipped += 1
            continue

        try:
            raw = open(file_path, 'rb').read()
            processed = _degrade_image(raw)
            sha256 = hashlib.sha256(processed).hexdigest()

            with open(file_path, 'wb') as fh:
                fh.write(processed)

            cur.execute(
                "UPDATE user_artifacts "
                "SET file_size_bytes=%s, checksum_sha256=%s "
                "WHERE artifact_id=%s",
                (len(processed), sha256, artifact_id),
            )
            conn.commit()
            print(f"{prefix} OK  ({len(raw)} → {len(processed)} bytes)")
            ok += 1

        except Exception as e:
            conn.rollback()
            print(f"{prefix} ERROR — {e}")
            errors += 1

    cur.close()
    conn.close()

    print(f"\nResumen: {ok} procesadas, {skipped} omitidas, {errors} errores")
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()

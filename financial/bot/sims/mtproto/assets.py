"""
assets.py — Generación programática de archivos de prueba.

Crea imágenes, Excel y audio sintéticos para los escenarios de modo asistente
(T05/T06) sin necesidad de archivos binarios externos.
Requiere: Pillow, openpyxl (incluidos en requirements.txt)
"""

import io
import random
from pathlib import Path

ASSETS_DIR = Path(__file__).parent.parent / "assets"

# ── Cuadro de retorno PNG ─────────────────────────────────────────────────────

def gen_cuadro_retorno_png(semana: int = 14, clientes: list = None) -> bytes:
    """
    Genera un PNG de cuadro de retorno estilo iOS dark mode.
    Retorna bytes del PNG.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        raise ImportError("Pillow no instalado: ./setup-venv.sh")

    if clientes is None:
        clientes = [
            {"nombre": "GERMAN VILAR ARGUETA",  "neto": 23000,  "pct": 5.5,  "clabe": "058597000030773833", "banco": "BANREGIO"},
            {"nombre": "NOELA SUÁREZ",           "neto": 30000,  "pct": 5.5,  "clabe": "058597000068994820", "banco": "BANREGIO"},
            {"nombre": "KEVIN GARCIA",           "neto": 15000,  "pct": 5.0,  "clabe": "140180900000120017", "banco": "BBVA"},
        ]

    # Calcular brutos
    for c in clientes:
        c["bruto"] = round(c["neto"] / (1 - c["pct"] / 100), 2)

    total_neto  = sum(c["neto"]  for c in clientes)
    total_bruto = sum(c["bruto"] for c in clientes)

    # Canvas oscuro (dark mode)
    W, H = 800, 60 + len(clientes) * 40 + 80
    img  = Image.new("RGB", (W, H), color=(30, 30, 30))
    draw = ImageDraw.Draw(img)

    # Header
    draw.rectangle([0, 0, W, 50], fill=(45, 45, 45))
    draw.text((20, 15), f"CUADRO DE RETORNO — SEMANA {semana}", fill=(200, 200, 200))

    # Columnas
    cols = ["NOMBRE", "NETO", "%", "BRUTO", "CLABE", "BANCO"]
    col_x = [20, 280, 380, 430, 530, 690]
    y = 55
    draw.rectangle([0, y, W, y + 30], fill=(60, 60, 60))
    for i, col in enumerate(cols):
        draw.text((col_x[i], y + 8), col, fill=(180, 180, 180))
    y += 35

    # Filas
    for idx, c in enumerate(clientes):
        bg = (35, 35, 35) if idx % 2 == 0 else (40, 40, 40)
        draw.rectangle([0, y, W, y + 35], fill=bg)
        vals = [
            c["nombre"][:25],
            f"${c['neto']:,.0f}",
            f"{c['pct']}%",
            f"${c['bruto']:,.2f}",
            c["clabe"],
            c["banco"][:8],
        ]
        for i, v in enumerate(vals):
            draw.text((col_x[i], y + 10), v, fill=(220, 220, 220))
        y += 38

    # Totales
    draw.rectangle([0, y, W, y + 40], fill=(50, 80, 50))
    draw.text((20,      y + 12), "TOTALES",               fill=(150, 255, 150))
    draw.text((col_x[1], y + 12), f"${total_neto:,.0f}",  fill=(150, 255, 150))
    draw.text((col_x[3], y + 12), f"${total_bruto:,.2f}", fill=(150, 255, 150))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def gen_cuadro_retorno_xlsx(semana: int = 14, clientes: list = None) -> bytes:
    """Genera un XLSX de cuadro de retorno."""
    try:
        import openpyxl
        from openpyxl.styles import PatternFill, Font, Alignment
    except ImportError:
        raise ImportError("openpyxl no instalado: ./setup-venv.sh")

    if clientes is None:
        clientes = [
            {"nombre": "GERMAN VILAR ARGUETA",  "neto": 23000,  "pct": 5.5,  "clabe": "058597000030773833", "banco": "BANREGIO"},
            {"nombre": "NOELA SUÁREZ",           "neto": 30000,  "pct": 5.5,  "clabe": "058597000068994820", "banco": "BANREGIO"},
            {"nombre": "KEVIN GARCIA",           "neto": 15000,  "pct": 5.0,  "clabe": "140180900000120017", "banco": "BBVA"},
        ]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"SEM{semana}"

    header_fill = PatternFill("solid", fgColor="2D2D2D")
    header_font = Font(bold=True, color="FFFFFF")

    headers = ["NOMBRE", "NETO", "%", "BRUTO", "CLABE", "BANCO"]
    for col, h in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")

    for row, c in enumerate(clientes, 2):
        bruto = round(c["neto"] / (1 - c["pct"] / 100), 2)
        ws.cell(row=row, column=1, value=c["nombre"])
        ws.cell(row=row, column=2, value=c["neto"])
        ws.cell(row=row, column=3, value=c["pct"] / 100)
        ws.cell(row=row, column=4, value=bruto)
        ws.cell(row=row, column=5, value=c["clabe"])
        ws.cell(row=row, column=6, value=c["banco"])

    # Totals row
    n = len(clientes) + 2
    ws.cell(row=n, column=1, value="TOTAL")
    ws.cell(row=n, column=2, value=f"=SUM(B2:B{n-1})")
    ws.cell(row=n, column=4, value=f"=SUM(D2:D{n-1})")

    for col in range(1, 7):
        ws.column_dimensions[ws.cell(row=1, column=col).column_letter].width = 18

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def gen_comprobante_png(monto: float = 53000, receptor: str = "GERMAN VILAR") -> bytes:
    """Genera una imagen sintética de comprobante bancario SPEI."""
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        raise ImportError("Pillow no instalado: ./setup-venv.sh")

    W, H = 480, 420
    img  = Image.new("RGB", (W, H), color=(245, 247, 250))
    draw = ImageDraw.Draw(img)

    # Header banco
    draw.rectangle([0, 0, W, 80], fill=(0, 100, 180))
    draw.text((20, 25), "BANREGIO", fill=(255, 255, 255))
    draw.text((20, 50), "Comprobante de transferencia", fill=(200, 230, 255))

    # Monto principal
    draw.rectangle([20, 100, W - 20, 170], fill=(240, 248, 255))
    draw.text((40, 115), "Monto transferido", fill=(100, 100, 100))
    draw.text((40, 140), f"${monto:,.2f} MXN", fill=(0, 80, 160))

    # Detalles
    details = [
        ("Fecha",       "02/05/2026 19:21"),
        ("Tipo",        "SPEI"),
        ("Referencia",  f"{random.randint(100000, 999999)}"),
        ("Receptor",    receptor[:30]),
        ("CLABE",       "058597000030773833"),
        ("Banco dest.", "BANREGIO"),
        ("Concepto",    f"SEM {random.randint(10,20)} PAGO"),
        ("Estado",      "EXITOSA"),
    ]

    y = 185
    for label, val in details:
        draw.rectangle([20, y, W - 20, y + 28], fill=(255, 255, 255))
        draw.text((30,  y + 7), label + ":", fill=(120, 120, 120))
        draw.text((180, y + 7), val,          fill=(30,  30,  30))
        y += 30

    # Footer
    draw.rectangle([0, H - 40, W, H], fill=(0, 100, 180))
    draw.text((20, H - 25), "Folio: " + f"{random.randint(1000000, 9999999)}", fill=(200, 230, 255))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ── Variantes con datos aleatorios ────────────────────────────────────────────

def random_cuadro_png() -> tuple[bytes, int]:
    """Retorna (bytes_png, semana) con datos aleatorios."""
    semana = random.randint(10, 30)
    n_clientes = random.randint(2, 4)
    nombres = ["GERMAN VILAR", "NOELA SUÁREZ", "KEVIN GARCIA",
               "RICARDO PÉREZ", "MARIANA TORRES", "ANDREA LÓPEZ"]
    clabes  = ["058597000030773833", "058597000068994820",
               "140180900000120017", "012914002436956798"]
    clientes = []
    for i in range(n_clientes):
        neto = random.choice([10000, 15000, 20000, 23000, 30000, 50000])
        clientes.append({
            "nombre": nombres[i % len(nombres)],
            "neto":   neto,
            "pct":    random.choice([5.0, 5.5, 6.0]),
            "clabe":  clabes[i % len(clabes)],
            "banco":  random.choice(["BANREGIO", "BBVA", "BANAMEX"]),
        })
    return gen_cuadro_retorno_png(semana, clientes), semana


def random_comprobante_jpg() -> tuple[bytes, float]:
    """Retorna (bytes_jpg, monto)."""
    monto = random.choice([10000, 23000, 30000, 50000, 75000, 100000])
    return gen_comprobante_png(monto), monto

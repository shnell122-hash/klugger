"""
assets.py — Generación programática de assets de prueba con complejidad progresiva.

Tiers de complejidad:
  Tier 1: 2-3 clientes, saldos positivos, montos redondos
  Tier 2: 3-4 clientes, montos más grandes, comisiones mixtas
  Tier 3: 4-5 clientes, 1-2 con saldo negativo, montos disputados
  Tier 4: 5+ clientes, múltiples negativos, crédito que se consume, montos extremos

El bot debe responder con comisiones y saldo actualizado en modo asistente.
Progresivamente los cuadros revelan edge cases que el bot debe manejar bien.
"""

import io
import random
from dataclasses import dataclass, field
from typing import Optional

# ── Tipos de datos ─────────────────────────────────────────────────────────────

@dataclass
class ClienteRow:
    nombre: str
    neto: float
    pct: float
    clabe: str
    banco: str
    saldo_previo: float = 0.0       # saldo antes del cuadro (0 = sin historial)
    monto_disputado: bool = False    # monto difiere del acuerdo previo
    es_ajuste: bool = False          # ajuste/corrección de cuadro anterior

    @property
    def bruto(self) -> float:
        return round(self.neto / (1 - self.pct / 100), 2)

    @property
    def comision(self) -> float:
        return round(self.bruto - self.neto, 2)

    @property
    def saldo_nuevo(self) -> float:
        return round(self.saldo_previo + self.neto, 2)


# ── Pools de datos ─────────────────────────────────────────────────────────────

NOMBRES = [
    "GERMAN VILAR ARGUETA", "NOELA SUÁREZ MENDOZA", "KEVIN GARCIA TORRES",
    "RICARDO PÉREZ LUNA",   "MARIANA TORRES VEGA",  "ANDREA LÓPEZ REYES",
    "JORGE BARRON SOSA",    "LUIS MENDOZA IBARRA",  "CLAUDIA RAMOS GÓMEZ",
]

CLABES = [
    ("058597000030773833", "BANREGIO"),
    ("058597000068994820", "BANREGIO"),
    ("140180900000120017", "BBVA"),
    ("012914002436956798", "BANAMEX"),
    ("072840000185345818", "BANORTE"),
    ("006180000000000001", "HSBC"),
    ("021180000000000001", "SCOTIABANK"),
]

PCTS_TIER1 = [5.5]
PCTS_TIER2 = [5.0, 5.5, 6.0]
PCTS_TIER3 = [4.5, 5.0, 5.5, 6.0, 7.0]
PCTS_TIER4 = [0.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0]  # 0% = cubre saldo previo

MONTOS_TIER1 = [10000, 15000, 20000, 23000, 30000]
MONTOS_TIER2 = [50000, 75000, 100000, 150000, 200000]
MONTOS_TIER3 = [150000, 250000, 500000, 750000]
MONTOS_TIER4 = [500000, 1000000, 2000000, 5000000]


def gen_clientes(tier: int, n: int) -> list[ClienteRow]:
    """Genera lista de clientes con complejidad según el tier."""
    clientes = []
    nombres_pool  = random.sample(NOMBRES, min(n, len(NOMBRES)))
    clabes_pool   = random.sample(CLABES,  min(n, len(CLABES)))

    for i in range(n):
        nombre = nombres_pool[i % len(nombres_pool)]
        clabe, banco = clabes_pool[i % len(clabes_pool)]

        if tier == 1:
            neto = random.choice(MONTOS_TIER1)
            pct  = random.choice(PCTS_TIER1)
            saldo_previo = 0.0

        elif tier == 2:
            neto = random.choice(MONTOS_TIER1 + MONTOS_TIER2)
            pct  = random.choice(PCTS_TIER2)
            saldo_previo = 0.0

        elif tier == 3:
            neto = random.choice(MONTOS_TIER2 + MONTOS_TIER3)
            pct  = random.choice(PCTS_TIER3)
            # 1 de cada 4 clientes tiene saldo negativo (debe dinero)
            saldo_previo = random.choice([-neto * 0.3, 0.0, 0.0, neto * 0.1])

        else:  # tier 4
            neto = random.choice(MONTOS_TIER3 + MONTOS_TIER4)
            pct  = random.choice(PCTS_TIER4)
            # 2 de cada 5 clientes tienen saldo negativo o crédito acumulado
            saldo_previo = random.choice([
                -neto * 0.5,       # debe la mitad
                -neto * 1.2,       # debe más de lo que va a recibir → sigue negativo
                neto * 0.8,        # tiene crédito, absorbe casi toda la comisión
                0.0, 0.0,
            ])

        monto_disputado = tier >= 3 and random.random() < 0.15
        es_ajuste       = tier >= 4 and random.random() < 0.10

        clientes.append(ClienteRow(
            nombre=nombre, neto=neto, pct=pct, clabe=clabe, banco=banco,
            saldo_previo=saldo_previo, monto_disputado=monto_disputado,
            es_ajuste=es_ajuste,
        ))

    return clientes


# ── PNG cuadro de retorno ──────────────────────────────────────────────────────

def gen_cuadro_png(tier: int = 1, semana: Optional[int] = None,
                   clientes: Optional[list[ClienteRow]] = None) -> bytes:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        raise ImportError("Pillow no instalado: ./setup-venv.sh")

    if semana is None:
        semana = random.randint(10, 52)
    if clientes is None:
        n = {1: random.randint(2, 3), 2: random.randint(3, 4),
             3: random.randint(4, 5), 4: random.randint(5, 8)}.get(tier, 3)
        clientes = gen_clientes(tier, n)

    # Dimensiones
    COL_W   = [230, 90, 45, 100, 160, 85, 90]   # NOMBRE/NETO/%/BRUTO/CLABE/BANCO/SALDO
    ROW_H   = 36
    PAD     = 12
    W       = sum(COL_W) + PAD * 2
    H       = 60 + (len(clientes) + 2) * ROW_H + 20

    img  = Image.new("RGB", (W, H), color=(28, 28, 30))
    draw = ImageDraw.Draw(img)

    # Header
    draw.rectangle([0, 0, W, 50], fill=(40, 40, 44))
    titulo = f"CUADRO DE RETORNO — SEMANA {semana}"
    if tier >= 3:
        titulo += "  ⚠️ REVISAR SALDOS"
    draw.text((PAD, 16), titulo, fill=(210, 210, 210))

    # Columnas
    headers = ["NOMBRE", "NETO", "%", "BRUTO", "CLABE", "BANCO", "SALDO"]
    y = 54
    draw.rectangle([0, y, W, y + ROW_H], fill=(55, 55, 60))
    x = PAD
    for i, h in enumerate(headers):
        draw.text((x, y + 10), h, fill=(170, 170, 180))
        x += COL_W[i]
    y += ROW_H

    # Filas de clientes
    for idx, c in enumerate(clientes):
        bg = (33, 33, 36) if idx % 2 == 0 else (38, 38, 42)
        # Saldo negativo → fondo rojizo
        if c.saldo_nuevo < 0:
            bg = (55, 28, 28)
        elif c.monto_disputado:
            bg = (55, 50, 28)   # amarillento: en disputa
        draw.rectangle([0, y, W, y + ROW_H], fill=bg)

        saldo_color = (255, 100, 100) if c.saldo_nuevo < 0 else (150, 255, 150)
        vals = [
            (c.nombre[:26],                              (220, 220, 220)),
            (f"${c.neto:,.0f}",                          (220, 255, 220)),
            (f"{c.pct:.1f}%",                            (180, 180, 200)),
            (f"${c.bruto:,.2f}",                         (200, 200, 255)),
            (c.clabe,                                    (190, 190, 190)),
            (c.banco[:8],                                (170, 170, 170)),
            (f"${c.saldo_nuevo:,.0f}",                   saldo_color),
        ]

        suffix = ""
        if c.monto_disputado: suffix = " ⚠️"
        if c.es_ajuste:       suffix = " (ajuste)"
        vals[0] = (vals[0][0] + suffix, vals[0][1])

        x = PAD
        for i, (v, color) in enumerate(vals):
            draw.text((x, y + 10), v, fill=color)
            x += COL_W[i]
        y += ROW_H

    # Totales
    total_neto   = sum(c.neto   for c in clientes)
    total_bruto  = sum(c.bruto  for c in clientes)
    total_com    = sum(c.comision for c in clientes)
    negativos    = sum(1 for c in clientes if c.saldo_nuevo < 0)

    draw.rectangle([0, y, W, y + ROW_H], fill=(40, 70, 40))
    draw.text((PAD,                  y + 10), "TOTALES",              fill=(150, 255, 150))
    draw.text((PAD + COL_W[0],       y + 10), f"${total_neto:,.0f}",  fill=(150, 255, 150))
    draw.text((PAD + sum(COL_W[:3]), y + 10), f"${total_bruto:,.2f}", fill=(150, 255, 150))
    draw.text((PAD + sum(COL_W[:4]) + COL_W[4] + COL_W[5], y + 10),
              f"Comisión total: ${total_com:,.2f}", fill=(200, 200, 255))
    y += ROW_H

    if negativos > 0:
        draw.rectangle([0, y, W, y + 28], fill=(80, 30, 30))
        draw.text((PAD, y + 7),
                  f"⚠️  {negativos} cliente(s) con saldo negativo tras dispersión",
                  fill=(255, 150, 150))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ── XLSX cuadro de retorno ─────────────────────────────────────────────────────

def gen_cuadro_xlsx(tier: int = 1, semana: Optional[int] = None,
                    clientes: Optional[list[ClienteRow]] = None) -> bytes:
    try:
        import openpyxl
        from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    except ImportError:
        raise ImportError("openpyxl no instalado: ./setup-venv.sh")

    if semana is None:
        semana = random.randint(10, 52)
    if clientes is None:
        n = {1: 3, 2: 4, 3: 5, 4: 7}.get(tier, 3)
        clientes = gen_clientes(tier, n)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"SEM{semana}"

    header_fill = PatternFill("solid", fgColor="2D2D2D")
    neg_fill    = PatternFill("solid", fgColor="5E2020")
    ok_fill     = PatternFill("solid", fgColor="1E4020")
    disp_fill   = PatternFill("solid", fgColor="5E4E20")
    bold_white  = Font(bold=True, color="FFFFFF")
    thin_side   = Side(style="thin")
    border      = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

    headers = ["NOMBRE", "NETO", "%", "BRUTO", "CLABE", "BANCO", "SALDO PREV", "SALDO NUEVO"]
    col_widths = [30, 14, 8, 16, 22, 12, 14, 14]

    for col, (h, w) in enumerate(zip(headers, col_widths), 1):
        cell = ws.cell(row=1, column=col, value=h)
        cell.fill = header_fill
        cell.font = bold_white
        cell.alignment = Alignment(horizontal="center")
        cell.border = border
        ws.column_dimensions[cell.column_letter].width = w

    for row_i, c in enumerate(clientes, 2):
        nota = " ⚠️" if c.monto_disputado else (" (ajuste)" if c.es_ajuste else "")
        vals = [c.nombre + nota, c.neto, c.pct / 100, c.bruto,
                c.clabe, c.banco, c.saldo_previo, c.saldo_nuevo]
        for col, v in enumerate(vals, 1):
            cell = ws.cell(row=row_i, column=col, value=v)
            cell.border = border
            if c.saldo_nuevo < 0:
                cell.fill = neg_fill
                cell.font = Font(color="FF9090")
            elif c.monto_disputado:
                cell.fill = disp_fill
                cell.font = Font(color="FFEE90")

        # Formato numérico
        ws.cell(row=row_i, column=2).number_format = '#,##0.00'
        ws.cell(row=row_i, column=3).number_format = '0.0%'
        ws.cell(row=row_i, column=4).number_format = '#,##0.00'
        ws.cell(row=row_i, column=7).number_format = '#,##0.00'
        ws.cell(row=row_i, column=8).number_format = '#,##0.00'

    # Totales
    n = len(clientes) + 2
    total_row = [
        "TOTAL", f"=SUM(B2:B{n-1})", "",
        f"=SUM(D2:D{n-1})", "", "",
        f"=SUM(G2:G{n-1})", f"=SUM(H2:H{n-1})"
    ]
    for col, v in enumerate(total_row, 1):
        cell = ws.cell(row=n, column=col, value=v)
        cell.fill = ok_fill
        cell.font = bold_white
        cell.border = border

    # Metadata
    ws.cell(row=n + 2, column=1, value=f"Semana {semana} | Tier {tier} | {len(clientes)} clientes")
    ws.cell(row=n + 3, column=1,
            value=f"Negativos: {sum(1 for c in clientes if c.saldo_nuevo < 0)} | "
                  f"Disputados: {sum(1 for c in clientes if c.monto_disputado)}")

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Comprobante SPEI ──────────────────────────────────────────────────────────

def gen_comprobante_png(monto: float = 53000, tier: int = 1,
                        receptor: str = "GERMAN VILAR") -> bytes:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        raise ImportError("Pillow no instalado: ./setup-venv.sh")

    W, H = 500, 460
    img  = Image.new("RGB", (W, H), color=(245, 247, 250))
    draw = ImageDraw.Draw(img)

    # Header banco (color varía por tier para visual diversity)
    header_colors = [(0, 100, 180), (0, 130, 80), (120, 0, 180), (180, 80, 0)]
    hc = header_colors[tier - 1]
    draw.rectangle([0, 0, W, 85], fill=hc)
    bancos = ["BANREGIO", "BBVA", "BANAMEX", "BANORTE"]
    draw.text((20, 22), bancos[tier - 1], fill=(255, 255, 255))
    draw.text((20, 52), "Comprobante de transferencia SPEI", fill=(220, 240, 255))

    # Monto
    draw.rectangle([20, 105, W - 20, 175], fill=(240, 248, 255))
    draw.text((40, 118), "Monto transferido", fill=(100, 100, 100))
    draw.text((40, 143), f"${monto:,.2f} MXN", fill=(0, 80, 160))

    # Alerta si el monto es muy grande (tier 3+)
    if tier >= 3 and monto > 200000:
        draw.rectangle([20, 178, W - 20, 200], fill=(255, 240, 200))
        draw.text((30, 184), f"⚠️  Monto elevado — requiere validación", fill=(140, 100, 0))

    # Detalles
    clabe_receptor = random.choice([c for c, _ in CLABES])
    import random as _rnd
    details = [
        ("Fecha",        f"{_rnd.randint(1,28):02d}/05/2026 {_rnd.randint(8,20):02d}:{_rnd.randint(0,59):02d}"),
        ("Tipo",         "SPEI"),
        ("Referencia",   f"{_rnd.randint(100000, 999999)}"),
        ("Receptor",     receptor[:30]),
        ("CLABE dest.",  clabe_receptor),
        ("Banco dest.",  bancos[tier - 1]),
        ("Concepto",     f"SEM {_rnd.randint(10, 30)} LIQUIDACIÓN"),
        ("Estado",       "EXITOSA ✓"),
    ]
    # Tier 3: a veces el monto es diferente al acordado
    if tier >= 3 and _rnd.random() < 0.2:
        details.append(("NOTA", "Monto difiere del cuadro"))

    y = 205
    for label, val in details:
        draw.rectangle([20, y, W - 20, y + 30], fill=(255, 255, 255))
        draw.text((30,  y + 8), label + ":", fill=(120, 120, 120))
        draw.text((185, y + 8), val,          fill=(30,  30,  30))
        y += 32

    draw.rectangle([0, H - 42, W, H], fill=hc)
    draw.text((20, H - 28), f"Folio: {_rnd.randint(10000000, 99999999)}", fill=(200, 230, 255))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=87)
    return buf.getvalue()


# ── API pública ───────────────────────────────────────────────────────────────

def gen_for_tier(asset_type: str, tier: int) -> tuple[bytes, dict]:
    """
    Genera el asset y retorna (bytes, metadata).
    asset_type: 'cuadro_png' | 'cuadro_xlsx' | 'comprobante'
    """
    import random as _rnd
    semana = _rnd.randint(10, 52)

    if asset_type == "cuadro_png":
        n = {1: 2, 2: 3, 3: 4, 4: 6}.get(tier, 3) + _rnd.randint(0, 1)
        clientes = gen_clientes(tier, n)
        data = gen_cuadro_png(tier, semana, clientes)
        negativos = sum(1 for c in clientes if c.saldo_nuevo < 0)
        return data, {
            "semana": semana, "clientes": n, "tier": tier,
            "total_neto": sum(c.neto for c in clientes),
            "negativos": negativos,
            "caption": f"CUADRO RETORNO SEM{semana} — {n} clientes"
                       + (f" ⚠️{negativos} negativos" if negativos else ""),
        }

    elif asset_type == "cuadro_xlsx":
        n = {1: 3, 2: 4, 3: 5, 4: 7}.get(tier, 3)
        clientes = gen_clientes(tier, n)
        data = gen_cuadro_xlsx(tier, semana, clientes)
        return data, {
            "semana": semana, "clientes": n, "tier": tier,
            "filename": f"PARA_PAGO_SEM{semana}.xlsx",
            "caption": f"SEM {semana} — {n} registros",
        }

    else:  # comprobante
        montos = MONTOS_TIER1 if tier == 1 else MONTOS_TIER2 if tier == 2 \
            else MONTOS_TIER3 if tier == 3 else MONTOS_TIER4
        monto = _rnd.choice(montos)
        receptor = _rnd.choice([n.split()[0] + " " + n.split()[-1] for n in NOMBRES])
        data = gen_comprobante_png(monto, tier, receptor)
        return data, {"monto": monto, "tier": tier, "caption": "Comprobante ingreso"}

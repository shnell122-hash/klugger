"""
Enhanced price model per REAL_ESTATE_ROADMAP + user spec + mini-plan.
- Loads CLEAN comps (pure undeveloped terrenos/lotes sin construccion)
- Computes median $/m2 (user example: compare similar vacant land, median ppm * m2)
- Price vector: implied values per comp for target 660m2 + diff to asking
- Adjustments: + premium for CUS 2.4 / 12 units potential (most comps low-density single family lots)
- Also references reported market avg from Lamudi (~6433 $/m2 May 2026)
- Outputs valuation.json for dashboard consumption

Run: & 'C:/Users/noela/pill.ai/.venv/Scripts/python.exe' cases/terreno-cimatario-queretaro/modelo_precio_simple.py
"""

import csv
import json
import os
from statistics import mean, median
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(__file__)
CLEAN_JSON = os.path.join(BASE_DIR, "data", "comps_clean.json")
CLEAN_CSV = os.path.join(BASE_DIR, "data", "terrenos_similares_clean.csv")
OUT_JSON = os.path.join(BASE_DIR, "data", "valuation_output.json")

TARGET_M2 = 660.0
TARGET_ASKING = 7000000.0
TARGET_ASKING_PPM = TARGET_ASKING / TARGET_M2
TARGET_POTENTIAL_UNITS = 12
TARGET_CUS = 2.4
TARGET_COS = 0.60
TARGET_LOCATION = "Lic. Carlos Septien 53, Cimatario, Querétaro (CP 76030)"
# Per roadmap / mini-plan + user: + premium for high dev potential vs typical comps (CUS allows multifamily ~12 aptos)
POTENTIAL_MULTIPLIER = 1.40   # +40% for 12-unit density vs 1-2 unit low density lots (conservative; roadmap suggests +20-50%)
ZONE_PREMIUM = 1.05           # slight extra for exact high plusvalia spot vs avg in area

def load_clean_comps():
    comps = []
    # Prefer JSON clean (researched)
    if os.path.exists(CLEAN_JSON):
        with open(CLEAN_JSON, encoding="utf-8") as f:
            raw = json.load(f)
        for r in raw:
            p = float(r["price"])
            s = float(r["size_m2"])
            if p > 0 and s > 0:
                comps.append({
                    "price": p,
                    "size_m2": s,
                    "price_per_m2": p / s,
                    "title": r.get("title", ""),
                    "location": r.get("location", ""),
                    "link": r.get("link", ""),
                    "notes": r.get("notes", ""),
                })
    elif os.path.exists(CLEAN_CSV):
        with open(CLEAN_CSV, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                try:
                    p = float(row["price"])
                    s = float(row["size_m2"])
                    if p > 0 and s > 0:
                        comps.append({
                            "price": p, "size_m2": s, "price_per_m2": p/s,
                            "title": row.get("title",""), "location": row.get("location",""),
                            "link": row.get("link",""), "notes": row.get("notes","")
                        })
                except: pass
    else:
        print("No clean comps found. Run the seed first.")
    return comps

def compute_median_ppm(comps):
    ppms = [c["price_per_m2"] for c in comps]
    return median(ppms), mean(ppms), min(ppms), max(ppms)

def build_price_vector(comps, target_m2):
    """For each comp: implied value if applied to target size, delta vs asking"""
    vector = []
    for c in comps:
        implied = target_m2 * c["price_per_m2"]
        delta = implied - TARGET_ASKING
        pct = (delta / TARGET_ASKING) * 100
        vector.append({
            **c,
            "implied_for_target": round(implied),
            "delta_vs_asking": round(delta),
            "pct_vs_asking": round(pct, 1)
        })
    return vector

def main():
    comps = load_clean_comps()
    if not comps:
        return
    print(f"Loaded {len(comps)} CLEAN undeveloped comps (vacant land only)")
    med_ppm, avg_ppm, pmin, pmax = compute_median_ppm(comps)
    print(f"\nComps ppm stats (vacant lots):")
    print(f"  Median $/m2 : {med_ppm:,.0f}")
    print(f"  Mean $/m2   : {avg_ppm:,.0f}")
    print(f"  Range       : {pmin:,.0f} - {pmax:,.0f}")

    # Base models (user spec: mediana del precio/metro2 * metros del terreno)
    base_median = TARGET_M2 * med_ppm
    base_avg = TARGET_M2 * avg_ppm

    # Adjusted (roadmap + CUS dev potential + zone)
    # Formula: base * potential_mult * zone_mult
    adjusted_median = base_median * POTENTIAL_MULTIPLIER * ZONE_PREMIUM
    adjusted_avg = base_avg * POTENTIAL_MULTIPLIER * ZONE_PREMIUM

    # Market ref from Lamudi (scraped report May 2026): 6433 $/m2 for area
    LAMUDI_MARKET_PPM = 6433.0
    base_lamudi = TARGET_M2 * LAMUDI_MARKET_PPM
    adjusted_lamudi = base_lamudi * POTENTIAL_MULTIPLIER * ZONE_PREMIUM

    vector = build_price_vector(comps, TARGET_M2)

    print(f"\n=== VALUACIÓN COMERCIAL OBJETIVO ===")
    print(f"Target: {TARGET_M2:.0f} m² | Asking: ${TARGET_ASKING:,.0f} MXN (${TARGET_ASKING_PPM:,.0f}/m2)")
    print(f"Potencial desarrollo: COS {TARGET_COS} / CUS {TARGET_CUS} → ~{TARGET_POTENTIAL_UNITS} unidades")
    print(f"\n--- Modelos (fórmulas) ---")
    print(f"1. Base mediana (sin ajuste): ${base_median:,.0f}   = 660 × {med_ppm:,.0f}")
    print(f"2. Ajustado mediana (×{POTENTIAL_MULTIPLIER} CUS-potencial ×{ZONE_PREMIUM} zona): ${adjusted_median:,.0f}")
    print(f"3. Base promedio: ${base_avg:,.0f}")
    print(f"4. Ajustado promedio: ${adjusted_avg:,.0f}")
    print(f"5. Ref mercado Lamudi 6433/m2 base: ${base_lamudi:,.0f} → ajustado ${adjusted_lamudi:,.0f}")

    print(f"\n=== Comparación vector precios (comps aplicados a 660m2 vs asking) ===")
    for v in vector[:5]:
        sign = '+' if v['delta_vs_asking'] >= 0 else ''
        print(f"  {v['title'][:35]:35} | ${v['implied_for_target']:>10,.0f} ({sign}{v['pct_vs_asking']:.1f}%)")

    # Consensus: prefer median adjusted (robust to outliers)
    consensus_low = round(adjusted_median * 0.92)
    consensus_high = round(adjusted_median * 1.08)
    print(f"\nRango estimado comercial (ajustado): ${consensus_low:,.0f} - ${consensus_high:,.0f}")
    print(f"Asking vs consenso: {'Sobrevalorado' if TARGET_ASKING > adjusted_median else 'Alineado o subvalorado'}")

    # Persist for TSX dashboard
    out = {
        "generated_at": datetime.now(datetime.timezone.utc).isoformat().replace('+00:00', 'Z'),
        "target": {
            "m2": TARGET_M2,
            "asking_price": TARGET_ASKING,
            "asking_ppm": round(TARGET_ASKING_PPM, 0),
            "cus": TARGET_CUS,
            "cos": TARGET_COS,
            "potential_units": TARGET_POTENTIAL_UNITS,
            "location": TARGET_LOCATION,
        },
        "comps_stats": {
            "n": len(comps),
            "median_ppm": round(med_ppm, 0),
            "mean_ppm": round(avg_ppm, 0),
            "min_ppm": round(pmin, 0),
            "max_ppm": round(pmax, 0),
            "lamudi_market_ppm": LAMUDI_MARKET_PPM,
        },
        "models": {
            "base_median": round(base_median),
            "adjusted_median": round(adjusted_median),
            "base_mean": round(base_avg),
            "adjusted_mean": round(adjusted_avg),
            "lamudi_base": round(base_lamudi),
            "lamudi_adjusted": round(adjusted_lamudi),
            "potential_multiplier": POTENTIAL_MULTIPLIER,
            "zone_premium": ZONE_PREMIUM,
            "formula": "precio = m2 * mediana_ppm * multiplier_CUS_dev * multiplier_zona",
            "consensus_low": consensus_low,
            "consensus_high": consensus_high,
        },
        "price_vector": vector,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"\n[ok] Saved valuation_output.json → {OUT_JSON}")
    print("Usa este JSON + comps_clean.json para el dashboard TSX.")

if __name__ == "__main__":
    main()
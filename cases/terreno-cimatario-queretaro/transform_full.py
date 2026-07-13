#!/usr/bin/env python3
"""
Transform terrenos_full_real.json + terrenos_enriched.json into the final
terrenos_full.json consumed by the dashboard, with authoritative price/size/
coords/address pulled from the enriched meta payload.
"""
import json
import re
from pathlib import Path
from statistics import median

BASE = Path(__file__).parent
REAL_PATH = BASE / "data" / "terrenos_full_real.json"
ENRICHED_PATH = BASE / "data" / "terrenos_enriched.json"

OUT_PATHS = [
    BASE / "terrenos_full.json",
    BASE.parent.parent / "dashboard-financial" / "app" / "valuacion-cimatario" / "terrenos_full.json",
]

NUM_RE = re.compile(r"[^0-9.\-]")

# Cap de comparabilidad: excluir lotes rurales/industriales que no comparan
# con un terreno urbano de 660 m2 (sesgan mediana/regresion/escala del mapa).
MAX_SIZE_M2 = 5000


def parse_number(value):
    """Parse a number out of messy strings like '$1,234.00 MN' -> 1234.0"""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    # Remove currency symbols, commas, "MN", spaces, etc.
    s = s.replace(",", "")
    s = re.sub(r"(?i)\bmn\b", "", s)
    s = NUM_RE.sub("", s)
    s = s.strip(".-")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_float_or_none(value):
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def build_address(street, locality, region, postal):
    parts = []
    if street:
        parts.append(street.strip())
    if locality:
        parts.append(locality.strip())
    region_postal = " ".join(p for p in [region.strip() if region else "", postal.strip() if postal else ""] if p)
    if region_postal:
        parts.append(region_postal)
    # Remove duplicate consecutive parts and empty ones
    parts = [p for p in parts if p]
    return ", ".join(parts)


def build_location(locality, region, fallback):
    parts = [p.strip() for p in [locality, region] if p and p.strip()]
    if parts:
        return ", ".join(parts)
    return fallback


def main():
    with open(REAL_PATH, encoding="utf-8") as f:
        real = json.load(f)
    with open(ENRICHED_PATH, encoding="utf-8") as f:
        enriched = json.load(f)

    enriched_by_link = {}
    for e in enriched:
        link = e.get("link")
        if link and link not in enriched_by_link:
            enriched_by_link[link] = e

    output = []
    seen_links = set()

    discard_no_enrich_match = 0
    discard_missing_price_or_size = 0
    discard_dupe = 0
    discard_ppm_low = 0
    discard_ppm_high = 0
    discard_size_too_big = 0

    for comp in real:
        link = comp.get("link")

        if link in seen_links:
            discard_dupe += 1
            continue

        ent = enriched_by_link.get(link)
        meta = (ent or {}).get("meta") or {}

        # --- price: meta.offer_price authoritative, fallback to plain price ---
        price = parse_number(meta.get("offer_price"))
        if price is None or price <= 0:
            price = parse_number(comp.get("price"))

        # --- size_m2: meta.floor_size authoritative, fallback to plain size_m2 ---
        size_m2 = parse_number(meta.get("floor_size"))
        if size_m2 is None or size_m2 <= 0:
            size_m2 = parse_number(comp.get("size_m2"))

        if not price or price <= 0 or not size_m2 or size_m2 <= 0:
            discard_missing_price_or_size += 1
            continue

        if size_m2 > MAX_SIZE_M2:
            discard_size_too_big += 1
            continue

        ppm = price / size_m2
        if ppm < 500:
            discard_ppm_low += 1
            continue
        if ppm > 200000:
            discard_ppm_high += 1
            continue

        title = meta.get("name") or comp.get("title")
        location = build_location(meta.get("locality"), meta.get("region"), comp.get("location"))
        address = build_address(
            meta.get("street"), meta.get("locality"), meta.get("region"), meta.get("postal")
        )
        lat = parse_float_or_none(meta.get("lat"))
        lng = parse_float_or_none(meta.get("lng"))
        scraped_at = (ent or {}).get("scraped_at") or comp.get("scraped_at")

        out = {
            "price": price,
            "size_m2": size_m2,
            "title": title,
            "location": location,
            "address": address,
            "lat": lat,
            "lng": lng,
            "link": link,
            "source": comp.get("source"),
            "portal": "lamudi",
            "scraped_at": scraped_at,
        }
        output.append(out)
        seen_links.add(link)

    # --- report ---
    total = len(output)
    with_coords = sum(1 for o in output if o["lat"] is not None and o["lng"] is not None)
    prices = [o["price"] for o in output]
    ppms = [o["price"] / o["size_m2"] for o in output]
    example_com = sum(1 for o in output if "example.com" in (o["link"] or ""))

    print(f"Total output entries: {total}")
    print(f"With lat/lng: {with_coords}")
    print(f"Discarded - missing/invalid price or size: {discard_missing_price_or_size}")
    print(f"Discarded - duplicate link: {discard_dupe}")
    print(f"Discarded - ppm < 500: {discard_ppm_low}")
    print(f"Discarded - ppm > 200000: {discard_ppm_high}")
    print(f"Discarded - size > {MAX_SIZE_M2} m2: {discard_size_too_big}")
    print(f"price min/median/max: {min(prices):.2f} / {median(prices):.2f} / {max(prices):.2f}")
    print(f"ppm min/median/max: {min(ppms):.2f} / {median(ppms):.2f} / {max(ppms):.2f}")
    print(f"entries with example.com in link: {example_com}")
    print("Sample entries:")
    for o in output[:2]:
        print(json.dumps(o, indent=2, ensure_ascii=False))

    for out_path in OUT_PATHS:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)
        print(f"Wrote {total} entries to {out_path}")


if __name__ == "__main__":
    main()

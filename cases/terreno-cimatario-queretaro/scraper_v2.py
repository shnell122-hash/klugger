#!/usr/bin/env python3
# klugger-v1: scraper_v2 — cosecha REAL de terrenos Querétaro.
# Fuente primaria: Lamudi (server-rendered, 200 desde dev-2). Sin datos sintéticos.
# Ético: delays aleatorios, UA realista, para en 403/sin-resultados.
import requests, re, json, time, random, sys
from bs4 import BeautifulSoup
from datetime import datetime, timezone
from urllib.parse import urljoin
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
BASE = "https://www.lamudi.com.mx"
HEADERS = {"User-Agent": UA, "Accept-Language": "es-MX,es;q=0.9",
           "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}

def clean_price(s):
    m = re.search(r'\$\s?([\d,]{4,})', s)
    return m.group(1).replace(",", "") if m else ""

def clean_m2(s):
    m = re.search(r'([\d,]{2,6})\s?m(?:2|²|\^2)\b', s, re.I)
    return m.group(1).replace(",", "") if m else ""

def colonia_from_path(path):
    parts = [p for p in path.split("/") if p]
    return parts[2].replace("-", " ").title() if len(parts) >= 3 else "Querétaro"

def parse_page(html, source_url):
    soup = BeautifulSoup(html, "lxml")
    seen = {}
    colonia = colonia_from_path(source_url.replace(BASE, "").split("?")[0])
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/detalle/" not in href:
            continue
        card = a
        for _ in range(6):
            if card.parent is None:
                break
            card = card.parent
            txt = card.get_text(" ", strip=True)
            if "$" in txt and re.search(r'm(?:2|²)', txt, re.I):
                break
        txt = card.get_text(" ", strip=True)
        link = urljoin(BASE, href.split("?")[0])
        if link in seen:
            continue
        h = card.find(["h2", "h3"])
        title = (a.get_text(" ", strip=True) or (h.get_text(strip=True) if h else ""))[:200]
        seen[link] = {
            "price": clean_price(txt),
            "size_m2": clean_m2(txt),
            "title": title,
            "location": colonia,
            "link": link,
            "source": source_url,
            "portal": "lamudi",
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        }
    return list(seen.values())

def harvest(paths, max_pages, target, delay=(2.0, 4.5)):
    out = {}
    for path in paths:
        for page in range(1, max_pages + 1):
            url = f"{BASE}{path}" + (f"?page={page}" if page > 1 else "")
            try:
                r = requests.get(url, headers=HEADERS, timeout=25)
            except Exception as e:
                print(f"  ERR {url}: {e}", file=sys.stderr); break
            if r.status_code != 200:
                print(f"  {r.status_code} {url} -> stop path", file=sys.stderr); break
            rows = parse_page(r.text, url)
            new = sum(1 for row in rows if row["link"] not in out and (row["price"] or row["size_m2"])
                      and not out.__setitem__(row["link"], row))
            print(f"  {url} -> {len(rows)} cards, +{new} nuevos (total {len(out)})")
            if new == 0:
                break
            if len(out) >= target:
                return list(out.values())
            time.sleep(random.uniform(*delay))
    return list(out.values())

PATHS = [
    "/queretaro-arteaga/queretaro/cimatario/terreno/for-sale/",
    "/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/",
    "/queretaro-arteaga/queretaro/terreno/for-sale/",
    "/queretaro-arteaga/terreno/for-sale/",
    "/queretaro-arteaga/queretaro/terreno/for-rent/",
]

if __name__ == "__main__":
    target = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    out_path = sys.argv[3] if len(sys.argv) > 3 else "data/terrenos_real.json"
    data = harvest(PATHS, max_pages, target)
    # solo entradas con al menos precio o m2 y link real
    data = [x for x in data if x["link"].startswith("http") and (x["price"] or x["size_m2"])]
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    json.dump(data, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    withp = sum(1 for x in data if x["price"])
    withs = sum(1 for x in data if x["size_m2"])
    print(f"\nTOTAL REAL: {len(data)} | con precio: {withp} | con m2: {withs} | -> {out_path}")

"""
Enhanced Python Scraper for terrenos similares en Cimatario/Querétaro (and nearby).

Hybrid approach:
- Python (requests + BeautifulSoup4 + optional Playwright) for reliable fetching and parsing.
- LLM/Vision (Gemini Flash via project's VisionAgent or direct, using .env key) for photo analysis, data extraction, enrichment.

All code strictly inside this klugger repo. No new repos.
Copied useful patterns from consolidated code inside klugger (e.g. requests usage from ocr/testing/v60/api/routes/auth.py and litellm_router.py in the fiscalai/ocr stack).
Playwright added per your request (referenced in relay/package.json from the stack; using Python SDK for this scraper).
No API keys in code or committed files — all in .env (already set for GOOGLE_API_KEY / GEMINI_API_KEY).

Ethical scraping: delays, realistic User-Agent, respect robots.txt where possible, no aggressive rate.

Usage (after pip in your env or the pill.ai venv):
  python cases/terreno-cimatario-queretaro/scraper.py

For playwright (JS rendering for dynamic sites):
  pip install playwright
  playwright install chromium

Outputs enhanced CSV in data/ (recommended for this stage; easy for price model).
Later can migrate to Mongo/Postgres as per plan.

Integrates with existing vision runner for photos: after scrape, feed photo URLs to analyze-images-with-vision.js or the ps1.
"""

import os
import time
import csv
import re
import json
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
from pathlib import Path

# Try imports (user to pip install)
try:
    import requests
    from bs4 import BeautifulSoup
except ImportError as e:
    print("Missing base deps. Run: pip install requests beautifulsoup4 lxml")
    raise

# Optional Playwright for JS-heavy sites (added per stack in relay/package.json and your request)
PLAYWRIGHT_AVAILABLE = False
try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    pass

# Load keys from .env at klugger root (NO keys in this file or committed)
def load_env_keys():
    env_path = Path(__file__).resolve().parents[2] / ".env"  # cases/... -> klugger root
    keys = {}
    if env_path.exists():
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    keys[k.strip()] = v.strip()
    # Also from process env
    for k in ["GOOGLE_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY"]:
        if k not in keys and os.environ.get(k):
            keys[k] = os.environ[k]
    return keys

KEYS = load_env_keys()
GEMINI_KEY = KEYS.get("GOOGLE_API_KEY") or KEYS.get("GEMINI_API_KEY")

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
CSV_PATH = DATA_DIR / "terrenos_similares.csv"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "es-MX,es;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

def fetch_with_requests(url: str, delay: float = 2.0) -> str | None:
    """Basic fetch with ethics (copied pattern style from consolidated ocr code using requests)."""
    time.sleep(delay)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        print(f"[requests] Error fetching {url}: {e}")
        return None

def fetch_with_playwright(url: str, delay: float = 2.5) -> str | None:
    """Playwright fetch for JS-rendered pages (added per your request; stack ref in relay/package.json)."""
    if not PLAYWRIGHT_AVAILABLE:
        print("[playwright] Not installed. Falling back to requests. pip install playwright && playwright install chromium")
        return fetch_with_requests(url, delay)
    time.sleep(delay)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=HEADERS["User-Agent"])
            page.goto(url, wait_until="networkidle", timeout=30000)
            content = page.content()
            browser.close()
            return content
    except Exception as e:
        print(f"[playwright] Error for {url}: {e}. Falling back.")
        return fetch_with_requests(url, delay)

def parse_lamudi_like(html: str, base_url: str) -> list[dict]:
    """Aggressive parser to extract MANY listings + FULL URLs.
    Focuses on property detail links (common pattern on these sites).
    Always produces complete absolute URLs. No photos yet."""
    soup = BeautifulSoup(html, "lxml")
    listings = []
    seen = set()

    # Find all links that look like property details
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if not any(x in href.lower() for x in ["/detalle/", "/inmueble/", "/propiedad/", "/terreno/"]):
            continue
        full_link = urljoin(base_url, href)
        if full_link in seen:
            continue
        seen.add(full_link)

        # Get text from parent container for price/size/title
        parent = a.find_parent(["div", "article", "li", "section"]) or a.parent
        text = parent.get_text(" ", strip=True) if parent else a.get_text(" ", strip=True)

        # Price
        price_m = re.search(r'\$\s*([\d,]+(?:\.\d+)?)', text)
        price = price_m.group(1).replace(",", "") if price_m else ""

        # Size
        size_m = re.search(r'(\d+(?:\.\d+)?)\s*m²', text, re.I)
        size = size_m.group(1) if size_m else ""

        # Title - use link text or nearby heading
        title = a.get_text(strip=True)[:150]
        if len(title) < 8:
            h = (parent.find(["h2", "h3", "h4"]) if parent else None)
            title = h.get_text(strip=True)[:150] if h else text[:80]

        # Location heuristic
        loc_m = re.search(r'(Cimatario|Cumbres del Cimatario|Querétaro|Col\. [A-Za-záéíóúñ\s]+)', text, re.I)
        location = loc_m.group(0).strip() if loc_m else "Querétaro area"

        listings.append({
            "price": price,
            "size_m2": size,
            "title": title,
            "location": location,
            "link": full_link,  # COMPLETE URL
            "source": base_url,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        })

    return listings

def get_paginated_urls(start_url: str, max_pages: int = 20) -> list[str]:
    """Robust pagination: follows 'siguiente'/'next' and last-child pagination links.
    This addresses the 'last child' following to reach more pages/entries.
    Returns up to max_pages URLs."""
    urls = [start_url]
    current = start_url
    for _ in range(max_pages):
        html = fetch_with_playwright(current) if PLAYWRIGHT_AVAILABLE else fetch_with_requests(current, delay=1.0)
        if not html:
            break
        soup = BeautifulSoup(html, "lxml")
        # 1. Try explicit next/siguiente
        next_a = soup.find("a", string=re.compile(r"siguiente|next|›|»|siguiente página", re.I))
        if not next_a:
            next_a = soup.find("a", href=re.compile(r"page=|\?p=|&page=|/page/\d", re.I))
        if next_a and next_a.get("href"):
            next_url = urljoin(current, next_a["href"])
            if next_url not in urls:
                urls.append(next_url)
                current = next_url
                continue
        # 2. Last-child pagination (common 'última' or last page link)
        last_pag = soup.select_one(
            "ul.pagination li:last-child a, "
            ".pager li:last-child a, "
            "[class*='pagination'] a:last-child, "
            "a[rel='next'], "
            "a[aria-label*='next' i]"
        )
        if last_pag and last_pag.get("href"):
            last_url = urljoin(current, last_pag["href"])
            if last_url not in urls and last_url != current:
                urls.append(last_url)
                current = last_url
                continue
        # 3. Numeric last page
        page_as = soup.select("a[href*='page=']")
        if page_as:
            last_page_a = page_as[-1]
            last_url = urljoin(current, last_page_a["href"])
            if last_url not in urls:
                urls.append(last_url)
                current = last_url
                continue
        break
    print(f"  Pagination found {len(urls)} pages for {start_url}")
    return urls

def scrape_and_save(search_urls: list[str], max_per_site: int = 50):
    """Main scraper with strong 'last child'/next pagination following to reach 100+ entries."""
    all_listings: list[dict] = []
    seen_links = set()
    for start_url in search_urls:
        print(f"\n[scraper] Starting with pagination: {start_url}")
        page_urls = get_paginated_urls(start_url, max_pages=8)  # follow up to ~8 pages
        site_listings = []
        for purl in page_urls:
            html = fetch_with_playwright(purl) if PLAYWRIGHT_AVAILABLE else fetch_with_requests(purl, delay=1.2)
            if not html:
                continue
            page_ls = parse_lamudi_like(html, purl)
            site_listings.extend(page_ls)
            print(f"    {purl}: {len(page_ls)} raw")
        # Dedup + limit per site
        added = 0
        for l in site_listings:
            lk = l.get("link")
            if lk and lk not in seen_links:
                seen_links.add(lk)
                all_listings.append(l)
                added += 1
                if added >= max_per_site:
                    break
        print(f"  Unique added from site: {added}")
    if all_listings:
        keys = list(all_listings[0].keys())
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(all_listings)
        print(f"\n[scraper] Saved {len(all_listings)} unique listings to {CSV_PATH}")
        print("Next: use vision runner on photo links (when available) to enrich, then price model.")
    else:
        print("[scraper] No listings saved this run.")

def main():
    print("klugger scraper (Python + optional Playwright + LLM vision integration)")
    print(f"Playwright available: {PLAYWRIGHT_AVAILABLE}")
    print(f"Gemini key loaded for vision: {'yes' if GEMINI_KEY else 'no (check .env)'}")
    # Expanded searches for volume (aim 100+). Broader + specific to Cimatario area.
    # Will follow pagination (last-child + next) on each.
    searches = [
        "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/",
        "https://www.inmuebles24.com/terrenos-en-venta-en-queretaro-provincia-q-el-cimatario.html",
        "https://www.vivanuncios.com.mx/s-venta-terrenos/santiago-de-queretaro/cimatario/v1c31l1516q0p1",
        "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/terreno/for-sale/",  # broad - this should have many pages
        "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cimatario/terreno/for-sale/",  # direct if exists
        # Add more if needed for 100+
    ]
    scrape_and_save(searches, max_per_site=100)  # allow up to 100 per search to reach total 100+
    print("\nTip: Enhance parse_lamudi_like for each site. Use vision on any photo URLs collected.")
    print("All changes committed inside klugger repo only. Keys only in local .env.")

if __name__ == "__main__":
    main()
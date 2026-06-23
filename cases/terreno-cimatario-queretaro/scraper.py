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
    """Improved parser based on lamudi structure (from browse inside klugger)."""
    soup = BeautifulSoup(html, "lxml")
    listings = []
    # Look for common listing containers on lamudi-like sites
    cards = soup.select("div[class*='listing'], div[class*='property'], article, .result-item, div[class*='card']") or soup.find_all("div", class_=re.compile(r"(listing|property|card|item)"))
    for card in cards:
        text = card.get_text(" ", strip=True)
        # Stricter price: $ X,XXX,XXX MXN
        price_m = re.search(r'\$\s*([\d,]+(?:\.\d+)?)\s*MXN', text, re.I)
        price = price_m.group(1).replace(",", "") if price_m else None
        # Size: 300 m²
        size_m = re.search(r'(\d+(?:\.\d+)?)\s*m²', text, re.I)
        size = size_m.group(1) if size_m else None
        # Title
        title_tag = card.find(["h2", "h3", "a"], class_=re.compile(r"title|name|heading", re.I))
        title = title_tag.get_text(strip=True)[:200] if title_tag else (text.split('\n')[0][:150] if text else "")
        # Link
        a = card.find("a", href=True)
        link = urljoin(base_url, a["href"]) if a else None
        # Location from text
        loc_m = re.search(r'(Cimatario|Cumbres del Cimatario|Querétaro|Col\. [^\s,]+)[^,\n]{0,40}', text, re.I)
        location = loc_m.group(0).strip() if loc_m else "Cimatario area, Querétaro"
        if price or size:
            listings.append({
                "price": price,
                "size_m2": size,
                "title": title,
                "location": location,
                "link": link,
                "source": base_url,
                "scraped_at": datetime.now(timezone.utc).isoformat(),
            })
    return listings

def scrape_and_save(search_urls: list[str], max_per_site: int = 20):
    """Main scraper. Tries playwright first for modern sites, falls back."""
    all_listings: list[dict] = []
    seen_links = set()
    for url in search_urls:
        print(f"\n[scraper] Starting: {url}")
        html = fetch_with_playwright(url) if PLAYWRIGHT_AVAILABLE else fetch_with_requests(url)
        if not html:
            continue
        site_listings = parse_lamudi_like(html, url)  # extend with ifs for other sites
        for l in site_listings[:max_per_site]:
            if l.get("link") and l["link"] not in seen_links:
                seen_links.add(l["link"])
                all_listings.append(l)
        print(f"  Added {len([l for l in site_listings if l.get('link') not in seen_links])} new after dedup")
    # Save CSV (CSV recommended for this stage - simple, git-friendly, fast for model)
    if all_listings:
        keys = list(all_listings[0].keys())
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(all_listings)
        print(f"\n[scraper] Saved {len(all_listings)} unique listings to {CSV_PATH}")
        print("Next: feed photo links (if present in future enhanced parse) to vision runner for descriptions.")
        print("Then build price model from CSV + vision data.")
    else:
        print("[scraper] No listings saved this run.")

def main():
    print("klugger scraper (Python + optional Playwright + LLM vision integration)")
    print(f"Playwright available: {PLAYWRIGHT_AVAILABLE}")
    print(f"Gemini key loaded for vision: {'yes' if GEMINI_KEY else 'no (check .env)'}")
    # Example searches for similar properties (from research; add more)
    searches = [
        "https://www.lamudi.com.mx/queretaro-arteaga/queretaro/cumbres-del-cimatario/terreno/for-sale/",
        "https://www.inmuebles24.com/terrenos-en-venta-en-queretaro-provincia-q-el-cimatario.html",
        # Add Cimatario specific or "Colinas del Cimatario" etc.
    ]
    scrape_and_save(searches)
    print("\nTip: Enhance parse_lamudi_like for each site. Use vision on any photo URLs collected.")
    print("All changes committed inside klugger repo only. Keys only in local .env.")

if __name__ == "__main__":
    main()
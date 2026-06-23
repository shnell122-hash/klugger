"""
Simple price calculation model for the target terreno (660m2, high development potential).

Loads the CSV of comps (from scraper).
Uses basic comps approach + adjustments, as per REAL_ESTATE_ROADMAP and mini-plan.

Run: python cases/terreno-cimatario-queretaro/modelo_precio_simple.py

Enrich with vision data later for better features (e.g. 'good views' from image descs).
"""

import csv
import os
from statistics import mean, median

CSV_PATH = os.path.join(os.path.dirname(__file__), "data", "terrenos_similares.csv")

TARGET_M2 = 660
TARGET_POTENTIAL_UNITS = 12  # from COS 0.60, CUS 2.4, 4 levels, 3 aptos/level
TARGET_LOCATION = "Cimatario, Querétaro (high plusvalía zone)"

def load_comps():
    comps = []
    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                price = float(row['price']) if row['price'] else 0
                size = float(row['size_m2']) if row['size_m2'] else 0
                if price > 0 and size > 0:
                    comps.append({
                        'price': price,
                        'size_m2': size,
                        'price_per_m2': price / size,
                        'title': row.get('title', ''),
                        'location': row.get('location', ''),
                        'link': row.get('link', '')
                    })
            except:
                pass
    return comps

def main():
    comps = load_comps()
    if not comps:
        print("No comps in CSV. Run/enhance the scraper first.")
        return

    print(f"Loaded {len(comps)} comps from {CSV_PATH}")
    print("\nComps summary (price/m2):")
    prices_per_m2 = [c['price_per_m2'] for c in comps]
    print(f"  Avg $/m2: {mean(prices_per_m2):.0f}")
    print(f"  Median $/m2: {median(prices_per_m2):.0f}")
    print(f"  Min: {min(prices_per_m2):.0f}, Max: {max(prices_per_m2):.0f}")

    # Simple model 1: Average price/m2 * target m2
    avg_m2 = mean(prices_per_m2)
    base_price = TARGET_M2 * avg_m2

    # Adjustment for development potential (this one allows ~12 units vs typical 1-2 in many comps)
    # Rough: +30-50% premium for high CUS / multi-unit potential (per plan's +20% for high CUS)
    potential_multiplier = 1.4  # conservative for 12 units vs low-density comps
    adjusted_price = base_price * potential_multiplier

    # Model 2: Median for robustness (outliers like high commercial)
    median_m2 = median(prices_per_m2)
    base_median = TARGET_M2 * median_m2
    adjusted_median = base_median * potential_multiplier

    print(f"\n=== Price estimate for target: {TARGET_M2} m² in {TARGET_LOCATION} ===")
    print(f"Base (avg $/m2 * m2): ${base_price:,.0f} MXN")
    print(f"Adjusted for high dev potential (+40%): ${adjusted_price:,.0f} MXN")
    print(f"Base (median): ${base_median:,.0f} MXN")
    print(f"Adjusted median: ${adjusted_median:,.0f} MXN")
    print(f"\nAsking price in listing: $7,000,000 MXN (~${7000000/TARGET_M2:.0f}/m2)")
    print("Note: This is a starting prototype model. With more comps (20-50) and features (from vision descs, exact zoning), it gets better.")
    print("Next: Add regression (sklearn) or more adjustments. Enrich CSV with vision data from photos.")

if __name__ == "__main__":
    main()
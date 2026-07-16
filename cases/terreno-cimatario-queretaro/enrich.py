#!/usr/bin/env python3
# klugger-v1: enriquecedor de metadata completa desde páginas de detalle Lamudi (Referer + delays).
import requests, re, json, time, random, sys
from bs4 import BeautifulSoup
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

def enrich_one(x):
    h={"User-Agent":UA,"Accept-Language":"es-MX,es","Referer":x.get("source") or "https://www.lamudi.com.mx/"}
    try:
        html=requests.get(x["link"], headers=h, timeout=25).text
    except Exception as e:
        return {**x, "_enrich":"error"}
    if len(html)<1000: return {**x,"_enrich":"blocked_empty"}
    meta={}
    for b in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try: j=json.loads(b)
        except: continue
        for o in (j if isinstance(j,list) else [j]):
            for it in (o.get("@graph",[o]) if isinstance(o,dict) else [o]):
                if isinstance(it,dict) and it.get("@type")=="RealEstateListing":
                    addr=it.get("address",{}) if isinstance(it.get("address"),dict) else {}
                    geo=it.get("geo",{}) if isinstance(it.get("geo"),dict) else {}
                    fs=it.get("floorSize",{}) if isinstance(it.get("floorSize"),dict) else {}
                    off=it.get("offers",{}) if isinstance(it.get("offers"),dict) else {}
                    meta={
                        "name": it.get("name","")[:200],
                        "description": (it.get("description","") or "")[:600],
                        "street": addr.get("streetAddress",""),
                        "locality": addr.get("addressLocality",""),
                        "region": addr.get("addressRegion",""),
                        "postal": addr.get("postalCode",""),
                        "lat": geo.get("latitude"),
                        "lng": geo.get("longitude"),
                        "floor_size": fs.get("value"),
                        "floor_unit": fs.get("unitText") or fs.get("unitCode"),
                        "offer_price": off.get("price"),
                        "offer_currency": off.get("priceCurrency"),
                        "images": (it.get("image") if isinstance(it.get("image"),list) else [it.get("image")])[:6],
                    }
    return {**x, **({"meta":meta,"_enrich":"ok"} if meta else {"_enrich":"no_ld"})}

if __name__=="__main__":
    infile=sys.argv[1]; n=int(sys.argv[2]) if len(sys.argv)>2 else 3
    d=json.load(open(infile,encoding="utf-8"))[:n]
    out=[]
    for i,x in enumerate(d):
        r=enrich_one(x); out.append(r)
        m=r.get("meta",{})
        print(f"[{i+1}] {r['_enrich']} | {m.get('locality','')},{m.get('region','')} | geo {m.get('lat')},{m.get('lng')} | {m.get('floor_size')}{m.get('floor_unit','')} | ${m.get('offer_price')}")
        time.sleep(random.uniform(1.5,3.0))
    json.dump(out, open("data/_enrich_sample.json","w",encoding="utf-8"), ensure_ascii=False, indent=2)
    print("ok:", sum(1 for r in out if r["_enrich"]=="ok"),"/",len(out))

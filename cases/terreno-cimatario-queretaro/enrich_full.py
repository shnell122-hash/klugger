#!/usr/bin/env python3
# klugger-v1: enriquecedor Lamudi por lotes con presupuesto de tiempo. Reanudable.
import requests, re, json, time, random, sys, os
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
IN="data/terrenos_real.json"; OUT="data/terrenos_enriched.json"
BUDGET=int(sys.argv[1]) if len(sys.argv)>1 else 500

def enrich_one(x):
    h={"User-Agent":UA,"Accept-Language":"es-MX,es","Referer":x.get("source") or "https://www.lamudi.com.mx/"}
    try:
        r=requests.get(x["link"],headers=h,timeout=20); r.encoding="utf-8"; html=r.text
    except Exception: return {**x,"_enrich":"error"}
    if len(html)<50000: return {**x,"_enrich":"blocked_empty"}
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
                    return {**x,"_enrich":"ok","meta":{"name":it.get("name","")[:200],
                        "description":(it.get("description","")or"")[:600],"street":addr.get("streetAddress",""),
                        "locality":addr.get("addressLocality",""),"region":addr.get("addressRegion",""),
                        "postal":addr.get("postalCode",""),"lat":geo.get("latitude"),"lng":geo.get("longitude"),
                        "floor_size":fs.get("value"),"floor_unit":fs.get("unitText") or fs.get("unitCode"),
                        "offer_price":off.get("price"),"offer_currency":off.get("priceCurrency"),
                        "availability":off.get("availability",""),
                        "images":[i for i in ((it.get("image") if isinstance(it.get("image"),list) else [it.get("image")]) or []) if i][:6]}}
    return {**x,"_enrich":"no_ld"}

data=json.load(open(IN,encoding="utf-8"))
done={}
if os.path.exists(OUT):
    for r in json.load(open(OUT,encoding="utf-8")):
        if r.get("_enrich")=="ok": done[r["link"]]=r
out=[]; t0=time.time(); processed=0
for x in data:
    if x["link"] in done: out.append(done[x["link"]]); continue
    if time.time()-t0 > BUDGET:
        out.append(x)  # dejar sin enriquecer, se retoma
        continue
    out.append(enrich_one(x)); processed+=1
    time.sleep(random.uniform(1.2,2.2))
json.dump(out,open(OUT,"w",encoding="utf-8"),ensure_ascii=False)
ok=sum(1 for r in out if r.get("_enrich")=="ok")
pend=sum(1 for r in out if "_enrich" not in r)
print(f"lote: procesados {processed} | ok_total {ok}/{len(out)} | pendientes {pend} | {time.time()-t0:.0f}s")

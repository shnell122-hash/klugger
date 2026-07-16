#!/usr/bin/env python3
# klugger-v1: enricher Lamudi vía IPRoyal (rotación IP + concurrencia). Reanudable.
import os, requests, re, json, time, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
IN="data/terrenos_real.json"; OUT="data/terrenos_enriched.json"
TOK=os.environ.get("IP_ROYAL_LA_API_TOKEN","").strip()
sub=requests.get("https://resi-api.iproyal.com/v1/residential-subusers",headers={"Authorization":f"Bearer {TOK}"},timeout=20).json()["data"][0]
PROXY=f"http://{sub['username']}:{sub['password']}@geo.iproyal.com:12321"
PX={"http":PROXY,"https":PROXY}

def enrich_one(x):
    h={"User-Agent":UA,"Accept-Language":"es-MX,es","Referer":x.get("source") or "https://www.lamudi.com.mx/"}
    for attempt in range(3):
        try:
            r=requests.get(x["link"],headers=h,proxies=PX,timeout=45); r.encoding="utf-8"; html=r.text
        except Exception:
            continue
        if len(html)<50000: continue
        for b in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.S):
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
    return {**x,"_enrich":"blocked_empty"}

data=json.load(open(IN,encoding="utf-8"))
done={}
if os.path.exists(OUT):
    for r in json.load(open(OUT,encoding="utf-8")):
        if r.get("_enrich")=="ok": done[r["link"]]=r
todo=[x for x in data if x["link"] not in done]
print(f"a enriquecer: {len(todo)} (ya ok: {len(done)})", flush=True)
res=dict(done); t0=time.time(); n=0
with ThreadPoolExecutor(max_workers=8) as ex:
    futs={ex.submit(enrich_one,x):x for x in todo}
    for f in as_completed(futs):
        r=f.result(); res[r["link"]]=r; n+=1
        if n%50==0:
            json.dump(list(res.values()),open(OUT,"w",encoding="utf-8"),ensure_ascii=False)
            ok=sum(1 for v in res.values() if v.get("_enrich")=="ok")
            print(f"  {n}/{len(todo)} | ok_total {ok} | {time.time()-t0:.0f}s", flush=True)
out=[res.get(x["link"],x) for x in data]
json.dump(out,open(OUT,"w",encoding="utf-8"),ensure_ascii=False)
ok=sum(1 for r in out if r.get("_enrich")=="ok")
print(f"DONE | ok {ok}/{len(out)} | {time.time()-t0:.0f}s", flush=True)

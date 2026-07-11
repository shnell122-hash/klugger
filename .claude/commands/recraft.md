---
description: Generar arte isométrico ilustrado de marca (Klugger) con Recraft v3 en fal.ai — estilo "Where's Waldo", paleta de marca controlada, sin texto/logo. Incluye los gotchas aprendidos (límite 1000 chars, parámetro colors, endpoints, extracción de paleta, composición de logo).
argument-hint: <descripción de la escena/hitos> [--palette A|B|C] [--ref imagen] [--logo]
---

# /recraft — Arte isométrico de marca con Recraft v3

Produce ilustraciones tipo **mapa isométrico "Where's Waldo"** (vector plano, líneas gruesas, alta densidad) para Klugger, con la **paleta de marca controlada** y **sin texto ni logo** (por defecto). Corre en **dev-2** con la key de fal desde Infisical.

## Cuándo usarlo
Generar hero/ilustraciones de secciones/escenarios (ciudades, colonias, hitos) en el estilo canónico de Klugger. Para **arte estético fino, el juez es el operador (german)** — el agente genera candidatos técnicos; german cruza con su proceso multi-IA y decide.

---

## Infra y credenciales

- **Host:** dev-2 (tiene python3, PIL, y acceso a Infisical). Acceso: `ssh dev-2` (ProxyJump Mac→turazive→dev-2, ya en `~/.ssh/config`).
- **fal key:** secreto `Fal.ai` en Infisical (proyecto Vilar-infra `a9fa59c9-26a9-4417-a035-ac8d857c7e50`, env=**staging**). Fetch con la machine identity (env `INFISICAL_CLIENT_ID`/`INFISICAL_CLIENT_SECRET`):

```bash
TOKEN=$(infisical login --method=universal-auth --client-id="$INFISICAL_CLIENT_ID" --client-secret="$INFISICAL_CLIENT_SECRET" --domain=https://sha.vilarkptl.com --plain --silent)
gv(){ curl -s -H "Authorization: Bearer $TOKEN" "https://sha.vilarkptl.com/api/v3/secrets/raw/$1?workspaceId=a9fa59c9-26a9-4417-a035-ac8d857c7e50&environment=staging" | python3 -c 'import sys,json;print(json.load(sys.stdin)["secret"]["secretValue"])'; }
export FAL_KEY=$(gv Fal.ai)
```

## Endpoints (fal)
- **Text-to-image:** `POST https://fal.run/fal-ai/recraft-v3`
- **Image-to-image:** `POST https://fal.run/fal-ai/recraft/v3/image-to-image` (¡ojo el path: `recraft/v3/`, NO `recraft-v3/`!) — params `image_url` (URL o data-URI) + `strength` (0–1).
- Header `Authorization: Key $FAL_KEY`. Respuesta: `images[0].url` → descargar.

## Gotchas aprendidos (IMPORTANTES)
1. **Prompt máximo 1000 caracteres.** Más largo → HTTP 422 `string_too_long`. Recorta descripciones de hitos.
2. **Paleta con el parámetro `colors`** = lista de `{"r","g","b"}`. Guía (no clava al 100%) la paleta; da 6–10 colores.
3. **Sin texto:** incluir explícito `NO text, NO letters, NO words, NO logos, NO signs`. Aun así puede colarse texto (Recraft es de los más obedientes; Ideogram cuela más).
4. **`style`:** `digital_illustration` para el look vector plano (también `vector_illustration`). `image_size`: `landscape_4_3` / `square_hd` / `portrait_4_3`.
5. **Logo:** NO embeber en la generación (se distorsiona). Si se requiere, **componer el PNG oficial después** (PIL) sobre el cielo, sin caja blanca (ver §logo). Por defecto: sin logo.
6. **Modelo por tarea (comparado esta sesión):** Recraft v3 = vector limpio/marca ✅ · Ideogram v3 = más rico pero cuela texto · Gemini 3 Pro Image = mejor image-to-image fiel · FLUX Kontext = acerca/simplifica · **Grok Imagine = 403 (no disponible por API)**.

## Paleta de marca (de `estudios_mercado/paletas-color.md`)
Oficiales (intocables): Verde1 `#2ED666`, Verde2 `#29BF5C`, gris `#3B3B3B`. Degradado verde→azul (azul propuesto `#2E9BD6`). Tres paletas de arte:
- **A · Vibrante (hero):** `#2ED666 #8FE0B0 #2FB8A8 #E8845C #E8C89A #C0503C #F2A8C8 #6B7A8F #EAD9A2 #1E201C`
- **B · Cool/degradado (devs):** `#2ED666 #29BF5C #2FB8A8 #2E9BD6 #56B8E6 #E8845C #3B3B3B #B8C0C4`
- **C · Clara/amigable (consumidor):** `#5FD08A #6FC5BC #F2C6A0 #F6EACB #F6C6DC #E8F4FF #F4F6F5 #3B3B3B`

## Estilo base del prompt (reutilizar, ≤1000 chars con los hitos)
> "Highly detailed isometric illustrated map of {LUGAR}, vibrant flat-vector 'Where's Waldo' style, thick clean black outlines, dense tiny details (people, cars, trees, stalls). Landmarks: {HITOS}. Isometric top-down view. NO text, NO letters, NO words, NO logos, NO signs."

---

## Script base (adaptar {LUGAR}/{HITOS}/paleta y correr en dev-2)

```python
import os,json,urllib.request,urllib.error
FAL=os.environ["FAL_KEY"]
def hexs(*hh): return [{"r":int(h.lstrip('#')[0:2],16),"g":int(h.lstrip('#')[2:4],16),"b":int(h.lstrip('#')[4:6],16)} for h in hh]
PAL={"A":hexs("#2ED666","#8FE0B0","#2FB8A8","#E8845C","#E8C89A","#C0503C","#F2A8C8","#6B7A8F","#EAD9A2","#1E201C"),
     "B":hexs("#2ED666","#29BF5C","#2FB8A8","#2E9BD6","#56B8E6","#E8845C","#3B3B3B","#B8C0C4"),
     "C":hexs("#5FD08A","#6FC5BC","#F2C6A0","#F6EACB","#F6C6DC","#E8F4FF","#F4F6F5","#3B3B3B")}
PROMPT=("Highly detailed isometric illustrated map of MEXICO CITY, vibrant flat-vector 'Where's Waldo' style, thick clean black outlines, dense tiny details. Landmarks: LIST_HERE. Isometric top-down view. NO text, NO letters, NO words, NO logos, NO signs.")
assert len(PROMPT)<=1000, f"prompt {len(PROMPT)}>1000"
payload={"prompt":PROMPT,"style":"digital_illustration","image_size":"landscape_4_3","colors":PAL["A"]}
r=urllib.request.Request("https://fal.run/fal-ai/recraft-v3",data=json.dumps(payload).encode(),
    headers={"Authorization":f"Key {FAL}","Content-Type":"application/json"},method="POST")
url=json.loads(urllib.request.urlopen(r,timeout=200).read())["images"][0]["url"]
urllib.request.urlretrieve(url,"out.jpg"); print("OK",url)
```

## Extraer paleta de una imagen de referencia (si el operador da un --ref)
```python
from PIL import Image
im=Image.open("ref.png").convert("RGB"); q=im.quantize(colors=16,method=Image.MEDIANCUT); pal=q.getpalette()
colors=[]
for cnt,idx in sorted(q.getcolors(),reverse=True):
    r,g,b=pal[idx*3:idx*3+3]
    if (r>238 and g>238 and b>238) or (r<22 and g<22 and b<22): continue   # descarta casi-blanco/negro
    colors.append({"r":int(r),"g":int(g),"b":int(b)})
    if len(colors)>=8: break
```

## Logo (si --logo) — componer el PNG oficial, NO regenerar
Logo oficial = `dashboard-financial/public/assets/klugger-logo-vectorized.png` (branch testing). Componer con alpha sobre el cielo (arriba-centro, ~22% ancho, SIN caja blanca para que no se vea encimado):
```python
from PIL import Image
im=Image.open("out.jpg").convert("RGBA"); logo=Image.open("logo.png").convert("RGBA")
W,H=im.size; lw=int(W*0.22); lh=int(logo.height*lw/logo.width); lg=logo.resize((lw,lh))
im.alpha_composite(lg,((W-lw)//2,int(H*0.03))); im.convert("RGB").save("out_logo.jpg",quality=93)
```

## Entrega
Descargar a la Mac (`scp dev-2:/tmp/.../out.jpg .`) y entregar con **SendUserFile** (`display:"render"`). Presentar como candidatos técnicos, no como arte final — german valida.

## Costo
fal.ai flux/recraft ≈ centavos por imagen. Batch chico está bien; no generar cientos sin validación del operador (regla: pocas piezas → validar → escalar).

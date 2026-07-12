---
description: Desplegar la plataforma Klugger (dashboard-financial Next.js) a producción klugger.shnell.mx. OJO: el Pages project "klugger" es DIRECT UPLOAD (no auto-deploy por git push). El deploy = build estático + wrangler pages deploy out/. Corre en dev-2. Verificado 2026-07-12.
argument-hint: [rama=testing] [--preview]
---

# /deploy — Desplegar Klugger a klugger.shnell.mx

**Hecho crítico (verificado 2026-07-12):** el proyecto **Cloudflare Pages `klugger`** (domains: `klugger.pages.dev`, `klugger.shnell.mx`) es de **DIRECT UPLOAD** — `production_branch`, `build_command` y `destination_dir` están en **null**. **Un `git push` (a `main` o `testing`) NO despliega nada.** El deploy real = **build estático local + `wrangler pages deploy out/`**. El contenido de producción vive en la rama **`testing`** (dashboard de 9 tabs + leaflet); `main` diverge.

## Cuándo usarlo
Publicar cambios del front (`dashboard-financial/`) a producción. Correr **en dev-2** (tiene node 20 + red). NO desde el sandbox (bloquea salida a klugger.shnell.mx).

## Credenciales (Infisical, proyecto Vilar-infra `a9fa59c9-26a9-4417-a035-ac8d857c7e50`)
- `GITHUB_PAT_TOKEN` (staging) — para clonar el repo privado.
- `CLOUDFLARE_API_TOKEN` (prod) — tiene acceso a Pages (verificado). Account ID: `1f1f32da6e12d11e8a71f58a9faa4718`.

## Procedimiento (copiar/pegar en dev-2 vía `ssh dev-2 'bash -s' <<REMOTE`)
```bash
CID='...'; CSECRET='...'; DOM='https://sha.vilarkptl.com'; PID='a9fa59c9-26a9-4417-a035-ac8d857c7e50'
TOKEN=$(infisical login --method=universal-auth --client-id="$CID" --client-secret="$CSECRET" --domain="$DOM" --plain --silent)
gv(){ curl -s -H "Authorization: Bearer $TOKEN" "$DOM/api/v3/secrets/raw/$1?workspaceId=$PID&environment=$2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["secret"]["secretValue"])'; }
GH=$(gv GITHUB_PAT_TOKEN staging)

# 1) Clonar la rama de deploy (testing) — o la que se indique
cd /tmp && rm -rf klugger-build
git clone --quiet --branch testing --depth 1 "https://x-access-token:${GH}@github.com/vilarkptl-lang/klugger.git" klugger-build

# 2) Build estático (Cloudflare Pages = sin server)
cd klugger-build/dashboard-financial
npm install --no-audit --no-fund
NEXT_STATIC_EXPORT=true npm run build            # genera out/  (next.config: output:'export', trailingSlash:true)
ls out                                            # debe incluir: style/ casocimatario/ index.html _next/ assets/ fonts/

# 3) Subir out/ a producción (branch main = producción de facto en este proyecto)
export CLOUDFLARE_API_TOKEN=$(gv CLOUDFLARE_API_TOKEN prod)
export CLOUDFLARE_ACCOUNT_ID=1f1f32da6e12d11e8a71f58a9faa4718
npx --yes wrangler@3 pages deploy out --project-name klugger --branch main --commit-dirty=true
# imprime https://<hash>.klugger.pages.dev  y actualiza klugger.shnell.mx (branch main = producción)
```

## Preview (no tocar producción)
Usar `--branch preview-<algo>` (cualquier rama ≠ main) → crea deploy de preview en `https://<hash>.klugger.pages.dev` sin cambiar klugger.shnell.mx. Útil para revisar antes de publicar.

## Verificación (prueba positiva, desde dev-2 — el sandbox no alcanza el host)
```bash
ssh dev-2 'for p in / /style/ /casocimatario/; do echo "$p -> $(curl -s -o /dev/null -w "%{http_code}" -m 15 https://klugger.shnell.mx$p)"; done'
# 200 en las tres. Marcador del catálogo: curl .../style/ | grep -i "sistema de dise"
```

## Rutas actuales (2026-07-12)
- `/` → redirige a `/style/`.
- `/style/` → **catálogo del sistema de diseño** (K0: átomos, animación Emil, GSAP).
- `/casocimatario/` → dashboard de valuación Cimatario (gateado con PIN **1206**).

## Seguridad / cuidados
- **Siempre buildear antes de subir.** Si el build falla, NO subir (el sitio vivo queda intacto porque no se sube nada).
- Nunca imprimir tokens. Se leen de Infisical en runtime.
- El deploy es **outward-facing** → confirmar con el operador antes de publicar a producción (preview no requiere confirmación).
- Reconciliación `main`↔`testing` pendiente; producción se sirve del build de `testing`.

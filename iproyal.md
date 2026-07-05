✅ Respuesta completa: Cómo usar la API Key de IPRoyal + Instrucciones detalladas de la UI

1. ¿Para qué sirve realmente la API Key de IPRoyal?

La API Key (también llamada API Token) de IPRoyal no se usa para conectar a los proxies directamente.

Se utiliza para gestionar tu cuenta de forma programática (automatizar tareas). Sirve para:

- Obtener información de tu cuenta y tráfico disponible
- Generar listas de proxies dinámicamente
- Gestionar sub-usuarios
- Gestionar whitelists de IPs
- Crear órdenes / calcular precios
- Ver nodos de entrada, países disponibles, etc.

Para usar los proxies reales (conectarte a ellos) tienes dos métodos principales:

- Username + Password (el más común)
- IP Whitelisting (sin credenciales)

2. Cómo obtener la API Key (Token) en el Dashboard (UI) — Paso a paso

Sigue estos pasos exactos:

1. Entra a tu dashboard: [https://dashboard.iproyal.com](https://dashboard.iproyal.com/)
2. En la esquina superior derecha, haz clic en tu email o avatar.
3. En el menú desplegable, selecciona Settings (Configuración).
4. Baja con el scroll hasta encontrar la sección API.
5. Ahí verás tu API Token. Normalmente aparece enmascarado.
6. Haz clic en el botón para copiarlo (o mostrarlo).

Opciones adicionales en esa misma sección:

- Botón para Resetear el token (¡cuidado! invalida el anterior inmediatamente).
- A veces aparece la fecha de creación o última vez que se usó.

Nota: Esta misma sección de Settings → API es la que se usa también para Web Unblocker y otras herramientas de IPRoyal.

3. Cómo se usa la API Key (Autenticación)

Base URL (Residential Proxies):  
https://resi-api.iproyal.com/v1

Header de autenticación (obligatorio en todas las peticiones):

Authorization: Bearer TU_TOKEN_AQUI

Ejemplo con cURL:

curl -X GET "https://resi-api.iproyal.com/v1/me" \

  -H "Authorization: Bearer TU_TOKEN_AQUI"

4. Endpoints principales (Residential API)

Aquí tienes los más útiles y documentados:

|   |   |   |   |   |
|---|---|---|---|---|
|Categoría|Método|Endpoint|Descripción|Uso común|
|Cuenta|GET|/me|Información de tráfico disponible y subusuarios|Muy usado|
|Access|GET|/access/entry-nodes|Nodos de entrada recomendados|Importante|
|Access|GET|/access/countries|Países, ciudades, estados e ISPs disponibles|Muy usado|
|Access|GET|/access/regions|Regiones disponibles|-|
|Access|GET|/access/country-sets|Conjuntos de países|-|
|Access|POST|/access/generate-proxy-list|Genera lista de proxies dinámicamente|Muy potente|
|Orders|GET|/residential/orders|Lista de tus órdenes (paginado)|-|
|Orders|POST|/residential/orders|Crear nueva orden|-|
|Orders|GET|/residential/orders/calculate-pricing|Calcular precio antes de comprar|Útil|
|Sub-Users|GET|/residential-subusers|Listar subusuarios|Gestión|
|Sub-Users|POST|/residential-subusers|Crear subusuario|Gestión|
|Sub-Users|POST|/residential-subusers/{hash}/give-traffic|Dar tráfico a un subusuario|Gestión|
|Whitelists|POST|/residential-users/{hash}/whitelist-entries|Añadir IP a whitelist|Gestión|

Ejemplo práctico — Obtener tu información de cuenta:

curl -X GET "https://resi-api.iproyal.com/v1/me" \

  -H "Authorization: Bearer TU_TOKEN_AQUI"

Ejemplo — Obtener nodos de entrada:

curl -X GET "https://resi-api.iproyal.com/v1/access/entry-nodes" \

  -H "Authorization: Bearer TU_TOKEN_AQUI"

5. Documentación oficial completa

La mejor fuente es la documentación oficial:

- Residential API principal: [https://docs.iproyal.com/proxies/residential/api](https://docs.iproyal.com/proxies/residential/api)
- Secciones recomendadas:

- /access → Nodos, países y generar proxies
- /orders
- /sub-users
- /whitelists
- /user (para el endpoint /me)

6. Notas importantes de seguridad

- Nunca pongas el token en código frontend (páginas web públicas).
- Guárdalo como variable de entorno o en un gestor de secretos.
- Si sospechas que alguien lo vio → resetealo inmediatamente desde Settings → API.
- El token de Residential usa Bearer Token.
- El token de Datacenter / Reseller usa header X-Access-Token y otra URL base (https://apid.iproyal.com/v1/reseller).

Resumen rápido

|   |   |   |
|---|---|---|
|Cosa|Dónde encontrarlo|Cómo se usa|
|API Token|Dashboard → Settings → sección API|Header Authorization: Bearer|
|Lista de proxies|Dashboard o API (/access/generate-proxy-list)|Manual o automatizado|
|Documentación endpoints|[docs.iproyal.com/proxies/residential/api](https://docs.iproyal.com/proxies/residential/api)|-|

¿Quieres que te prepare ejemplos completos de código (Python, Node.js, PHP) para los endpoints más usados (especialmente generate-proxy-list o gestión de subusuarios)? Dime para qué lo necesitas principalmente y te armo los ejemplos listos para usar.

Respuesta directa y clara:

No, con la API Key principal (el token Bearer de gestión) no puedes obtener “otras API Keys” de gestión.

Explicación detallada:

IPRoyal maneja dos cosas distintas:

|   |   |   |   |
|---|---|---|---|
|Tipo|Qué es|Cómo se obtiene/gestiona|¿Se puede obtener vía API?|
|API Key de gestión (Bearer Token)|Token para llamar a la API de administración (resi-api.iproyal.com)|Solo en el Dashboard → Settings → sección API. Solo existe una por cuenta. Puedes resetearla, pero no crear múltiples.|No. No hay endpoint para listar o crear más tokens de gestión.|
|Credenciales de proxy de subusuarios (username + password)|Las que usas para conectar a los proxies (user:pass@geo.iproyal.com:12321)|Las defines tú al crear el subusuario.|Sí. Al listar o crear subusuarios vía API, la respuesta incluye el password en texto plano.|

Lo que sí puedes hacer con tu API Key principal:

Usando el token de gestión puedes:

- Listar todos tus subusuarios → y obtener su username + password directamente en la respuesta JSON.
- Crear nuevos subusuarios definiendo su username y password.
- Actualizarlos (incluyendo cambiar el password).
- Gestionar tráfico, whitelists, generar listas de proxies, etc.

Ejemplo: Si llamas a este endpoint con tu API Key:

GET https://resi-api.iproyal.com/v1/residential-subusers

Authorization: Bearer TU_TOKEN_AQUI

La respuesta incluye algo como:

{

  "data": [

    {

      "id": 5,

      "hash": "02JVRQ5BF83PTW19G1SRD955J0",

      "username": "subuser123",

      "password": "securepassword",   // ← Aquí viene el password

      "traffic_available": 10,

      "traffic_used": 0

    }

  ]

}

Lo mismo pasa cuando creas un subusuario nuevo: la respuesta te devuelve el password que le asignaste.

Resumen final:

- API Keys de gestión → Solo hay una. No se pueden crear ni listar por API. Solo se ve/resetear en la UI (Settings → API).
- Credenciales de proxy de subusuarios → Sí las puedes obtener (y gestionar) completamente por API usando tu token principal. La respuesta trae el password.

¿Quieres que te muestre los endpoints exactos + ejemplos de código (Python o cURL) para:

1. Listar todos los subusuarios con sus credenciales, o
2. Crear subusuarios automáticamente?

Dime y te los preparo listos para copiar y usar.
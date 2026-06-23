# Cómo arrancar el Dashboard de Valuación (Cimatario)

## Problema actual
`npm` no se reconoce en tu PowerShell. Esto significa que **Node.js no está instalado** o no está agregado al PATH.

---

## Solución (Paso a Paso)

### 1. Instalar Node.js (Obligatorio)

**Opción recomendada (más fácil):**

1. Abre PowerShell **como Administrador** (botón derecho → Ejecutar como administrador).

2. Ejecuta este comando (usa winget, viene con Windows 10/11):

   ```powershell
   winget install --id OpenJS.NodeJS.LTS --exact --source winget
   ```

3. Espera a que termine la instalación.

4. **Cierra completamente** esta ventana de PowerShell y ábrela de nuevo (importante).

5. Verifica que funcionó:

   ```powershell
   node --version
   npm --version
   ```

   Deberías ver versiones (ej: v20.x.x y 10.x.x).

---

**Opción manual (si winget no funciona):**

1. Ve a: https://nodejs.org/en/download/
2. Descarga **Windows Installer (.msi)** → 64-bit (LTS recomendado).
3. Ejecuta el instalador.
4. **MUY IMPORTANTE**: En la pantalla de instalación, marca la casilla **"Add to PATH"** (o "Automatically install the necessary tools").
5. Termina la instalación.
6. **Reinicia PowerShell** (cierra y abre de nuevo).

---

### 2. Arrancar el Dashboard

Después de instalar Node.js y reiniciar PowerShell:

**Método más fácil:**

- Ve con el Explorador de Windows a esta carpeta:
  `C:\Users\noela\klugger\dashboard-financial`

- **Doble clic** en el archivo:
  `start-valuation.bat`

O desde PowerShell:

```powershell
cd C:\Users\noela\klugger\dashboard-financial
npm install
npm run dev
```

---

### 3. Ver el Dashboard en Chrome

Cuando el servidor diga algo como:

```
▲ Next.js ...
- Local:        http://localhost:3020
- Ready in ...
```

Abre Chrome y ve a:

**http://localhost:3020/valuacion-cimatario**

---

## Si sigues teniendo problemas

Pégame aquí exactamente lo que te sale al correr:

```powershell
node --version
npm --version
```

Y también el output completo de intentar correr el .bat o los comandos.

---

Archivos relevantes ya listos:
- start-valuation.bat (doble clic)
- app/valuacion-cimatario/page.tsx + ValuacionDashboard.tsx (copia local)
- El componente trae todos los datos embebidos (no necesita CSV externo para la preview)

¡Una vez que instales Node.js correctamente, todo debería arrancar sin problemas!
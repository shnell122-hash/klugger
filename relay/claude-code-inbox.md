## Revisión rápida — Episodio #1747
Score actual: 77.8% — bajo el umbral del 80%

### Patrones de falla recurrentes:
- **saldo_gv_respuesta_sin_keywords___saldo** (×177 episodios): respuesta sin keywords ['saldo', '$']: 'No encontré ninguna CLABE, tarjeta ni cuenta. Envíame el número directamente.'
- **saldo_gv_timeout** (×91 episodios): bot no respondio (timeout 12s)

### Acción requerida:
1. Revisar `pm2 logs financial-bot --nostream --lines 30` para el error exacto
2. Corregir el código del bot en `financial/bot/financial-bot.js`
3. Hacer commit + push a la rama activa

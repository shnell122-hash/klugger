/**
 * Runner para usar el VisionAgent del proyecto (dentro de klugger)
 * en las imágenes del caso del terreno en Cimatario.
 * 
 * Todo dentro de este repo klugger. No nuevos repos.
 * 
 * Uso (después de npm install en financialbot/financial si es necesario):
 * node cases/terreno-cimatario-queretaro/analyze-images-with-vision.js
 * 
 * Requiere: GOOGLE_API_KEY en .env o env (ya configurada).
 * El agent prioriza Gemini Flash para visión/OCR (costo-eficiente).
 */

const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai'); // para fallback, asume instalado en contexto

// Importar el VisionAgent del proyecto (ajusta path si es necesario)
const VisionAgent = require('../../financialbot/financial/bot/agents/vision-agent.js');

async function analyzeImage(imagePath, promptType = 'general') {
  if (!fs.existsSync(imagePath)) {
    console.error('Imagen no encontrada:', imagePath);
    return null;
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const mimeType = 'image/jpeg'; // asume JPG

  // Instanciar LLM para fallback (usa DeepSeek o similar del proyecto)
  const llm = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY || 'dummy', // ajusta
    baseURL: 'https://api.deepseek.com/v1'
  });

  const agent = new VisionAgent(llm, {
    googleApiKey: process.env.GOOGLE_API_KEY,
    geminiModel: process.env.GEMINI_FLASH_MODEL || 'gemini-2.0-flash'
  });

  let prompt;
  if (promptType === 'realestate') {
    prompt = `Analiza esta imagen de un terreno en venta en México para un estudio de mercado y proyecto de marketing inmobiliario.
Extrae: 
- Descripción visual del lote (tamaño aparente, forma, topografía, vegetación, estado actual).
- Entorno y ubicación (calles, casas cercanas, accesos, desarrollo en la zona).
- Potencial de construcción/desarrollo (basado en visual: densidad posible, vistas, plusvalía).
- Cualquier texto, letrero o detalle relevante en la foto.
- Calidad de la imagen para uso en marketing.
Devuelve JSON estructurado:
{
  "descripcion": "...",
  "entorno": "...",
  "potencial_desarrollo": "...",
  "detalles_texto": "...",
  "para_marketing": "...",
  "confianza": "alta|media|baja"
}`;
  } else {
    prompt = 'Describe esta imagen en detalle para análisis inmobiliario.';
  }

  try {
    const result = await agent._callVision(imageBuffer, mimeType, prompt);
    console.log(`\n=== Análisis de ${path.basename(imagePath)} ===`);
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (e) {
    console.error('Error analizando', imagePath, e.message);
    return null;
  }
}

async function main() {
  console.log('Vision Agent Runner para caso Terreno Cimatario (todo en klugger repo)');
  console.log('Key Gemini cargada desde .env del proyecto.');

  const imagesDir = path.join(__dirname, 'images');
  const images = fs.readdirSync(imagesDir)
    .filter(f => f.match(/\.(jpg|jpeg|png)$/i))
    .map(f => path.join(imagesDir, f));

  if (images.length === 0) {
    console.log('No images found in', imagesDir);
    return;
  }

  console.log(`Found ${images.length} images. Running VisionAgent (Gemini Flash preferred)...\n`);

  const results = [];
  for (const img of images) {
    const res = await analyzeImage(img, 'realestate');
    if (res) results.push({ file: path.basename(img), analysis: res });
  }

  // Guardar resultados en data/
  const outFile = path.join(__dirname, 'data', 'vision-analysis.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nResultados guardados en ${outFile}`);
  console.log('Usa esto para el estudio de mercado y marketing en el plan.');
}

main().catch(console.error);
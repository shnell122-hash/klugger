<?php
/**
 * cron_pagos.php — Cron mensual de pagos
 *
 * DESPLEGAR en: /var/www/catalogos/tareas/cron_pagos.php
 *
 * Registrar en crontab (ejecuta el 1ro de cada mes a las 08:00):
 *   0 8 1 * * php /var/www/catalogos/tareas/cron_pagos.php >> /var/log/cron_pagos.log 2>&1
 *
 * También puede ejecutarse manualmente:
 *   php /var/www/catalogos/tareas/cron_pagos.php
 *
 * Lo que hace:
 *   1. Marca como "Vencido" los pagos del mes anterior con Estado "Pendiente"
 *   2. Si N_DB_REPETICION tiene pagos recurrentes, los crea para el mes nuevo
 *   3. Envía alerta Telegram con resumen de pagos pendientes del mes
 *
 * VARIABLES DE ENTORNO necesarias (en .env o en el entorno del sistema):
 *   N_DB_SALDOS, N_DB_REPETICION, NOTION_TOKEN
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID_PAGOS  (chat o grupo de Vianey)
 */

// No ejecutar desde browser
if (isset($_SERVER['HTTP_HOST'])) {
    http_response_code(403);
    exit('Solo CLI');
}

require_once __DIR__ . '/notion_helper.php';

$log_prefix = '[' . date('Y-m-d H:i:s') . '] cron_pagos.php — ';
$hoy        = new DateTimeImmutable();

echo $log_prefix . "Iniciando...\n";

// ─── PASO 1: Marcar vencidos del mes anterior ─────────────────────────────
$mes_ant     = $hoy->modify('-1 month')->format('Y-m');
$primer_ant  = $mes_ant . '-01';
$ultimo_ant  = $mes_ant . '-' . cal_days_in_month(CAL_GREGORIAN,
                    (int)substr($mes_ant, 5, 2), (int)substr($mes_ant, 0, 4));

echo $log_prefix . "Buscando pagos pendientes en $mes_ant...\n";

$pendientes_ant = nQuery('N_DB_SALDOS', [
    'filter' => [
        'and' => [
            ['property' => 'Estado', 'select' => ['equals' => 'Pendiente']],
            ['property' => 'Fecha programada', 'date' => ['on_or_after'  => $primer_ant]],
            ['property' => 'Fecha programada', 'date' => ['on_or_before' => $ultimo_ant]],
        ],
    ],
    'page_size' => 100,
]);

$vencidos_count = 0;
foreach ($pendientes_ant as $p) {
    // VERIFICAR: firma de nReq en notion_helper.php
    $resp = nReq('PATCH', '/pages/' . $p['id'], [
        'properties' => [
            'Estado' => ['select' => ['name' => 'Vencido']],
        ],
    ]);
    if (isset($resp['id'])) {
        $nombre = nT($p['properties']['Concepto'] ?? null);
        echo $log_prefix . "  Vencido: $nombre\n";
        $vencidos_count++;
    }
}
echo $log_prefix . "$vencidos_count pagos marcados como Vencido.\n";

// ─── PASO 2: Crear pagos recurrentes del mes actual ───────────────────────
// Busca en N_DB_REPETICION registros con Tipo = "Pago" o con campo "Es pago"
// VERIFICAR: estructura exacta de N_DB_REPETICION para pagos recurrentes
// Si los pagos recurrentes no están en N_DB_REPETICION, este paso no aplica.

$mes_actual = $hoy->format('Y-m');
echo $log_prefix . "Verificando pagos recurrentes para $mes_actual...\n";

// Intentar leer plantillas de pagos (si existen en N_DB_REPETICION con Tipo=Pago)
$plantillas_pago = nQuery('N_DB_REPETICION', [
    'filter' => [
        'and' => [
            ['property' => 'Activa', 'checkbox' => ['equals' => true]],
            // AJUSTAR: condición para identificar plantillas de tipo "Pago"
            // Si no hay campo Tipo en N_DB_REPETICION, comentar la siguiente línea
            ['property' => 'Tipo', 'select' => ['equals' => 'Pago']],
        ],
    ],
    'page_size' => 50,
]);

$creados_count = 0;
foreach ($plantillas_pago as $tmpl) {
    $pr       = $tmpl['properties'] ?? [];
    $concepto = nT($pr['Name'] ?? null);
    $monto    = $pr['Monto']['number'] ?? 0;
    $dia_mes  = $pr['Día del mes']['number'] ?? 1; // ej: 5 = día 5 de cada mes

    $fecha_pago = $mes_actual . '-' . str_pad((int)$dia_mes, 2, '0', STR_PAD_LEFT);

    // Verificar si ya existe un pago para este mes con este concepto
    $existentes = nQuery('N_DB_SALDOS', [
        'filter' => [
            'and' => [
                ['property' => 'Concepto', 'title'  => ['equals' => $concepto]],
                ['property' => 'Mes',      'select' => ['equals' => $mes_actual]],
            ],
        ],
        'page_size' => 1,
    ]);

    if (!empty($existentes)) {
        echo $log_prefix . "  Ya existe: $concepto ($mes_actual)\n";
        continue;
    }

    $resp = nReq('POST', '/pages', [
        'parent'     => ['database_id' => getenv('N_DB_SALDOS')],
        'properties' => [
            'Concepto'         => ['title'  => [['text' => ['content' => $concepto]]]],
            'Monto'            => ['number' => (float)$monto],
            'Fecha programada' => ['date'   => ['start' => $fecha_pago]],
            'Estado'           => ['select' => ['name' => 'Pendiente']],
            'Mes'              => ['select' => ['name' => $mes_actual]],
        ],
    ]);

    if (isset($resp['id'])) {
        echo $log_prefix . "  Creado: $concepto → $fecha_pago\n";
        $creados_count++;
    } else {
        echo $log_prefix . "  ERROR creando: $concepto\n";
    }
}
echo $log_prefix . "$creados_count pagos recurrentes creados para $mes_actual.\n";

// ─── PASO 3: Resumen de pendientes del mes actual → Telegram ─────────────
$pendientes_mes = nQuery('N_DB_SALDOS', [
    'filter' => [
        'and' => [
            ['property' => 'Estado', 'select' => ['equals' => 'Pendiente']],
            ['property' => 'Mes', 'select' => ['equals' => $mes_actual]],
        ],
    ],
    'sorts'     => [['property' => 'Fecha programada', 'direction' => 'ascending']],
    'page_size' => 50,
]);

$bot_token = getenv('TELEGRAM_BOT_TOKEN');
$chat_id   = getenv('TELEGRAM_CHAT_ID_PAGOS'); // Chat/grupo de Vianey

if ($bot_token && $chat_id && !empty($pendientes_mes)) {
    $lineas = ["💳 *Pagos pendientes — $mes_actual*\n"];
    $total  = 0;
    foreach ($pendientes_mes as $p) {
        $pr      = $p['properties'] ?? [];
        $concept = nT($pr['Concepto'] ?? null);
        $monto   = $pr['Monto']['number'] ?? 0;
        $fecha   = $pr['Fecha programada']['date']['start'] ?? '';
        $dia     = $fecha ? date('d/m', strtotime($fecha)) : '??';
        $lineas[]  = "• $concept — \$" . number_format($monto, 0) . " (📅 $dia)";
        $total    += $monto;
    }
    $lineas[] = "\n*Total pendiente: \$" . number_format($total, 0) . " MXN*";
    $lineas[] = "\nVer detalles: https://tareas.ruby.lease/pagos.php";

    $texto = implode("\n", $lineas);
    $url   = "https://api.telegram.org/bot$bot_token/sendMessage";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POSTFIELDS     => json_encode([
            'chat_id'    => $chat_id,
            'text'       => $texto,
            'parse_mode' => 'Markdown',
        ]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    ]);
    $result = curl_exec($ch);
    curl_close($ch);

    $decoded = json_decode($result, true);
    if ($decoded['ok'] ?? false) {
        echo $log_prefix . "Alerta Telegram enviada (" . count($pendientes_mes) . " pagos pendientes).\n";
    } else {
        echo $log_prefix . "Error Telegram: " . ($decoded['description'] ?? $result) . "\n";
    }
} elseif (empty($pendientes_mes)) {
    echo $log_prefix . "Sin pagos pendientes — no se envía Telegram.\n";
} else {
    echo $log_prefix . "TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID_PAGOS no configurados.\n";
    echo $log_prefix . "Agregar a .env: TELEGRAM_CHAT_ID_PAGOS=<id del chat de Vianey>\n";
}

echo $log_prefix . "✅ Cron completado. Vencidos: $vencidos_count | Creados: $creados_count\n";

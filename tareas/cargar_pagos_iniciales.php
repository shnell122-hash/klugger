<?php
/**
 * cargar_pagos_iniciales.php — Importador masivo de pagos desde Excel
 *
 * DESPLEGAR en: /var/www/catalogos/tareas/cargar_pagos_iniciales.php
 *
 * INSTRUCCIONES:
 *   1. Llenar el array $pagos abajo con los datos del Excel
 *   2. Ejecutar UNA SOLA VEZ:  php /var/www/catalogos/tareas/cargar_pagos_iniciales.php
 *   3. Verificar en Notion que los registros aparezcan en N_DB_SALDOS
 *   4. Eliminar o proteger este archivo (chmod 000 o mover a /tmp)
 *
 * PROTECCIÓN: El script solo corre por CLI para evitar ejecución accidental desde web.
 */

if (isset($_SERVER['HTTP_HOST'])) {
    http_response_code(403);
    exit('Solo CLI: php cargar_pagos_iniciales.php');
}

require_once __DIR__ . '/notion_helper.php';

// ═══════════════════════════════════════════════════════════════════════════
// ► EDITAR ESTE ARRAY con los pagos del Excel de Vianey
// ► Formato de fecha: YYYY-MM-DD
// ► Estado inicial: dejar en 'Pendiente' para pagos futuros,
//                  'Pagado' para los que ya están pagados
// ═══════════════════════════════════════════════════════════════════════════
$pagos = [
    // Ejemplo — reemplazar con datos reales:
    // ['concepto' => 'Renta oficina',       'monto' => 15000, 'fecha' => '2026-05-01', 'estado' => 'Pendiente'],
    // ['concepto' => 'Servicio internet',   'monto' => 800,   'fecha' => '2026-05-05', 'estado' => 'Pendiente'],
    // ['concepto' => 'Electricidad',        'monto' => 1200,  'fecha' => '2026-05-10', 'estado' => 'Pendiente'],
    // ['concepto' => 'Seguro vehículo',     'monto' => 2500,  'fecha' => '2026-05-15', 'estado' => 'Pendiente'],
    // ['concepto' => 'Nómina semana 1',     'monto' => 8000,  'fecha' => '2026-05-02', 'estado' => 'Pendiente'],

    // PEGAR AQUÍ LOS PAGOS REALES:
];

// ═══════════════════════════════════════════════════════════════════════════

if (empty($pagos)) {
    echo "❌ ERROR: El array \$pagos está vacío.\n";
    echo "   Editar este archivo y agregar los pagos antes de ejecutar.\n";
    exit(1);
}

$db_id = getenv('N_DB_SALDOS');
if (!$db_id) {
    echo "❌ ERROR: Variable N_DB_SALDOS no configurada en el entorno.\n";
    exit(1);
}

echo "=== Cargando pagos iniciales a N_DB_SALDOS ===\n";
echo "Total a cargar: " . count($pagos) . " registros\n\n";

$ok    = 0;
$error = 0;

foreach ($pagos as $i => $pago) {
    $concepto = trim($pago['concepto'] ?? '');
    $monto    = (float)($pago['monto'] ?? 0);
    $fecha    = trim($pago['fecha'] ?? '');
    $estado   = trim($pago['estado'] ?? 'Pendiente');
    $mes      = substr($fecha, 0, 7); // YYYY-MM

    // Validación básica
    if (!$concepto) {
        echo "  [$i] ❌ Concepto vacío — saltando\n";
        $error++;
        continue;
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        echo "  [$i] ❌ Fecha inválida '$fecha' (usar YYYY-MM-DD) — saltando\n";
        $error++;
        continue;
    }
    if (!in_array($estado, ['Pendiente', 'Pagado', 'Vencido'])) {
        echo "  [$i] ⚠️  Estado '$estado' no reconocido — usando 'Pendiente'\n";
        $estado = 'Pendiente';
    }

    // Verificar si ya existe para no duplicar
    $existente = nQuery('N_DB_SALDOS', [
        'filter' => [
            'and' => [
                ['property' => 'Concepto', 'title' => ['equals' => $concepto]],
                ['property' => 'Fecha programada', 'date' => ['equals' => $fecha]],
            ],
        ],
        'page_size' => 1,
    ]);

    if (!empty($existente)) {
        echo "  [$i] ℹ️  Ya existe: $concepto ($fecha) — saltando\n";
        continue;
    }

    // VERIFICAR: firma de nReq en notion_helper.php
    $props = [
        'Concepto'         => ['title'  => [['text' => ['content' => $concepto]]]],
        'Monto'            => ['number' => $monto],
        'Fecha programada' => ['date'   => ['start' => $fecha]],
        'Estado'           => ['select' => ['name' => $estado]],
        'Mes'              => ['select' => ['name' => $mes]],
    ];

    // Agregar URL de comprobante si se incluye en los datos
    if (!empty($pago['comprobante_url'])) {
        $props['Comprobante URL'] = ['url' => $pago['comprobante_url']];
    }

    $resp = nReq('POST', '/pages', [
        'parent'     => ['database_id' => $db_id],
        'properties' => $props,
    ]);

    if (isset($resp['id'])) {
        echo "  [$i] ✅ Creado: $concepto — \$" . number_format($monto, 2) . " ($fecha) [$estado]\n";
        $ok++;
    } else {
        $err_msg = $resp['message'] ?? json_encode($resp);
        echo "  [$i] ❌ Error: $concepto — $err_msg\n";
        $error++;
    }

    // Pequeña pausa para no saturar la API de Notion (rate limit: 3 req/seg)
    usleep(400000); // 400ms
}

echo "\n=== Resultado ===\n";
echo "✅ Creados: $ok\n";
echo "❌ Errores: $error\n";
echo "\nVerificar en Notion: https://notion.so (buscar base N_DB_SALDOS)\n";
echo "O en el sistema: https://tareas.ruby.lease/pagos.php\n\n";

if ($ok > 0) {
    echo "⚠️  Recomendación: una vez verificado, eliminar o proteger este archivo:\n";
    echo "   chmod 000 /var/www/catalogos/tareas/cargar_pagos_iniciales.php\n";
}

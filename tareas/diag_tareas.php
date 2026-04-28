<?php
/**
 * FASE 0 — Diagnóstico de la base Notion
 * Ejecutar en servidor como:
 *   php /var/www/catalogos/tareas/diag_tareas.php 2>&1 | tee /tmp/diag_output.txt
 *
 * NO modifica nada. Solo lectura.
 */

require_once __DIR__ . '/notion_helper.php';

$sep = str_repeat('─', 60);

echo "=== DIAGNÓSTICO SISTEMA DE TAREAS ===\n";
echo "Fecha: " . date('Y-m-d H:i:s') . "\n\n";

// ── Función auxiliar para mostrar propiedades ─────────────────────────────
function mostrarPropiedades(array $page): void {
    foreach ($page['properties'] ?? [] as $k => $v) {
        $type = $v['type'] ?? '?';
        $val  = match ($type) {
            'title'      => implode('', array_column($v['title']  ?? [], 'plain_text')),
            'rich_text'  => implode('', array_column($v['rich_text'] ?? [], 'plain_text')),
            'number'     => (string)($v['number'] ?? 'null'),
            'select'     => $v['select']['name'] ?? 'null',
            'multi_select' => implode(', ', array_column($v['multi_select'] ?? [], 'name')),
            'date'       => $v['date']['start'] ?? 'null',
            'url'        => $v['url'] ?? 'null',
            'checkbox'   => ($v['checkbox'] ?? false) ? 'true' : 'false',
            'people'     => implode(', ', array_column($v['people'] ?? [], 'name')),
            'email'      => $v['email'] ?? 'null',
            'phone_number' => $v['phone_number'] ?? 'null',
            'formula'    => json_encode($v['formula'] ?? null),
            'relation'   => count($v['relation'] ?? []) . ' relaciones',
            'rollup'     => json_encode($v['rollup'] ?? null),
            default      => "($type)",
        };
        printf("    %-30s %s: %s\n", $k, $type, $val);
    }
}

// ── N_DB_SALDOS ───────────────────────────────────────────────────────────
echo "$sep\n  N_DB_SALDOS\n$sep\n";
$saldos = nQuery('N_DB_SALDOS', ['page_size' => 5]);
if (empty($saldos)) {
    echo "  ❌ Vacía, error de acceso o variable N_DB_SALDOS no configurada\n\n";
} else {
    echo "  Estructura de propiedades:\n";
    foreach ($saldos[0]['properties'] ?? [] as $k => $v) {
        printf("    %-30s %s\n", $k, $v['type'] ?? '?');
    }
    echo "\n  Primeras " . count($saldos) . " páginas:\n";
    foreach ($saldos as $i => $p) {
        echo "\n  Página #" . ($i + 1) . " [id: {$p['id']}]\n";
        mostrarPropiedades($p);
    }
}

// ── N_DB_REPETICION ───────────────────────────────────────────────────────
echo "\n$sep\n  N_DB_REPETICION\n$sep\n";
$rep = nQuery('N_DB_REPETICION', ['page_size' => 20]);
if (empty($rep)) {
    echo "  ❌ Vacía o no accesible\n\n";
} else {
    echo "  Estructura:\n";
    foreach ($rep[0]['properties'] ?? [] as $k => $v) {
        printf("    %-30s %s\n", $k, $v['type'] ?? '?');
    }
    echo "\n  Tareas recurrentes:\n";
    foreach ($rep as $r) {
        $pr     = $r['properties'] ?? [];
        $nombre = nT($pr['Name'] ?? null);
        $freq   = nT($pr['Frecuencia'] ?? null) ?: ($pr['Frecuencia']['select']['name'] ?? '?');
        $activa = ($pr['Activa']['checkbox'] ?? false) ? '✅' : '⬜';
        $prox   = $pr['Próxima ejecución']['date']['start']
               ?? $pr['Proxima ejecucion']['date']['start']
               ?? '?';
        $personas = array_map(fn($p) => $p['name'] ?? '', $pr['Persona asignada']['people'] ?? []);
        printf("  %s %-35s | Freq: %-12s | Prox: %s | %s\n",
            $activa, $nombre, $freq, $prox, implode(', ', $personas));
    }
}

// ── N_DB_TAREAS ───────────────────────────────────────────────────────────
echo "\n$sep\n  N_DB_TAREAS (estructura + primeras 3)\n$sep\n";
$tareas = nQuery('N_DB_TAREAS', ['page_size' => 3]);
if (empty($tareas)) {
    echo "  ❌ Vacía o no accesible\n\n";
} else {
    echo "  Estructura de propiedades:\n";
    foreach ($tareas[0]['properties'] ?? [] as $k => $v) {
        printf("    %-30s %s\n", $k, $v['type'] ?? '?');
    }
    echo "\n  ¿Existen campos de campañas?\n";
    $campos_esperados = ['Solicitudes', 'Creditos otorgados', 'Monto otorgado', 'Evidencia URL', 'Tipo'];
    foreach ($campos_esperados as $c) {
        $existe = isset($tareas[0]['properties'][$c]);
        echo "    " . ($existe ? "✅" : "❌") . " $c\n";
    }
}

// ── N_DB_USUARIOS ─────────────────────────────────────────────────────────
echo "\n$sep\n  N_DB_USUARIOS\n$sep\n";
$usuarios = nQuery('N_DB_USUARIOS', ['page_size' => 20]);
if (empty($usuarios)) {
    echo "  ❌ Vacía o no accesible\n\n";
} else {
    echo "  Estructura:\n";
    foreach ($usuarios[0]['properties'] ?? [] as $k => $v) {
        printf("    %-30s %s\n", $k, $v['type'] ?? '?');
    }
    echo "\n  Usuarios registrados:\n";
    foreach ($usuarios as $u) {
        $pr = $u['properties'] ?? [];
        printf("    ID Notion: %-38s | %s\n", $u['id'], nT($pr['Name'] ?? null));
    }
}

// ── ENV VARS ──────────────────────────────────────────────────────────────
echo "\n$sep\n  Variables de entorno\n$sep\n";
$vars = ['N_DB_TAREAS','N_DB_REPETICION','N_DB_USUARIOS','N_DB_SALDOS','N_DB_RESUMEN','NOTION_TOKEN','NOTION_API_KEY'];
foreach ($vars as $v) {
    $val = getenv($v) ?: ($_ENV[$v] ?? null);
    if ($val) {
        echo "  ✅ $v = " . substr($val, 0, 8) . "...\n";
    } else {
        echo "  ❌ $v no configurada\n";
    }
}

// ── Crontab ───────────────────────────────────────────────────────────────
echo "\n$sep\n  Crontab (root)\n$sep\n";
$cron = shell_exec('crontab -l 2>/dev/null');
echo $cron ?: "  (vacío — ninguna entrada)\n";
echo "\n  /etc/cron.d/ (archivos vilar):\n";
$cron_d = shell_exec('ls -la /etc/cron.d/ 2>/dev/null | grep -v "^total\|^\.$\|^\.\.$"');
echo $cron_d ?: "  (sin archivos vilar)\n";

// ── Directorios de archivos ───────────────────────────────────────────────
echo "\n$sep\n  Directorios de archivos subidos\n$sep\n";
$dirs = [
    __DIR__ . '/comprobantes',
    __DIR__ . '/evidencias',
];
foreach ($dirs as $d) {
    if (is_dir($d)) {
        echo "  ✅ Existe: $d\n";
        echo "     Permisos: " . substr(sprintf('%o', fileperms($d)), -4) . "\n";
    } else {
        echo "  ❌ NO existe: $d — se creará al primer upload\n";
    }
}

echo "\n=== FIN DIAGNÓSTICO ===\n";
echo "Pega este output en el chat para continuar con la implementación.\n\n";

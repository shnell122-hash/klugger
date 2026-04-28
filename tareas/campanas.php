<?php
/**
 * campanas.php — Módulo de campañas de marketing (Héctor + admin)
 * Muestra campañas del mes, permite editar métricas y subir evidencias.
 *
 * DESPLEGAR en: /var/www/catalogos/tareas/campanas.php
 *
 * CAMPOS necesarios en N_DB_TAREAS (crearlos en Notion si no existen):
 *   Solicitudes         number
 *   Creditos otorgados  number
 *   Monto otorgado      number
 *   Evidencia URL       url
 *   Tipo                select  → debe tener la opción "Campaña"
 *
 * Si "Tipo" no existe, las campañas se filtrarán solo por asignado a Héctor.
 */

require_once __DIR__ . '/auth.php';
requireLogin();
require_once __DIR__ . '/notion_helper.php';

$usuario_actual = $_SESSION['usuario'] ?? $_SESSION['nombre'] ?? '';
$admins = ['German Villar'];
$es_admin = in_array($usuario_actual, $admins);

// Solo Héctor y admins pueden ver este módulo
// VERIFICAR: nombre exacto en auth.php para Héctor
$hector_nombre = 'Hector Martinez';
if ($usuario_actual !== $hector_nombre && !$es_admin) {
    http_response_code(403);
    // Mostrar mensaje de acceso denegado con el estilo del sistema
    die('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Acceso denegado</title>'
      . '<style>body{font-family:sans-serif;padding:40px;color:#333}</style></head><body>'
      . '<h2>⛔ Acceso restringido</h2><p>Este módulo es solo para Héctor y administradores.</p>'
      . '<a href="tareas.php">← Volver</a></body></html>');
}

// ─── POST handlers ────────────────────────────────────────────────────────
$mensaje = '';
$error   = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action  = $_POST['action'] ?? '';
    $page_id = trim($_POST['page_id'] ?? '');

    // ── Guardar métricas ──────────────────────────────────────────────────
    if ($action === 'guardar_metricas' && $page_id) {
        $props = [];

        $solicitudes = $_POST['solicitudes'] ?? '';
        $creditos    = $_POST['creditos_otorgados'] ?? '';
        $monto       = $_POST['monto_otorgado'] ?? '';
        $notas       = trim($_POST['notas'] ?? '');

        if ($solicitudes !== '') $props['Solicitudes']        = ['number' => (int)$solicitudes];
        if ($creditos !== '')    $props['Creditos otorgados'] = ['number' => (int)$creditos];
        if ($monto !== '')       $props['Monto otorgado']     = ['number' => (float)$monto];
        if ($notas !== '')       $props['Observaciones']      = ['rich_text' => [['text' => ['content' => $notas]]]];

        if (!empty($props)) {
            // VERIFICAR: firma de nReq en notion_helper.php
            $resp = nReq('PATCH', '/pages/' . $page_id, ['properties' => $props]);
            $mensaje = isset($resp['id']) ? 'Métricas guardadas.' : 'Error al guardar. Verificar nombres de campos en Notion.';
        }
    }

    // ── Subir evidencia ───────────────────────────────────────────────────
    if ($action === 'subir_evidencia' && $page_id) {
        $file = $_FILES['evidencia'] ?? null;
        if (!$file || $file['error'] !== UPLOAD_ERR_OK) {
            $error = 'Error al recibir el archivo.';
        } else {
            $ext_ok = ['jpg','jpeg','png','gif','webp','pdf','mp4','mov'];
            $ext    = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, $ext_ok)) {
                $error = 'Tipo de archivo no permitido.';
            } else {
                $mes_dir  = date('Y-m');
                $dir_base = __DIR__ . '/evidencias/' . $mes_dir;
                if (!is_dir($dir_base)) mkdir($dir_base, 0755, true);

                $nombre = preg_replace('/[^a-f0-9\-]/', '', $page_id) . '_' . time() . '.' . $ext;
                $dest   = $dir_base . '/' . $nombre;

                if (move_uploaded_file($file['tmp_name'], $dest)) {
                    $proto      = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                    $host       = $_SERVER['HTTP_HOST'] ?? 'tareas.ruby.lease';
                    $url_public = "$proto://$host/evidencias/$mes_dir/$nombre";

                    // Obtener URL existente para no sobrescribir (concatenar si hay varias)
                    $existing = nReq('GET', '/pages/' . $page_id);
                    $url_prev = $existing['properties']['Evidencia URL']['url'] ?? '';
                    // Si ya hay una URL, la nueva va a Observaciones como texto
                    // (Notion solo permite una URL en campo url)
                    nReq('PATCH', '/pages/' . $page_id, [
                        'properties' => [
                            'Evidencia URL' => ['url' => $url_public],
                        ],
                    ]);
                    $mensaje = "Evidencia subida: <a href=\"$url_public\" target=\"_blank\">ver archivo</a>";
                } else {
                    $error = "No se pudo guardar el archivo. Verificar permisos en $dir_base";
                }
            }
        }
    }

    $qs = $mensaje ? '?ok=' . urlencode(strip_tags($mensaje)) : ($error ? '?err=' . urlencode($error) : '');
    if (!$mensaje || !str_contains($mensaje, '<a ')) {
        header('Location: campanas.php' . $qs);
        exit;
    }
}

if (!$mensaje && !$error) {
    $mensaje = $_GET['ok']  ?? '';
    $error   = $_GET['err'] ?? '';
}

// ─── Parámetros de navegación por mes ─────────────────────────────────────
$hoy     = new DateTimeImmutable();
$mes_sel = $_GET['mes'] ?? $hoy->format('Y-m');
if (!preg_match('/^\d{4}-\d{2}$/', $mes_sel)) {
    $mes_sel = $hoy->format('Y-m');
}

$dt_mes   = new DateTimeImmutable($mes_sel . '-01');
$mes_prev = $dt_mes->modify('-1 month')->format('Y-m');
$mes_next = $dt_mes->modify('+1 month')->format('Y-m');
$primer   = $mes_sel . '-01';
$ultimo   = $mes_sel . '-' . $dt_mes->format('t');

// ─── Cargar campañas desde N_DB_TAREAS ────────────────────────────────────
// Filtro: Tipo = "Campaña" Y fecha en el mes seleccionado
// Si el campo "Tipo" no existe, ajustar este filtro
$filter = [
    'and' => [
        [
            'property' => 'Tipo',
            'select'   => ['equals' => 'Campaña'],
        ],
        [
            'or' => [
                ['property' => 'Fecha', 'date' => ['on_or_after' => $primer]],
                ['property' => 'Fecha inicio', 'date' => ['on_or_after' => $primer]],
            ],
        ],
        [
            'or' => [
                ['property' => 'Fecha', 'date' => ['on_or_before' => $ultimo]],
                ['property' => 'Fecha inicio', 'date' => ['on_or_before' => $ultimo]],
            ],
        ],
    ],
];

// Si quieres también campañas asignadas a Héctor sin importar tipo:
// Cambiar 'Tipo'='Campaña' por filtro de personas

$campanas_raw = nQuery('N_DB_TAREAS', [
    'filter'    => $filter,
    'sorts'     => [['property' => 'Fecha', 'direction' => 'descending']],
    'page_size' => 50,
]);

// Normalizar
$campanas = [];
foreach ($campanas_raw as $p) {
    $pr = $p['properties'] ?? [];
    $campanas[] = [
        'id'          => $p['id'],
        'nombre'      => nT($pr['Name'] ?? null) ?: nT($pr['Nombre'] ?? null),
        'estado'      => $pr['Estado']['select']['name'] ?? $pr['Status']['select']['name'] ?? '—',
        'fecha'       => $pr['Fecha']['date']['start'] ?? $pr['Fecha inicio']['date']['start'] ?? '',
        'asignado'    => implode(', ', array_column($pr['Persona asignada']['people'] ?? [], 'name')),
        'solicitudes' => $pr['Solicitudes']['number'] ?? null,
        'creditos'    => $pr['Creditos otorgados']['number'] ?? null,
        'monto'       => $pr['Monto otorgado']['number'] ?? null,
        'evidencia'   => $pr['Evidencia URL']['url'] ?? '',
        'notas'       => implode('', array_column($pr['Observaciones']['rich_text'] ?? [], 'plain_text')),
    ];
}

// ─── HTML ─────────────────────────────────────────────────────────────────
if (file_exists(__DIR__ . '/header.php')) require_once __DIR__ . '/header.php';
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>📊 Campañas — VILAR</title>
  <style>
    :root {
      --bg: #f5f5f5; --card: #fff; --border: #e0e0e0; --accent: #2c3e50;
      --green: #27ae60; --yellow: #f39c12; --red: #e74c3c; --gray: #95a5a6;
      --text: #333; --text-light: #666; --radius: 8px; --shadow: 0 1px 4px rgba(0,0,0,.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: var(--bg); color: var(--text); }
    .page-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .subtitle { color: var(--text-light); margin-bottom: 24px; font-size: .9rem; }
    .alert { padding: 10px 16px; border-radius: var(--radius); margin-bottom: 16px; font-size: .9rem; }
    .alert-ok  { background: #d4edda; color: #155724; }
    .alert-err { background: #f8d7da; color: #721c24; }
    .section-header { display: flex; align-items: center; justify-content: space-between;
                      margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
    .calendar-nav { display: flex; align-items: center; gap: 12px; }
    .calendar-nav a { color: var(--accent); text-decoration: none; font-size: 1.2rem; }
    .calendar-nav h2 { font-size: 1.1rem; text-transform: capitalize; }
    .campaign-grid { display: grid; gap: 16px;
                     grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
    .camp-card { background: var(--card); border-radius: var(--radius);
                 box-shadow: var(--shadow); overflow: hidden; }
    .camp-header { padding: 14px 16px; border-bottom: 1px solid var(--border); }
    .camp-title { font-weight: 600; font-size: 1rem; }
    .camp-meta { font-size: .8rem; color: var(--text-light); margin-top: 4px; }
    .camp-body { padding: 16px; }
    .metrics-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .metric { text-align: center; padding: 10px; background: var(--bg);
              border-radius: 6px; }
    .metric-label { font-size: .7rem; color: var(--text-light); margin-bottom: 4px; }
    .metric-value { font-size: 1.2rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .camp-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px;
           border: none; border-radius: 6px; cursor: pointer;
           font-size: .8rem; font-weight: 500; text-decoration: none; }
    .btn-sm { padding: 5px 10px; font-size: .75rem; }
    .btn-accent  { background: var(--accent); color: #fff; }
    .btn-green   { background: var(--green); color: #fff; }
    .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn:hover { opacity: .85; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px;
             font-size: .72rem; font-weight: 600; }
    .badge-completada { background: #d4edda; color: #155724; }
    .badge-proceso    { background: #fff3cd; color: #856404; }
    .badge-pendiente  { background: #e2e3e5; color: #383d41; }
    .evidencia-link { color: var(--green); font-size: .8rem; }
    .notas-text { font-size: .8rem; color: var(--text-light); margin-top: 8px;
                  font-style: italic; white-space: pre-wrap; }
    .empty-state { text-align: center; padding: 48px; color: var(--text-light); }
    /* Modal */
    .modal-overlay { display: none; position: fixed; inset: 0;
                     background: rgba(0,0,0,.5); z-index: 1000;
                     align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: #fff; border-radius: var(--radius); padding: 24px;
             width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; }
    .modal h3 { margin-bottom: 16px; }
    .form-group { margin-bottom: 12px; }
    label { display: block; font-size: .85rem; font-weight: 500; margin-bottom: 4px; }
    input[type=number], input[type=file], textarea {
      width: 100%; padding: 8px 10px; border: 1px solid var(--border);
      border-radius: 6px; font-size: .9rem; }
    textarea { resize: vertical; min-height: 80px; }
    .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .btn-cancel { background: #e0e0e0; color: var(--text); }

    @media(max-width:600px) {
      .campaign-grid { grid-template-columns: 1fr; }
      .metrics-grid  { grid-template-columns: 1fr 1fr; }
    }
  </style>
</head>
<body>
<div class="page-wrap">
  <h1>📊 Campañas de marketing</h1>
  <p class="subtitle">Métricas y evidencias por campaña</p>

  <?php if ($mensaje): ?>
    <div class="alert alert-ok">✅ <?= $mensaje ?></div>
  <?php endif; ?>
  <?php if ($error): ?>
    <div class="alert alert-err">❌ <?= htmlspecialchars($error) ?></div>
  <?php endif; ?>

  <div class="section-header">
    <div class="calendar-nav">
      <a href="?mes=<?= $mes_prev ?>">‹</a>
      <h2><?= ucfirst($dt_mes->format('F Y')) ?></h2>
      <a href="?mes=<?= $mes_next ?>">›</a>
    </div>
    <div style="font-size:.85rem;color:var(--text-light)">
      <?= count($campanas) ?> campaña(s) encontradas
    </div>
  </div>

  <?php if (empty($campanas)): ?>
    <div class="empty-state">
      <div style="font-size:2rem;margin-bottom:8px">📭</div>
      <p>Sin campañas para <?= $dt_mes->format('F Y') ?>.</p>
      <p style="font-size:.85rem;margin-top:8px">
        Verificar que el campo "Tipo" exista en N_DB_TAREAS y tenga la opción "Campaña".<br>
        O ajustar el filtro en campanas.php para usar otro criterio.
      </p>
    </div>
  <?php else: ?>
  <div class="campaign-grid">
    <?php foreach ($campanas as $c):
      $badge_cls = match(strtolower($c['estado'])) {
          'completada', 'done', 'completado' => 'badge-completada',
          'en progreso', 'en proceso', 'in progress' => 'badge-proceso',
          default => 'badge-pendiente',
      };
    ?>
    <div class="camp-card">
      <div class="camp-header">
        <div class="camp-title"><?= htmlspecialchars($c['nombre']) ?></div>
        <div class="camp-meta">
          <?php if ($c['fecha']): ?>
            📅 <?= date('d/m/Y', strtotime($c['fecha'])) ?> &nbsp;
          <?php endif; ?>
          <span class="badge <?= $badge_cls ?>"><?= htmlspecialchars($c['estado']) ?></span>
          <?php if ($c['asignado']): ?>
            &nbsp;👤 <?= htmlspecialchars($c['asignado']) ?>
          <?php endif; ?>
        </div>
      </div>
      <div class="camp-body">
        <!-- Métricas actuales -->
        <div class="metrics-grid">
          <div class="metric">
            <div class="metric-label">Solicitudes</div>
            <div class="metric-value" style="color:var(--accent)">
              <?= $c['solicitudes'] !== null ? number_format($c['solicitudes']) : '—' ?>
            </div>
          </div>
          <div class="metric">
            <div class="metric-label">Créditos</div>
            <div class="metric-value" style="color:var(--green)">
              <?= $c['creditos'] !== null ? number_format($c['creditos']) : '—' ?>
            </div>
          </div>
          <div class="metric">
            <div class="metric-label">Monto</div>
            <div class="metric-value" style="color:var(--yellow);font-size:.95rem">
              <?= $c['monto'] !== null ? '$' . number_format($c['monto'], 0) : '—' ?>
            </div>
          </div>
        </div>

        <?php if ($c['notas']): ?>
          <div class="notas-text"><?= htmlspecialchars($c['notas']) ?></div>
        <?php endif; ?>

        <?php if ($c['evidencia']): ?>
          <div style="margin-top:8px">
            <a href="<?= htmlspecialchars($c['evidencia']) ?>" target="_blank" class="evidencia-link">
              📎 Ver evidencia
            </a>
          </div>
        <?php endif; ?>

        <!-- Acciones -->
        <div class="camp-actions">
          <button class="btn btn-accent btn-sm"
                  onclick="abrirModalMetricas(
                    '<?= $c['id'] ?>',
                    <?= (int)($c['solicitudes'] ?? 0) ?>,
                    <?= (int)($c['creditos'] ?? 0) ?>,
                    <?= (float)($c['monto'] ?? 0) ?>,
                    <?= json_encode($c['notas']) ?>
                  )">
            ✏️ Editar métricas
          </button>
          <button class="btn btn-green btn-sm"
                  onclick="abrirModalEvidencia('<?= $c['id'] ?>', <?= json_encode($c['nombre']) ?>)">
            📎 Subir evidencia
          </button>
        </div>
      </div>
    </div>
    <?php endforeach; ?>
  </div>

  <!-- Resumen del mes -->
  <?php
  $tot_sol  = array_sum(array_filter(array_column($campanas, 'solicitudes'), fn($v) => $v !== null));
  $tot_cred = array_sum(array_filter(array_column($campanas, 'creditos'), fn($v) => $v !== null));
  $tot_mnt  = array_sum(array_filter(array_column($campanas, 'monto'), fn($v) => $v !== null));
  ?>
  <div style="display:flex;gap:16px;margin-top:24px;flex-wrap:wrap">
    <div style="background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px;flex:1;min-width:140px">
      <div style="font-size:.75rem;color:var(--text-light)">Total solicitudes</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--accent)"><?= number_format($tot_sol) ?></div>
    </div>
    <div style="background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px;flex:1;min-width:140px">
      <div style="font-size:.75rem;color:var(--text-light)">Créditos otorgados</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--green)"><?= number_format($tot_cred) ?></div>
    </div>
    <div style="background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px;flex:1;min-width:140px">
      <div style="font-size:.75rem;color:var(--text-light)">Monto total</div>
      <div style="font-size:1.4rem;font-weight:700;color:var(--yellow)">$<?= number_format($tot_mnt, 0) ?></div>
    </div>
  </div>
  <?php endif; ?>

</div>

<!-- ── Modal: Editar métricas ──────────────────────────────────────────── -->
<div class="modal-overlay" id="modal-metricas">
  <div class="modal">
    <h3>✏️ Editar métricas</h3>
    <form method="POST" action="campanas.php">
      <input type="hidden" name="action" value="guardar_metricas">
      <input type="hidden" name="page_id" id="met-page-id">
      <div class="form-group">
        <label>Solicitudes recibidas</label>
        <input type="number" name="solicitudes" id="met-solicitudes" min="0">
      </div>
      <div class="form-group">
        <label>Créditos otorgados</label>
        <input type="number" name="creditos_otorgados" id="met-creditos" min="0">
      </div>
      <div class="form-group">
        <label>Monto total otorgado (MXN)</label>
        <input type="number" name="monto_otorgado" id="met-monto" min="0" step="100">
      </div>
      <div class="form-group">
        <label>Notas / observaciones</label>
        <textarea name="notas" id="met-notas" placeholder="Notas adicionales de la campaña..."></textarea>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-cancel" onclick="cerrarModal('modal-metricas')">Cancelar</button>
        <button type="submit" class="btn btn-accent">Guardar</button>
      </div>
    </form>
  </div>
</div>

<!-- ── Modal: Subir evidencia ─────────────────────────────────────────── -->
<div class="modal-overlay" id="modal-evidencia">
  <div class="modal">
    <h3>📎 Subir evidencia</h3>
    <p id="ev-concepto" style="margin-bottom:16px;color:var(--text-light);font-size:.9rem"></p>
    <form method="POST" action="campanas.php" enctype="multipart/form-data">
      <input type="hidden" name="action" value="subir_evidencia">
      <input type="hidden" name="page_id" id="ev-page-id">
      <div class="form-group">
        <label>Archivo (imagen, PDF o video, máx. 20 MB)</label>
        <input type="file" name="evidencia"
               accept="image/*,.pdf,video/mp4,video/quicktime" required>
      </div>
      <p style="font-size:.75rem;color:var(--text-light);margin-top:4px">
        ⚠️ Solo se guarda la última evidencia como URL. Para múltiples evidencias,
        sube una por una — la URL anterior se anota en Observaciones.
      </p>
      <div class="modal-actions">
        <button type="button" class="btn btn-cancel" onclick="cerrarModal('modal-evidencia')">Cancelar</button>
        <button type="submit" class="btn btn-green">Subir</button>
      </div>
    </form>
  </div>
</div>

<script>
function abrirModalMetricas(id, sol, cred, monto, notas) {
  document.getElementById('met-page-id').value      = id;
  document.getElementById('met-solicitudes').value  = sol || '';
  document.getElementById('met-creditos').value     = cred || '';
  document.getElementById('met-monto').value        = monto || '';
  document.getElementById('met-notas').value        = notas || '';
  document.getElementById('modal-metricas').classList.add('open');
}
function abrirModalEvidencia(id, nombre) {
  document.getElementById('ev-page-id').value    = id;
  document.getElementById('ev-concepto').textContent = nombre;
  document.getElementById('modal-evidencia').classList.add('open');
}
function cerrarModal(id) {
  document.getElementById(id).classList.remove('open');
}
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});
</script>
<?php if (file_exists(__DIR__ . '/footer.php')) require_once __DIR__ . '/footer.php'; ?>
</body>
</html>

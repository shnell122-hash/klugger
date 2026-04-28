<?php
/**
 * pagos.php — Módulo de gestión de pagos (Vianey / admin)
 * Muestra calendario del mes, lista de pagos, permite registrar pago
 * y subir comprobante. Usa N_DB_SALDOS como fuente en Notion.
 *
 * DESPLEGAR en: /var/www/catalogos/tareas/pagos.php
 *
 * CAMPOS necesarios en N_DB_SALDOS (crearlos en Notion si no existen):
 *   Concepto           title
 *   Monto              number
 *   Fecha programada   date
 *   Estado             select  → opciones: Pendiente | Pagado | Vencido
 *   Comprobante URL    url
 *   Responsable        people
 *   Mes                select  → e.g. "2026-05"
 */

require_once __DIR__ . '/auth.php';
requireLogin();

require_once __DIR__ . '/notion_helper.php';

// VERIFICAR: cómo auth.php expone el usuario activo.
// Posibles variables: $_SESSION['usuario'], $_SESSION['nombre'], $_SESSION['user']
$usuario_actual = $_SESSION['usuario'] ?? $_SESSION['nombre'] ?? '';

// Acceso: solo admin (German Villar) y el responsable de pagos (ajustar)
// Si auth.php tiene roles, usar $_SESSION['rol'] === 'admin'
$admins  = ['German Villar'];
$es_admin = in_array($usuario_actual, $admins);
// Cualquier usuario puede ver, pero solo admin puede crear/editar (ajustar según necesidad)

// ─── POST handlers ────────────────────────────────────────────────────────
$mensaje = '';
$error   = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    // ── Registrar / actualizar pago ───────────────────────────────────────
    if ($action === 'registrar_pago') {
        $page_id  = trim($_POST['page_id'] ?? '');
        $concepto = trim($_POST['concepto'] ?? '');
        $monto    = (float)($_POST['monto'] ?? 0);
        $fecha    = trim($_POST['fecha'] ?? ''); // YYYY-MM-DD
        $estado   = trim($_POST['estado'] ?? 'Pendiente');
        $mes      = substr($fecha, 0, 7); // YYYY-MM

        if ($page_id) {
            // Actualizar página existente
            // VERIFICAR: firma de nReq en notion_helper.php
            $resp = nReq('PATCH', '/pages/' . $page_id, [
                'properties' => [
                    'Estado' => ['select' => ['name' => $estado]],
                    'Monto'  => ['number' => $monto],
                ],
            ]);
            $mensaje = "Pago actualizado correctamente.";
        } else {
            // Crear nueva página en N_DB_SALDOS
            $resp = nReq('POST', '/pages', [
                'parent'     => ['database_id' => getenv('N_DB_SALDOS')],
                'properties' => [
                    'Concepto'          => ['title'  => [['text' => ['content' => $concepto]]]],
                    'Monto'             => ['number' => $monto],
                    'Fecha programada'  => ['date'   => ['start' => $fecha]],
                    'Estado'            => ['select' => ['name' => 'Pendiente']],
                    'Mes'               => ['select' => ['name' => $mes]],
                ],
            ]);
            if (!empty($resp['id'])) {
                $mensaje = "Pago registrado correctamente.";
            } else {
                $error = "Error al crear el pago. Verificar campos en Notion.";
            }
        }
    }

    // ── Marcar como pagado ────────────────────────────────────────────────
    if ($action === 'marcar_pagado') {
        $page_id = trim($_POST['page_id'] ?? '');
        if ($page_id) {
            nReq('PATCH', '/pages/' . $page_id, [
                'properties' => [
                    'Estado' => ['select' => ['name' => 'Pagado']],
                ],
            ]);
            $mensaje = "Pago marcado como pagado.";
        }
    }

    // ── Subir comprobante ─────────────────────────────────────────────────
    if ($action === 'subir_comprobante') {
        $page_id = trim($_POST['page_id'] ?? '');
        $file    = $_FILES['comprobante'] ?? null;

        if (!$page_id) {
            $error = "ID de pago requerido.";
        } elseif (!$file || $file['error'] !== UPLOAD_ERR_OK) {
            $error = "Error al subir el archivo.";
        } else {
            $ext_permitidas = ['jpg','jpeg','png','gif','pdf','webp'];
            $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
            if (!in_array($ext, $ext_permitidas)) {
                $error = "Tipo de archivo no permitido. Use: " . implode(', ', $ext_permitidas);
            } else {
                $mes_dir  = date('Y-m');
                $dir_base = __DIR__ . '/comprobantes/' . $mes_dir;
                if (!is_dir($dir_base)) {
                    mkdir($dir_base, 0755, true);
                }
                // Nombre de archivo: page_id + timestamp + extensión
                $nombre_archivo = preg_replace('/[^a-f0-9\-]/', '', $page_id) . '_' . time() . '.' . $ext;
                $ruta_destino   = $dir_base . '/' . $nombre_archivo;

                if (move_uploaded_file($file['tmp_name'], $ruta_destino)) {
                    // URL pública del comprobante
                    $proto      = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                    $host       = $_SERVER['HTTP_HOST'] ?? 'tareas.ruby.lease';
                    $url_public = "$proto://$host/comprobantes/$mes_dir/$nombre_archivo";

                    nReq('PATCH', '/pages/' . $page_id, [
                        'properties' => [
                            'Comprobante URL' => ['url' => $url_public],
                            'Estado'          => ['select' => ['name' => 'Pagado']],
                        ],
                    ]);
                    $mensaje = "Comprobante subido correctamente.";
                } else {
                    $error = "No se pudo guardar el archivo. Verificar permisos en $dir_base";
                }
            }
        }
    }

    // Redirigir para evitar reenvío del formulario
    $qs = $mensaje ? '?ok=' . urlencode($mensaje) : ($error ? '?err=' . urlencode($error) : '');
    header('Location: pagos.php' . $qs);
    exit;
}

// Leer mensajes de redirección
if (!$mensaje && !$error) {
    $mensaje = $_GET['ok']  ?? '';
    $error   = $_GET['err'] ?? '';
}

// ─── Cargar pagos del mes actual (y 2 meses atrás para historial) ─────────
$hoy     = new DateTimeImmutable();
$mes_sel = $_GET['mes'] ?? $hoy->format('Y-m');

// Validar formato YYYY-MM
if (!preg_match('/^\d{4}-\d{2}$/', $mes_sel)) {
    $mes_sel = $hoy->format('Y-m');
}

$primer_dia = $mes_sel . '-01';
$ultimo_dia = $mes_sel . '-' . date('t', strtotime($primer_dia));

// Query a Notion filtrando por Mes o por rango de Fecha programada
// VERIFICAR: nombre exacto del campo 'Mes' en N_DB_SALDOS (puede ser select o rich_text)
$pagos_raw = nQuery('N_DB_SALDOS', [
    'filter' => [
        'or' => [
            [
                'property' => 'Mes',
                'select'   => ['equals' => $mes_sel],
            ],
            [
                'and' => [
                    ['property' => 'Fecha programada', 'date' => ['on_or_after' => $primer_dia]],
                    ['property' => 'Fecha programada', 'date' => ['on_or_before' => $ultimo_dia]],
                ],
            ],
        ],
    ],
    'sorts'     => [['property' => 'Fecha programada', 'direction' => 'ascending']],
    'page_size' => 100,
]);

// Normalizar datos
$pagos = [];
foreach ($pagos_raw as $p) {
    $pr = $p['properties'] ?? [];
    // nNum / nDate / nSel — VERIFICAR helpers en notion_helper.php
    // Si no existen, acceder directamente: $pr['Monto']['number'], etc.
    $pagos[] = [
        'id'       => $p['id'],
        'concepto' => nT($pr['Concepto'] ?? null),
        'monto'    => $pr['Monto']['number']          ?? 0,
        'fecha'    => $pr['Fecha programada']['date']['start'] ?? '',
        'estado'   => $pr['Estado']['select']['name'] ?? 'Pendiente',
        'url_comp' => $pr['Comprobante URL']['url']   ?? '',
        'responsable' => implode(', ', array_column($pr['Responsable']['people'] ?? [], 'name')),
    ];
}

// ─── Datos para el calendario ─────────────────────────────────────────────
$pagos_por_dia = [];
foreach ($pagos as $pago) {
    if ($pago['fecha']) {
        $dia = (int) substr($pago['fecha'], 8, 2);
        $pagos_por_dia[$dia][] = $pago;
    }
}

// Mes anterior / siguiente para navegación
$dt_mes     = new DateTimeImmutable($primer_dia);
$mes_prev   = $dt_mes->modify('-1 month')->format('Y-m');
$mes_next   = $dt_mes->modify('+1 month')->format('Y-m');
$dias_en_mes = (int) $dt_mes->format('t');
$primer_dow  = (int) $dt_mes->format('N'); // 1=Lun ... 7=Dom

// ─── HTML ─────────────────────────────────────────────────────────────────
$titulo_mes = $dt_mes->format('F Y');

// Incluir header/sidebar del sistema si existen
if (file_exists(__DIR__ . '/header.php')) require_once __DIR__ . '/header.php';
?>
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>💳 Pagos — VILAR</title>
  <style>
    /* ── Variables de diseño — ajustar para que coincidan con el sistema ── */
    :root {
      --bg:       #f5f5f5;
      --card:     #ffffff;
      --border:   #e0e0e0;
      --accent:   #2c3e50;
      --green:    #27ae60;
      --yellow:   #f39c12;
      --red:      #e74c3c;
      --gray:     #95a5a6;
      --text:     #333333;
      --text-light: #666666;
      --radius:   8px;
      --shadow:   0 1px 4px rgba(0,0,0,.1);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: var(--bg); color: var(--text); }
    .page-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .subtitle { color: var(--text-light); margin-bottom: 24px; font-size: .9rem; }

    /* Alertas */
    .alert { padding: 10px 16px; border-radius: var(--radius); margin-bottom: 16px; font-size: .9rem; }
    .alert-ok  { background: #d4edda; color: #155724; }
    .alert-err { background: #f8d7da; color: #721c24; }

    /* Botones */
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
           border: none; border-radius: var(--radius); cursor: pointer;
           font-size: .875rem; font-weight: 500; text-decoration: none; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-success { background: var(--green); color: #fff; }
    .btn-sm { padding: 5px 10px; font-size: .8rem; }
    .btn:hover { opacity: .85; }

    /* Cabecera de sección */
    .section-header { display: flex; align-items: center; justify-content: space-between;
                      margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }

    /* Calendario */
    .calendar-nav { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .calendar-nav a { color: var(--accent); text-decoration: none; font-size: 1.2rem; }
    .calendar-nav h2 { font-size: 1.1rem; text-transform: capitalize; }
    .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr);
                     gap: 4px; margin-bottom: 32px; }
    .cal-header { text-align: center; font-size: .75rem; font-weight: 600;
                  color: var(--text-light); padding: 4px; }
    .cal-day { background: var(--card); border: 1px solid var(--border);
               border-radius: 6px; min-height: 64px; padding: 6px;
               font-size: .8rem; position: relative; }
    .cal-day.vacio { background: transparent; border: none; }
    .cal-day.hoy   { border-color: var(--accent); font-weight: 700; }
    .cal-num { font-size: .85rem; font-weight: 600; margin-bottom: 4px; }
    .cal-pago { font-size: .7rem; padding: 2px 4px; border-radius: 3px;
                margin-bottom: 2px; truncate: ; overflow: hidden;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cal-pago.pagado-c  { background: #d4edda; color: #155724; }  /* verde: con comprobante */
    .cal-pago.pagado-sc { background: #fff3cd; color: #856404; }  /* amarillo: sin comprobante */
    .cal-pago.pendiente { background: #f8d7da; color: #721c24; }  /* rojo: vencido pendiente */
    .cal-pago.futuro    { background: #e2e3e5; color: #383d41; }  /* gris: futuro */

    /* Tabla de pagos */
    .card { background: var(--card); border-radius: var(--radius);
            box-shadow: var(--shadow); overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th { background: var(--accent); color: #fff; text-align: left;
         padding: 10px 12px; font-size: .85rem; }
    td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: .875rem; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f9f9f9; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px;
             font-size: .75rem; font-weight: 600; }
    .badge-pendiente { background: #ffeeba; color: #856404; }
    .badge-pagado    { background: #d4edda; color: #155724; }
    .badge-vencido   { background: #f5c6cb; color: #721c24; }
    .monto { font-variant-numeric: tabular-nums; font-weight: 600; }
    .comp-link { color: var(--green); text-decoration: none; font-size: .8rem; }

    /* Modal */
    .modal-overlay { display: none; position: fixed; inset: 0;
                     background: rgba(0,0,0,.5); z-index: 1000;
                     align-items: center; justify-content: center; }
    .modal-overlay.open { display: flex; }
    .modal { background: var(--card); border-radius: var(--radius); padding: 24px;
             width: 100%; max-width: 480px; box-shadow: 0 8px 32px rgba(0,0,0,.2); }
    .modal h3 { margin-bottom: 16px; font-size: 1.1rem; }
    .form-group { margin-bottom: 14px; }
    label { display: block; font-size: .85rem; font-weight: 500; margin-bottom: 4px; }
    input[type=text], input[type=number], input[type=date], select, input[type=file] {
      width: 100%; padding: 8px 10px; border: 1px solid var(--border);
      border-radius: 6px; font-size: .9rem; }
    .modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .btn-cancel { background: #e0e0e0; color: var(--text); }
    .leyenda { display: flex; gap: 16px; flex-wrap: wrap; font-size: .8rem;
               margin-bottom: 8px; }
    .leyenda span { display: flex; align-items: center; gap: 4px; }
    .dot { width: 12px; height: 12px; border-radius: 3px; }

    @media (max-width: 600px) {
      .cal-day { min-height: 48px; }
      .cal-pago { display: none; }
      table { font-size: .8rem; }
      td, th { padding: 7px 8px; }
    }
  </style>
</head>
<body>
<div class="page-wrap">

  <h1>💳 Gestión de Pagos</h1>
  <p class="subtitle">Pagos programados y comprobantes</p>

  <?php if ($mensaje): ?>
    <div class="alert alert-ok">✅ <?= htmlspecialchars($mensaje) ?></div>
  <?php endif; ?>
  <?php if ($error): ?>
    <div class="alert alert-err">❌ <?= htmlspecialchars($error) ?></div>
  <?php endif; ?>

  <!-- Cabecera: navegación de mes + botón nuevo pago -->
  <div class="section-header">
    <div class="calendar-nav">
      <a href="?mes=<?= $mes_prev ?>" title="Mes anterior">‹</a>
      <h2><?= ucfirst($titulo_mes) ?></h2>
      <a href="?mes=<?= $mes_next ?>" title="Mes siguiente">›</a>
    </div>
    <?php if ($es_admin): ?>
      <button class="btn btn-primary" onclick="abrirModalNuevo()">+ Nuevo pago</button>
    <?php endif; ?>
  </div>

  <!-- Leyenda del calendario -->
  <div class="leyenda">
    <span><span class="dot" style="background:#d4edda"></span> Pagado con comprobante</span>
    <span><span class="dot" style="background:#fff3cd"></span> Pagado sin comprobante</span>
    <span><span class="dot" style="background:#f8d7da"></span> Vencido / pendiente</span>
    <span><span class="dot" style="background:#e2e3e5"></span> Programado</span>
  </div>

  <!-- Calendario del mes -->
  <div class="calendar-grid">
    <?php foreach (['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'] as $d): ?>
      <div class="cal-header"><?= $d ?></div>
    <?php endforeach; ?>

    <?php
    // Días vacíos al inicio (semana empieza en Lunes)
    for ($i = 1; $i < $primer_dow; $i++):
    ?><div class="cal-day vacio"></div><?php endfor;

    for ($dia = 1; $dia <= $dias_en_mes; $dia++):
      $fecha_dia = $mes_sel . '-' . str_pad($dia, 2, '0', STR_PAD_LEFT);
      $es_hoy    = ($fecha_dia === $hoy->format('Y-m-d'));
      $pagos_dia = $pagos_por_dia[$dia] ?? [];
    ?>
    <div class="cal-day <?= $es_hoy ? 'hoy' : '' ?>">
      <div class="cal-num"><?= $dia ?></div>
      <?php foreach ($pagos_dia as $pago):
        $vencido = ($pago['fecha'] < $hoy->format('Y-m-d') && $pago['estado'] === 'Pendiente');
        if ($pago['estado'] === 'Pagado' && $pago['url_comp']) {
            $clase = 'pagado-c';
        } elseif ($pago['estado'] === 'Pagado') {
            $clase = 'pagado-sc';
        } elseif ($vencido) {
            $clase = 'pendiente';
        } else {
            $clase = 'futuro';
        }
      ?>
        <div class="cal-pago <?= $clase ?>" title="<?= htmlspecialchars($pago['concepto']) ?>">
          <?= htmlspecialchars(mb_substr($pago['concepto'], 0, 18)) ?>
        </div>
      <?php endforeach; ?>
    </div>
    <?php endfor; ?>
  </div>

  <!-- Tabla de pagos del mes -->
  <div class="card">
    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th>Fecha</th>
          <th>Monto</th>
          <th>Estado</th>
          <th>Comprobante</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <?php if (empty($pagos)): ?>
          <tr><td colspan="6" style="text-align:center;color:var(--text-light);padding:24px">
            Sin pagos registrados para <?= htmlspecialchars($titulo_mes) ?>
          </td></tr>
        <?php endif; ?>
        <?php foreach ($pagos as $pago):
          $vencido   = ($pago['fecha'] < $hoy->format('Y-m-d') && $pago['estado'] === 'Pendiente');
          $badge_cls = match($pago['estado']) {
              'Pagado'  => 'badge-pagado',
              'Vencido' => 'badge-vencido',
              default   => 'badge-pendiente',
          };
          $estado_lbl = $vencido ? 'Vencido' : $pago['estado'];
        ?>
        <tr>
          <td><?= htmlspecialchars($pago['concepto']) ?></td>
          <td><?= $pago['fecha'] ? date('d/m/Y', strtotime($pago['fecha'])) : '—' ?></td>
          <td class="monto">$<?= number_format($pago['monto'], 2) ?></td>
          <td><span class="badge <?= $badge_cls ?>"><?= $estado_lbl ?></span></td>
          <td>
            <?php if ($pago['url_comp']): ?>
              <a href="<?= htmlspecialchars($pago['url_comp']) ?>" target="_blank"
                 class="comp-link">📎 Ver</a>
            <?php else: ?>
              <span style="color:var(--gray);font-size:.8rem">Sin comprobante</span>
            <?php endif; ?>
          </td>
          <td style="white-space:nowrap">
            <?php if ($pago['estado'] !== 'Pagado'): ?>
              <button class="btn btn-success btn-sm"
                      onclick="marcarPagado('<?= $pago['id'] ?>')">
                ✅ Pagado
              </button>
            <?php endif; ?>
            <button class="btn btn-sm" style="background:#3498db;color:#fff"
                    onclick="abrirModalComprobante('<?= $pago['id'] ?>', '<?= htmlspecialchars(addslashes($pago['concepto'])) ?>')">
              📎 Comprobante
            </button>
          </td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>

  <!-- Resumen del mes -->
  <?php
  $total_programado = array_sum(array_column($pagos, 'monto'));
  $total_pagado     = array_sum(array_map(fn($p) => $p['estado'] === 'Pagado' ? $p['monto'] : 0, $pagos));
  $pendientes       = count(array_filter($pagos, fn($p) => $p['estado'] !== 'Pagado'));
  ?>
  <div style="display:flex;gap:16px;margin-top:16px;flex-wrap:wrap">
    <div class="card" style="flex:1;padding:16px;min-width:160px">
      <div style="font-size:.8rem;color:var(--text-light)">Total programado</div>
      <div class="monto" style="font-size:1.3rem">$<?= number_format($total_programado, 2) ?></div>
    </div>
    <div class="card" style="flex:1;padding:16px;min-width:160px">
      <div style="font-size:.8rem;color:var(--text-light)">Total pagado</div>
      <div class="monto" style="font-size:1.3rem;color:var(--green)">$<?= number_format($total_pagado, 2) ?></div>
    </div>
    <div class="card" style="flex:1;padding:16px;min-width:160px">
      <div style="font-size:.8rem;color:var(--text-light)">Pendientes</div>
      <div style="font-size:1.3rem;font-weight:700;color:<?= $pendientes > 0 ? 'var(--red)' : 'var(--green)' ?>">
        <?= $pendientes ?>
      </div>
    </div>
  </div>

</div><!-- /page-wrap -->

<!-- ── Modal: Nuevo pago ─────────────────────────────────────────────────── -->
<div class="modal-overlay" id="modal-nuevo">
  <div class="modal">
    <h3>+ Nuevo pago programado</h3>
    <form method="POST" action="pagos.php">
      <input type="hidden" name="action" value="registrar_pago">
      <div class="form-group">
        <label>Concepto *</label>
        <input type="text" name="concepto" required placeholder="Ej: Renta oficina">
      </div>
      <div class="form-group">
        <label>Monto (MXN) *</label>
        <input type="number" name="monto" required min="0" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label>Fecha programada *</label>
        <input type="date" name="fecha" required value="<?= $mes_sel . '-01' ?>">
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-cancel" onclick="cerrarModal('modal-nuevo')">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar</button>
      </div>
    </form>
  </div>
</div>

<!-- ── Modal: Subir comprobante ──────────────────────────────────────────── -->
<div class="modal-overlay" id="modal-comprobante">
  <div class="modal">
    <h3>📎 Subir comprobante</h3>
    <p id="comp-concepto" style="margin-bottom:16px;color:var(--text-light);font-size:.9rem"></p>
    <form method="POST" action="pagos.php" enctype="multipart/form-data">
      <input type="hidden" name="action" value="subir_comprobante">
      <input type="hidden" name="page_id" id="comp-page-id">
      <div class="form-group">
        <label>Archivo (imagen o PDF, máx. 10 MB)</label>
        <input type="file" name="comprobante" accept="image/*,.pdf" required>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-cancel" onclick="cerrarModal('modal-comprobante')">Cancelar</button>
        <button type="submit" class="btn btn-success">Subir</button>
      </div>
    </form>
  </div>
</div>

<!-- ── Modal: Marcar pagado ──────────────────────────────────────────────── -->
<form method="POST" action="pagos.php" id="form-pagado">
  <input type="hidden" name="action" value="marcar_pagado">
  <input type="hidden" name="page_id" id="pagado-page-id">
</form>

<script>
function abrirModalNuevo() {
  document.getElementById('modal-nuevo').classList.add('open');
}
function abrirModalComprobante(pageId, concepto) {
  document.getElementById('comp-page-id').value = pageId;
  document.getElementById('comp-concepto').textContent = concepto;
  document.getElementById('modal-comprobante').classList.add('open');
}
function cerrarModal(id) {
  document.getElementById(id).classList.remove('open');
}
function marcarPagado(pageId) {
  if (!confirm('¿Confirmar pago sin comprobante?')) return;
  document.getElementById('pagado-page-id').value = pageId;
  document.getElementById('form-pagado').submit();
}
// Cerrar modal al hacer clic en overlay
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});
</script>
<?php if (file_exists(__DIR__ . '/footer.php')) require_once __DIR__ . '/footer.php'; ?>
</body>
</html>

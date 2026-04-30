# Cambios necesarios en sidebar.php

Agregar estas entradas en el sidebar del sistema, con visibilidad condicional
según el usuario logueado.

## Código a agregar en sidebar.php

```php
<?php
// VERIFICAR: cómo auth.php expone $_SESSION['usuario']
$u = $_SESSION['usuario'] ?? '';
$es_admin  = in_array($u, ['German Villar']);
$es_hector = ($u === 'Hector Martinez');
// Si Vianey no está en el sistema de auth, agregar su nombre a auth.php
// y definir aquí: $es_vianey = ($u === 'Vianey ...');
// Por ahora, solo admin ve pagos.
$ve_pagos    = $es_admin; // cambiar a: $es_admin || $es_vianey
$ve_campanas = $es_admin || $es_hector;
?>

<?php if ($ve_campanas): ?>
<a href="campanas.php" class="sidebar-link <?= basename($_SERVER['PHP_SELF']) === 'campanas.php' ? 'active' : '' ?>">
  📊 Campañas
</a>
<?php endif; ?>

<?php if ($ve_pagos): ?>
<a href="pagos.php" class="sidebar-link <?= basename($_SERVER['PHP_SELF']) === 'pagos.php' ? 'active' : '' ?>">
  💳 Pagos
</a>
<?php endif; ?>
```

## Notas

- Si el sistema usa clases CSS diferentes para links activos, ajustar `active`.
- Si sidebar.php usa `<li>` en lugar de `<a>` directo, envolver en la estructura correcta.
- Agregar a Vianey como usuario en auth.php antes de activar `$ve_pagos` para ella.

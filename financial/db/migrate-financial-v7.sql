-- Migración v7: Extender ENUM estado en fin_sessions con todos los estados del bot
-- Compatible con MySQL 5.7+ / MySQL 8.0

ALTER TABLE fin_sessions
  MODIFY COLUMN estado ENUM(
    'idle',
    'esperando_tipo',
    'esperando_monto',
    'esperando_entrega',
    'esperando_confirmacion',
    'esperando_edicion',
    'esperando_datos_bancarios',
    'confirmando_cuentas',
    'confirmando_factura',
    'confirmando_comprobante',
    'completado'
  ) NOT NULL DEFAULT 'idle';

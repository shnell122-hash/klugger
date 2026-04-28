-- Elimina cuentas bancarias duplicadas del mismo cliente (mantiene el registro más antiguo)
DELETE b1 FROM fin_banking_accounts b1
INNER JOIN fin_banking_accounts b2
  ON b1.client_id = b2.client_id
 AND b1.numero    = b2.numero
 AND b1.id        > b2.id;

-- Elimina cuentas que coincidan con nuestras CLABEs propias
DELETE b FROM fin_banking_accounts b
INNER JOIN fin_empresa_cuentas ec
  ON REPLACE(b.numero, ' ', '') = REPLACE(ec.clabe, ' ', '')
  OR REPLACE(b.numero, ' ', '') = REPLACE(COALESCE(ec.num_cuenta,''), ' ', '')
INNER JOIN fin_empresas e ON e.id = ec.empresa_id AND e.origen = 'nuestra';

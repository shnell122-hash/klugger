// DB smoke-test helper — run on server with: node dbcheck.js
const fs = require('fs');
const { spawnSync } = require('child_process');

const env = fs.readFileSync('/var/www/catalogos/OCR/v59/api/.env', 'utf8');
const get = k => { const m = env.match(new RegExp('^' + k + '=(.+)', 'm')); return m ? m[1].trim() : ''; };

const H = get('DB_HOST') || 'localhost';
const U = get('DB_USER') || get('DB_USERNAME');
const P = get('DB_PASS') || get('DB_PASSWORD');
const D = get('DB_NAME') || get('DB_DATABASE');

console.log('DB =>', H, D, U ? '(user ok)' : '(NO USER)');

function q(sql) {
  const r = spawnSync('mysql', ['-h', H, '-u', U, '-p' + P, D, '--batch', '-e', sql], { timeout: 15000 });
  const out = (r.stdout || Buffer.alloc(0)).toString();
  const err = (r.stderr || Buffer.alloc(0)).toString().replace(/[^\n]*password[^\n]*\n?/gi, '');
  if (r.status !== 0 && !out) return 'ERROR: ' + err.trim();
  return out.trim();
}

const SEP = '─'.repeat(50);

console.log('\n' + SEP);
console.log('USERS + ADMIN FLAGS');
console.log(SEP);
console.log(q('SELECT email, is_sub_master, is_org_admin, org_id, role FROM users ORDER BY is_sub_master DESC, is_org_admin DESC LIMIT 30'));

console.log('\n' + SEP);
console.log('is_* COLUMNS IN users');
console.log(SEP);
console.log(q("SHOW COLUMNS FROM users LIKE 'is_%'"));

console.log('\n' + SEP);
console.log('can_create_cases + case_access COLUMNS');
console.log(SEP);
console.log(q("SHOW COLUMNS FROM users WHERE Field IN ('can_create_cases','case_access','token_limit','password_hash')"));

console.log('\n' + SEP);
console.log('ORGANIZATIONS (active)');
console.log(SEP);
console.log(q('SELECT org_name, sub_master_id FROM organizations WHERE is_active=1'));

console.log('\n' + SEP);
console.log('INVITATIONS TABLE COLUMNS');
console.log(SEP);
console.log(q('SHOW COLUMNS FROM invitations'));

console.log('\n' + SEP);
console.log('SUB_MASTER_RATES');
console.log(SEP);
console.log(q('SELECT COUNT(*) as cnt FROM sub_master_rates'));

console.log('\n' + SEP);
console.log('USER_CASE_ACCESS TABLE');
console.log(SEP);
console.log(q('SHOW COLUMNS FROM user_case_access'));

console.log('\n' + SEP);
console.log('SHARE_SLUG on system_artifacts');
console.log(SEP);
console.log(q("SHOW COLUMNS FROM system_artifacts LIKE 'share_slug'"));

console.log('\n' + SEP);
console.log('PENDING INVITATIONS (unused, not expired)');
console.log(SEP);
console.log(q("SELECT email, role, is_sub_master, org_id, expires_at FROM invitations WHERE used=0 AND expires_at > NOW()"));

console.log('\nDONE');

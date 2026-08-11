const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
const SYSTEM_PASSWORD = process.env.SYSTEM_PASSWORD || '130';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1357924680';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000
  }
}));

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prisoner_files (
      id BIGSERIAL PRIMARY KEY,
      code1 TEXT NOT NULL,
      code2 TEXT,
      secret TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM prisoner_files');
  if (rows[0].count === 0) {
    await pool.query(
      'INSERT INTO prisoner_files (code1, code2, secret) VALUES ($1, $2, $3)',
      ['0000', null, '機密信息尚未設定。\n請由管理後台更新此內容。']
    );
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.role || !roles.includes(req.session.role)) {
      return res.status(401).json({ error: '未登入或權限不足。' });
    }
    next();
  };
}

function cleanCode(v) { return String(v ?? '').trim(); }

async function duplicateCode(code1, code2, ignoreId = null) {
  const values = [code1, code2].filter(Boolean);
  if (!values.length) return null;
  const params = [values];
  let sql = `SELECT id FROM prisoner_files WHERE (code1 = ANY($1::text[]) OR code2 = ANY($1::text[]))`;
  if (ignoreId) {
    params.push(ignoreId);
    sql += ' AND id <> $2';
  }
  sql += ' LIMIT 1';
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

app.get('/api/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch { res.status(500).json({ ok: false }); }
});

app.get('/api/session', (req, res) => res.json({ role: req.session.role || null }));

app.post('/api/login', (req, res) => {
  const password = String(req.body?.password ?? '');
  if (password === ADMIN_PASSWORD) {
    req.session.role = 'admin';
    return res.json({ role: 'admin' });
  }
  if (password === SYSTEM_PASSWORD) {
    req.session.role = 'user';
    return res.json({ role: 'user' });
  }
  res.status(401).json({ error: '登入密碼錯誤。' });
});

app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.post('/api/lookup', requireRole('user', 'admin'), async (req, res, next) => {
  try {
    const code = cleanCode(req.body?.code);
    if (!code) return res.status(400).json({ error: '請輸入囚犯編號。' });
    const { rows } = await pool.query(
      'SELECT id, code1, code2, secret FROM prisoner_files WHERE code1 = $1 OR code2 = $1 LIMIT 1',
      [code]
    );
    if (!rows[0]) return res.status(404).json({ error: '查無此囚犯編號／權限驗證失敗。' });
    const r = rows[0];
    res.json({ id: r.id, codes: [r.code1, r.code2].filter(Boolean), secret: r.secret });
  } catch (e) { next(e); }
});

app.get('/api/admin/prisoners', requireRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, code1, code2, secret, updated_at FROM prisoner_files ORDER BY id');
    res.json(rows);
  } catch (e) { next(e); }
});

app.post('/api/admin/prisoners', requireRole('admin'), async (req, res, next) => {
  try {
    const code1 = cleanCode(req.body?.code1);
    const code2 = cleanCode(req.body?.code2) || null;
    const secret = String(req.body?.secret ?? '');
    if (!code1) return res.status(400).json({ error: '囚犯編號 1 不可留空。' });
    if (code2 && code1 === code2) return res.status(400).json({ error: '兩個囚犯編號不可相同。' });
    if (await duplicateCode(code1, code2)) return res.status(409).json({ error: '其中一個囚犯編號已被其他檔案使用。' });
    const { rows } = await pool.query(
      'INSERT INTO prisoner_files (code1, code2, secret) VALUES ($1,$2,$3) RETURNING id, code1, code2, secret, updated_at',
      [code1, code2, secret]
    );
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

app.put('/api/admin/prisoners/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = req.params.id;
    const code1 = cleanCode(req.body?.code1);
    const code2 = cleanCode(req.body?.code2) || null;
    const secret = String(req.body?.secret ?? '');
    if (!code1) return res.status(400).json({ error: '囚犯編號 1 不可留空。' });
    if (code2 && code1 === code2) return res.status(400).json({ error: '兩個囚犯編號不可相同。' });
    if (await duplicateCode(code1, code2, id)) return res.status(409).json({ error: '其中一個囚犯編號已被其他檔案使用。' });
    const { rows } = await pool.query(
      'UPDATE prisoner_files SET code1=$1, code2=$2, secret=$3, updated_at=NOW() WHERE id=$4 RETURNING id, code1, code2, secret, updated_at',
      [code1, code2, secret, id]
    );
    if (!rows[0]) return res.status(404).json({ error: '找不到此囚犯檔案。' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

app.delete('/api/admin/prisoners/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const r = await pool.query('DELETE FROM prisoner_files WHERE id=$1', [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: '找不到此囚犯檔案。' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete('/api/admin/prisoners', requireRole('admin'), async (req, res, next) => {
  try { await pool.query('DELETE FROM prisoner_files'); res.json({ ok: true }); }
  catch (e) { next(e); }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '伺服器錯誤，請稍後再試。' });
});

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`Police system running on ${PORT}`));
}).catch(err => {
  console.error('Database init failed:', err);
  process.exit(1);
});

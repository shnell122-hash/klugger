'use strict';

/**
 * /api/screenshots — Screenshot gallery API
 *
 * Screenshots are saved by relay-master to frontend/screenshots/
 * Filename format: {project_id}-{timestamp}.png
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');

const SHOTS_DIR     = path.join(__dirname, '..', '..', 'frontend', 'screenshots');
const PROJECTS_FILE = path.join(__dirname, '..', '..', 'relay', 'projects.json');

function ensureDir() {
  try { fs.mkdirSync(SHOTS_DIR, { recursive: true }); } catch (_) {}
}

function listShots() {
  ensureDir();
  try {
    return fs.readdirSync(SHOTS_DIR)
      .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
      .map(f => {
        const full   = path.join(SHOTS_DIR, f);
        const stat   = fs.statSync(full);
        // Filename: {project_id}-{timestamp}.png
        const base   = path.basename(f, path.extname(f));
        const tsIdx  = base.lastIndexOf('-');
        const project_id = tsIdx > 0 ? base.slice(0, tsIdx) : base;
        const tsNum  = tsIdx > 0 ? parseInt(base.slice(tsIdx + 1), 10) : 0;
        return {
          filename:   f,
          project_id,
          url:        `/screenshots/${f}`,
          taken_at:   tsNum ? new Date(tsNum).toISOString() : stat.mtime.toISOString(),
          size_kb:    Math.round(stat.size / 1024),
        };
      })
      .sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at));
  } catch (_) { return []; }
}

// ── GET /api/screenshots ─────────────────────────────────────
router.get('/', (req, res) => {
  const shots  = listShots();
  const limit  = parseInt(req.query.limit || '100', 10);
  const project = req.query.project || null;
  const filtered = project ? shots.filter(s => s.project_id === project) : shots;
  res.json(filtered.slice(0, limit));
});

// ── GET /api/screenshots/projects ────────────────────────────
router.get('/projects', (req, res) => {
  const shots = listShots();
  const byProject = {};
  shots.forEach(s => {
    if (!byProject[s.project_id]) {
      byProject[s.project_id] = { project_id: s.project_id, count: 0, latest: s };
    }
    byProject[s.project_id].count++;
  });
  res.json(Object.values(byProject));
});

// ── POST /api/screenshots/new ─────────────────────────────────
// Called by relay-master after saving a screenshot
router.post('/new', (req, res) => {
  const { filename, project_id, url, verify_url } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename required' });

  const full = path.join(SHOTS_DIR, filename);
  const exists = fs.existsSync(full);
  const stat   = exists ? fs.statSync(full) : null;

  const shot = {
    filename,
    project_id: project_id || filename.split('-')[0],
    url:        url || `/screenshots/${filename}`,
    verify_url: verify_url || null,
    taken_at:   new Date().toISOString(),
    size_kb:    stat ? Math.round(stat.size / 1024) : 0,
  };

  // Broadcast via Socket.io
  const io = req.app.get('io');
  if (io) io.emit('screenshot:new', shot);

  res.json({ ok: true, shot });
});

// ── POST /api/screenshots/sync ───────────────────────────────
// Pull screenshots from all active project repos into frontend/screenshots/
router.post('/sync', (req, res) => {
  ensureDir();
  let projects = [];
  try { projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); } catch (_) {}

  let copied = 0;
  const errors = [];

  for (const proj of projects.filter(p => p.active && p.repo)) {
    // Collect all candidate directories (static + recursive relay-screenshots subdirs)
    const staticCandidates = [
      path.join(proj.repo, 'relay', 'screenshots'),
      path.join(proj.repo, 'screenshots'),
      path.join(proj.repo, 'relay-screenshots'),
    ];
    // Also add immediate subdirs of relay-screenshots (lote2-after, verificacion-issues, etc.)
    const relayScreensDir = path.join(proj.repo, 'relay-screenshots');
    let extraDirs = [];
    try {
      if (fs.existsSync(relayScreensDir)) {
        extraDirs = fs.readdirSync(relayScreensDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => path.join(relayScreensDir, d.name));
      }
    } catch (_) {}

    const candidates = [...staticCandidates, ...extraDirs];

    let latestFile = null;
    let latestMtime = 0;

    for (const dir of candidates) {
      if (!fs.existsSync(dir)) continue;
      let files = [];
      try { files = fs.readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)); }
      catch (_) { continue; }
      for (const f of files) {
        const src  = path.join(dir, f);
        const dest = path.join(SHOTS_DIR, `${proj.id}-${f}`);
        try {
          const mtime = fs.statSync(src).mtimeMs;
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
            copied++;
          }
          if (mtime > latestMtime) { latestMtime = mtime; latestFile = src; }
        } catch (e) { errors.push(`${proj.id}/${f}: ${e.message}`); }
      }
    }

    // Keep {project_id}.png pointing to the newest screenshot (for project card)
    if (latestFile) {
      try {
        fs.copyFileSync(latestFile, path.join(SHOTS_DIR, `${proj.id}.png`));
      } catch (_) {}
    }
  }

  if (copied > 0) {
    const io = req.app.get('io');
    if (io) listShots().slice(0, copied).forEach(s => io.emit('screenshot:new', s));
  }

  res.json({ copied, errors: errors.slice(0, 5) });
});

// ── DELETE /api/screenshots/:filename ────────────────────────
router.delete('/:filename', (req, res) => {
  const safe = path.basename(req.params.filename);  // prevent traversal
  const full = path.join(SHOTS_DIR, safe);
  try {
    fs.unlinkSync(full);
    res.json({ ok: true });
  } catch (_) {
    res.status(404).json({ error: 'Not found' });
  }
});

module.exports = router;

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const GH_TOKEN = process.env.GH_TOKEN;
const GH_REPO = 'rytagencycars/chatbot';
const PAGES_BASE = 'https://rytagencycars.github.io/chatbot/';
const API_BASE = 'https://api.github.com/repos/' + GH_REPO + '/contents/';

const ghHeaders = {
  'Authorization': 'token ' + GH_TOKEN,
  'Accept': 'application/vnd.github.v3+json',
  'Content-Type': 'application/json'
};

// Health check
app.get('/', (req, res) => res.json({ ok: true, service: 'chatbot-api' }));

// GET /clientes
app.get('/clientes', async (req, res) => {
  try {
    const r = await fetch(API_BASE + '_clientes.json', { headers: ghHeaders });
    if (!r.ok) return res.json([]);
    const data = await r.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    res.json(JSON.parse(content));
  } catch(e) {
    res.json([]);
  }
});

// POST /publicar
app.post('/publicar', async (req, res) => {
  try {
    const { slug, nombre, contenido } = req.body;
    if (!slug || !nombre || !contenido) {
      return res.status(400).json({ error: 'Faltan datos: slug, nombre, contenido' });
    }

    const filename = slug + '.js';
    let sha = null;
    try {
      const check = await fetch(API_BASE + filename, { headers: ghHeaders });
      if (check.ok) {
        const d = await check.json();
        sha = d.sha;
      }
    } catch(e) {}

    const body = {
      message: (sha ? 'Update' : 'Create') + ' ' + filename,
      content: Buffer.from(contenido).toString('base64')
    };
    if (sha) body.sha = sha;

    const upR = await fetch(API_BASE + filename, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify(body)
    });
    if (!upR.ok) {
      const err = await upR.text();
      return res.status(500).json({ error: 'Error subiendo JS: ' + err });
    }

    await actualizarIndice(slug, nombre, true, false);

    res.json({
      ok: true,
      url: PAGES_BASE + filename,
      scriptTag: '<script src="' + PAGES_BASE + filename + '"></script>'
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /cliente/:slug
app.delete('/cliente/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const filename = slug + '.js';

    const check = await fetch(API_BASE + filename, { headers: ghHeaders });
    if (!check.ok) return res.status(404).json({ error: 'Cliente no encontrado' });
    const d = await check.json();

    const delR = await fetch(API_BASE + filename, {
      method: 'DELETE',
      headers: ghHeaders,
      body: JSON.stringify({ message: 'Delete ' + filename, sha: d.sha })
    });
    if (!delR.ok) return res.status(500).json({ error: 'Error eliminando archivo' });

    await actualizarIndice(slug, null, false, true);
    res.json({ ok: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

async function actualizarIndice(slug, nombre, hasCfg, eliminar) {
  let clientes = [];
  let sha = null;
  try {
    const r = await fetch(API_BASE + '_clientes.json', { headers: ghHeaders });
    if (r.ok) {
      const d = await r.json();
      sha = d.sha;
      clientes = JSON.parse(Buffer.from(d.content, 'base64').toString('utf-8'));
    }
  } catch(e) {}

  if (eliminar) {
    clientes = clientes.filter(c => c.slug !== slug);
  } else {
    const idx = clientes.findIndex(c => c.slug === slug);
    const entry = { slug, nombre, hasCfg };
    if (idx >= 0) clientes[idx] = entry;
    else clientes.push(entry);
    clientes.sort((a, b) => a.slug.localeCompare(b.slug));
  }

  const body = {
    message: (eliminar ? 'Remove' : 'Update') + ' _clientes.json: ' + slug,
    content: Buffer.from(JSON.stringify(clientes, null, 2)).toString('base64')
  };
  if (sha) body.sha = sha;

  await fetch(API_BASE + '_clientes.json', {
    method: 'PUT',
    headers: ghHeaders,
    body: JSON.stringify(body)
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Chatbot API en puerto ' + PORT));

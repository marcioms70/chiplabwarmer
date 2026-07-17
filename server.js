import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || path.resolve('data/state.json');
const enabled = process.env.ENABLE_DELIVERY === 'true';
const adminToken = process.env.ADMIN_TOKEN;
if (!adminToken || adminToken.length < 16) console.warn('WARNING: configure ADMIN_TOKEN with at least 16 characters.');

const defaults = { participants: [], jobs: [], logs: [] };
function load() { try { return { ...defaults, ...JSON.parse(fs.readFileSync(dataFile, 'utf8')) }; } catch { return structuredClone(defaults); } }
function save(state) { fs.mkdirSync(path.dirname(dataFile), { recursive: true }); fs.writeFileSync(dataFile, JSON.stringify(state, null, 2)); }
function mask(n) { return n.replace(/.(?=.{4})/g, '•'); }
function auth(req, res, next) { if (req.get('x-admin-token') === adminToken || req.query.token === adminToken) return next(); res.status(401).json({ error: 'unauthorized' }); }
app.use(express.json({ limit: '100kb' }));
app.use(express.static('public'));

app.get('/health', (_, res) => res.json({ ok: true, deliveryEnabled: enabled }));
app.get('/api/state', auth, (_, res) => {
  const s = load();
  res.json({ ...s, participants: s.participants.map(({ apiKey, ...p }) => ({ ...p, numberMasked: mask(p.number), hasApiKey: Boolean(apiKey) })) });
});
app.post('/api/participants', auth, (req, res) => {
  const { name, number, instance = '', apiKey = '', provider = 'evolution' } = req.body;
  const normalized = String(number || '').replace(/\D/g, '');
  if (!name || !/^55\d{10,11}$/.test(normalized)) return res.status(400).json({ error: 'Informe nome e número brasileiro no formato 55DDDNUMERO.' });
  if (provider === 'evolution' && (!String(instance).trim() || !String(apiKey).trim())) return res.status(400).json({ error: 'Para Evolution, informe a instância e a chave da API.' });
  const s = load();
  if (s.participants.some(p => p.number === normalized)) return res.status(409).json({ error: 'Número já cadastrado.' });
  s.participants.push({ id: crypto.randomUUID(), name, number: normalized, instance: String(instance).trim(), apiKey: String(apiKey).trim(), provider, approved: false, createdAt: new Date().toISOString() }); save(s); res.status(201).json({ ok: true });
});
app.post('/api/participants/:id/approve', auth, (req, res) => { const s = load(); const p = s.participants.find(x => x.id === req.params.id); if (!p) return res.sendStatus(404); p.approved = !!req.body.approved; save(s); res.json({ ok: true }); });
app.delete('/api/participants/:id', auth, (req, res) => { const s=load(); s.participants=s.participants.filter(x=>x.id!==req.params.id); save(s); res.json({ ok:true }); });

async function deliver(job, from, to) {
  const instance = from.instance || process.env.EVOLUTION_INSTANCE;
  const apiKey = from.apiKey;
  if (!process.env.EVOLUTION_BASE_URL || !instance || !apiKey) throw new Error('Configure EVOLUTION_BASE_URL e cadastre instância e chave no chip remetente.');
  const url = `${process.env.EVOLUTION_BASE_URL}/message/sendText/${encodeURIComponent(instance)}`;
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': apiKey }, body: JSON.stringify({ number: to.number, text: job.message, delay: 0 }) });
  if (!response.ok) throw new Error(`Evolution respondeu HTTP ${response.status}`);
}
app.post('/api/jobs', auth, async (req, res) => {
  const { fromId, toId, message } = req.body; const s = load();
  const from=s.participants.find(p=>p.id===fromId), to=s.participants.find(p=>p.id===toId);
  if (!from || !to || fromId===toId || !from.approved || !to.approved) return res.status(400).json({ error: 'Escolha dois números diferentes, previamente aprovados.' });
  if (!message || String(message).trim().length > 500) return res.status(400).json({ error: 'Mensagem obrigatória, até 500 caracteres.' });
  const job={ id:crypto.randomUUID(), fromId, toId, message:String(message).trim(), createdAt:new Date().toISOString(), status:'simulated' };
  try { if (enabled) { await deliver(job, from, to); job.status='sent'; } } catch (error) { job.status='failed'; job.error=error.message; }
  s.jobs.unshift(job); s.logs.unshift({ at:new Date().toISOString(), action:'message', from:from.name, to:to.name, status:job.status, detail:job.error || 'Mensagem registrada' }); s.logs=s.logs.slice(0,100); save(s); res.status(job.status==='failed'?502:201).json(job);
});
app.listen(port, () => console.log(`Chip Lab Warmer listening on ${port}`));

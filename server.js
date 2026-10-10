const express = require('express');
const path = require('path');
const S = require('./services');
const { connect } = require('./db');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

// Attach the signed-in user (Bearer token) and record every API call.
app.use('/api', async (req, res, next) => {
  try {
    req.token = (req.get('authorization') || '').replace(/^Bearer /i, '');
    req.user = await S.authenticate(req.token);
  } catch (e) { return next(e); }
  res.on('finish', () => S.logApi(req.method, req.originalUrl.split('?')[0], res.statusCode, req.user && req.user.username).catch(() => {}));
  next();
});
const auth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Sign in required.' });
const h = (fn, code = 200) => async (req, res, next) => { try { const r = await fn(req); res.status(code).json(r === undefined ? { ok: true } : r); } catch (e) { next(e); } };

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'lunar-veil-cafe', version: '1.3.0', database: 'mongodb' }));
app.post('/api/auth/signup', h(r => S.signup(r.body), 201));
app.post('/api/auth/login', h(r => S.login(r.body)));
app.post('/api/auth/logout', auth, h(r => S.logout(r.user, r.token)));
app.get('/api/me', auth, h(r => r.user));

app.get('/api/menu', h(() => S.listMenu()));
app.post('/api/menu', auth, h(r => S.addMenu(r.user, r.body), 201));
app.delete('/api/menu/:id', auth, h(r => S.delMenu(r.user, r.params.id)));

app.get('/api/orders', auth, h(r => S.listOrders(r.user)));
app.post('/api/orders', auth, h(r => S.createOrder(r.user, r.body), 201));
app.get('/api/orders/:id', auth, h(r => S.readOrder(r.user, r.params.id)));
app.patch('/api/orders/:id/status', auth, h(r => S.setStatus(r.user, r.params.id, r.body)));
app.get('/api/riders', auth, h(() => S.listRiders()));

app.get('/api/tasks', auth, h(() => S.listTasks()));
app.post('/api/tasks', auth, h(r => S.addTask(r.user, r.body), 201));
app.post('/api/tasks/:id/versions', auth, h(r => S.uploadAsset(r.user, r.params.id, r.body), 201));
app.post('/api/tasks/:id/review', auth, h(r => S.reviewTask(r.user, r.params.id, r.body)));
app.post('/api/tasks/:id/finalize', auth, h(r => S.finalizeTask(r.user, r.params.id)));

app.get('/api/users', auth, h(r => S.listUsers(r.user)));
app.patch('/api/users/:id', auth, h(r => S.setUserStatus(r.user, r.params.id, r.body.status)));
app.get('/api/logs', auth, h(r => S.readLogs(r.user)));
app.get('/api/api-log', auth, h(r => S.readApiLog(r.user)));

app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint.' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((e, req, res, next) => {
  const code = e instanceof S.HttpError ? e.code : e.code == 11000 ? 409 : (e.status || 500);   // 11000 = Mongo duplicate key
  if (code == 500) console.error(e);
  res.status(code).json({ error: code == 500 ? 'Server error.' : e.message });
});
const PORT = process.env.PORT || 3000;
(async () => {
  const db = await connect();
  await S.init(db);
  await S.seed();
  app.listen(PORT, () => console.log('Lunar Veil Cafe running at http://localhost:' + PORT));
})().catch(e => { console.error('Could not start (is MongoDB running? check MONGO_URL):', e.message); process.exit(1); });

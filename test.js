// Runs the business rules against an in-memory Mongo stand-in - no MongoDB needed.
const assert = require('assert'), S = require('./services');
const throws = async (p, code) => { try { await p; } catch (e) { assert.strictEqual(e.code, code, e.message); return; } assert.fail('expected ' + code); };
const mk = (u, role, extra = {}) => S.signup({ username: u, password: 'secret1', role, ...extra });
const as = async u => S.authenticate((await S.login({ username: u, password: 'secret1' })).token);
(async () => {
  const db = require('./test/memdb')(); await S.init(db); await S.seed();
  assert.strictEqual((await S.listMenu()).length, 15); assert.strictEqual((await S.listTasks()).length, 3);
  await mk('cust', 'customer'); await mk('boss', 'administrator', { adminCode: 'LUNAR-ADMIN' }); await mk('chef', 'kitchen staff'); await mk('zed', 'delivery rider');
  await throws(mk('xyz', 'administrator', { adminCode: 'nope' }), 403);
  await throws(mk('cust', 'customer'), 409);
  await throws(S.login({ username: 'chef', password: 'secret1' }), 403);          // pending approval
  const boss = await as('boss'), cust = await as('cust');
  for (const u of (await S.listUsers(boss)).filter(u => u.status == 'pending')) await S.setUserStatus(boss, u.id, 'active');
  const chef = await as('chef'), zed = await as('zed');
  await throws(S.listUsers(cust), 403);
  assert.ok(!JSON.stringify(await S.listUsers(boss)).includes('scrypt') && !('pass' in (await S.listUsers(boss))[0]));

  // GCash flow: pay -> queue -> prepare -> ready -> auto-assign (real rider "zed" preferred) -> deliver
  const o = await S.createOrder(cust, { payment_method: 'GCash', items: [{ item: 'Nebula Latte', qty: 2 }, { item: 'Moon Rock Brownie', qty: 1 }] });
  assert.strictEqual(o.id, 101); assert.strictEqual(o.total, 345); assert.strictEqual(o.status, 'Queued'); assert.strictEqual(o.pay, 'Paid');
  await throws(S.setStatus(cust, o.id, { status: 'Preparing' }), 403);
  await throws(S.setStatus(chef, o.id, { status: 'Ready' }), 409);
  await S.setStatus(chef, o.id, { status: 'Preparing' });
  let r = await S.setStatus(chef, o.id, { status: 'Ready' });
  assert.strictEqual(r.status, 'Out for Delivery'); assert.strictEqual(r.rider, 'zed');
  await throws(S.setStatus(cust, o.id, { status: 'Delivered' }), 403);
  r = await S.setStatus(zed, o.id, { status: 'Delivered' });
  assert.strictEqual(r.status, 'Delivered'); assert.ok(r.history.length >= 7);
  assert.ok((await S.listRiders()).every(x => !x.busy));

  // cash waits for management; client can't fake prices; bad input rejected
  const c = await S.createOrder(cust, { payment_method: 'Cash', items: [{ item: 'Eclipse Espresso', qty: 1, price: 1 }] });
  assert.strictEqual(c.total, 95); assert.strictEqual(c.status, 'Pending Payment');
  await throws(S.setStatus(chef, c.id, { status: 'Paid' }), 403);
  assert.strictEqual((await S.setStatus(boss, c.id, { status: 'Paid' })).status, 'Queued');
  await throws(S.setStatus(boss, c.id, { status: 'Paid' }), 409);                 // can't pay twice
  await throws(S.createOrder(cust, { payment_method: 'Bitcoin', items: [{ item: 'Nebula Latte', qty: 1 }] }), 400);
  await throws(S.createOrder(cust, { payment_method: 'Cash', items: [{ item: 'Nope', qty: 1 }] }), 400);
  await throws(S.createOrder(cust, { payment_method: 'Cash', items: [{ item: 'Nebula Latte', qty: 0 }] }), 400);
  assert.strictEqual((await S.listOrders(cust)).length, 2);
  await mk('other', 'customer'); await throws(S.readOrder(await as('other'), o.id), 404);

  // two orders ready at once with only one free rider: one gets him, other waits (no double-booking)
  const free = (await S.listRiders()).filter(x => !x.busy).length;
  assert.ok(free >= 1);
  const ids = [];
  for (let i = 0; i < free + 1; i++) { const n = await S.createOrder(cust, { payment_method: 'Card', items: [{ item: 'Orbit Croissant', qty: 1 }] }); await S.setStatus(chef, n.id, { status: 'Preparing' }); ids.push(n.id); }
  const res = await Promise.all(ids.map(id => S.setStatus(chef, id, { status: 'Ready' })));
  assert.strictEqual(res.filter(x => x.status == 'Out for Delivery').length, free);
  assert.strictEqual(new Set(res.filter(x => x.rider != '-').map(x => x.rider)).size, free);

  // menu + production workflow
  const m = await S.addMenu(boss, { name: 'Test Tea', price: 50, category: 'Non-coffee' }); await S.delMenu(boss, m.id);
  await throws(S.addMenu(cust, { name: 'x', price: 1 }), 403);
  const t = (await S.listTasks())[0]; await throws(S.finalizeTask(boss, t.id), 409); await throws(S.reviewTask(boss, t.id, { result: 'approve' }), 409);
  await S.uploadAsset(boss, t.id, { file: 'board.pdf', type: 'storyboard' });
  assert.strictEqual((await S.listTasks())[0].status, 'For Review');
  let rt = await S.reviewTask(boss, t.id, { result: 'approve', comment: 'Looks great' });
  assert.strictEqual(rt.versions[0].status, 'Approved'); assert.strictEqual(rt.comments[0].text, 'Looks great');
  rt = await S.finalizeTask(boss, t.id); assert.strictEqual(rt.status, 'Final'); assert.strictEqual(rt.versions[0].status, 'Final');
  assert.ok((await S.readLogs(boss)).audit.length > 10);
  await S.logApi('GET', '/api/menu', 200, 'boss'); assert.strictEqual((await S.readApiLog(boss)).length, 1);

  // logout invalidates the token
  const tok = (await S.login({ username: 'cust', password: 'secret1' })).token;
  await S.logout(cust, tok); assert.strictEqual(await S.authenticate(tok), null);
  console.log('All API service tests passed.');
})().catch(e => { console.error(e); process.exit(1); });

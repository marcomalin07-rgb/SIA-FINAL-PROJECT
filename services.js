// All business rules live here (no Express, no driver import), so they can be tested with any Mongo-compatible db.
const crypto = require('crypto');
const ROLES = ['customer', 'kitchen staff', 'delivery rider', 'restaurant staff manager', 'administrator'];
const ADMIN_CODE = process.env.ADMIN_CODE || 'LUNAR-ADMIN';
const SESSION_MS = 7 * 864e5, METHODS = ['GCash', 'Card', 'Cash'];
const MGMT = ['administrator', 'restaurant staff manager'];
const PERM = { upload: MGMT, review: MGMT, manage: MGMT, ops: MGMT, menu: MGMT, kitchen: [...MGMT, 'kitchen staff'], rider: [...MGMT, 'delivery rider'], staff: ['administrator'] };
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const fail = (c, m) => { throw new HttpError(c, m); };
const need = (u, a) => { if (!PERM[a].includes(u.role)) fail(403, 'Your role (' + u.role + ') cannot do this.'); };
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const H = t => ({ ts: stamp(), text: t });
const strip = ({ _id, ...r }) => ({ id: _id, ...r });
const hashPw = (p, s = crypto.randomBytes(16).toString('hex')) => s + ':' + crypto.scryptSync(p, s, 32).toString('hex');
const checkPw = (p, h) => { const [s, x] = h.split(':'); return crypto.timingSafeEqual(Buffer.from(x, 'hex'), crypto.scryptSync(p, s, 32)); };

let C;
async function init(db) {
  C = {};
  ['users', 'sessions', 'menu', 'orders', 'riders', 'tasks', 'audit_log', 'notifications', 'api_log', 'counters'].forEach(n => { C[n] = db.collection(n); });
  await C.users.createIndex({ username: 1 }, { unique: true });
  await C.menu.createIndex({ name: 1 }, { unique: true });
  await C.orders.createIndex({ username: 1 });
}
// Atomic auto-increment ids, so the front end keeps simple numeric ids.
const nextId = async n => (await C.counters.findOneAndUpdate({ _id: n }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })).seq;
const emit = async (actor, type, msg, notify) => {
  await C.audit_log.insertOne({ ts: stamp(), actor: actor || 'guest', type, msg });
  if (notify) await C.notifications.insertOne({ ts: stamp(), msg });
};
async function seed() {
  if (await C.menu.countDocuments({})) return;
  const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  for (const [name, descr, price, category] of [['Nebula Latte','Espresso with steamed milk and a hint of vanilla, swirled like a cloud.',130,'Coffee'],['Moon Rock Brownie','Fudgy brownie with white chocolate chips, resembling a lunar surface.',85,'Bites'],['Meteorite Sandwich','Toasted whole wheat bread with ham, cheese, and dark greens.',180,'Bites'],['Cosmic Caramel Crunch','Iced caramel latte blended with crushed honeycomb candy.',195,'Coffee'],['Eclipse Espresso','A double shot, dark and bold, finished with a thin crema ring.',95,'Coffee'],['Stardust Cappuccino','Velvety foam dusted with cinnamon and edible gold sparkle.',140,'Coffee'],['Galaxy Mocha','Espresso, dark chocolate and milk topped with violet whipped cream.',160,'Coffee'],['Comet Cold Brew','Slow-steeped for 18 hours and served over cosmic ice.',150,'Coffee'],['Aurora Matcha Latte','Ceremonial matcha with oat milk and a ribbon of honey.',165,'Non-coffee'],['Milky Way Hot Chocolate','Thick cocoa with marshmallow stars.',145,'Non-coffee'],['Solar Berry Smoothie','Strawberry, mango and blueberry blended with yogurt.',175,'Non-coffee'],['Orbit Croissant','Buttery croissant with a ring of almond cream.',110,'Bites'],['Asteroid Cookies','Three chewy chocolate chunk cookies, baked fresh.',75,'Bites'],['Supernova Pasta','Creamy garlic pasta with mushrooms and a chili kick.',220,'Bites'],['Lunar Waffles','Crisp waffles with vanilla ice cream and maple syrup.',155,'Bites']])
    await C.menu.insertOne({ _id: await nextId('menu'), name, descr, price, category });
  for (const n of ['Luna', 'Orion', 'Vega']) await C.riders.insertOne({ _id: n, busy: 0 });
  for (const [project, title, due] of [['Lunar Veil Promo Reel', 'Storyboard', day(-2)], ['Lunar Veil Promo Reel', 'Animation pass', day(5)], ['Menu Launch Campaign', 'Poster draft', day(3)]])
    await C.tasks.insertOne({ _id: await nextId('tasks'), project, title, due, status: 'To Do', versions: [], comments: [] });
}

/* ---------- auth ---------- */
async function signup(b = {}) {
  const u = str(b.username, 40).toLowerCase(), p = String(b.password || '');
  if (u.length < 3) fail(400, 'Username must be at least 3 characters.');
  if (p.length < 6) fail(400, 'Password must be at least 6 characters.');
  if (!ROLES.includes(b.role)) fail(400, 'Unknown role.');
  if (await C.users.findOne({ username: u })) fail(409, 'That username is taken. Choose another.');
  if (b.role == 'administrator' && str(b.adminCode) != ADMIN_CODE) fail(403, 'Wrong administrator setup code.');
  const status = b.role == 'customer' || b.role == 'administrator' ? 'active' : 'pending';
  await C.users.insertOne({ _id: await nextId('users'), username: u, pass: hashPw(p), role: b.role, status });
  await emit(u, 'auth.signup', 'Account "' + u + '" created as ' + b.role + ' (' + status + ')');
  return { username: u, role: b.role, status };
}
async function login(b = {}) {
  const u = await C.users.findOne({ username: str(b.username, 40).toLowerCase() });
  if (!u || !checkPw(String(b.password || ''), u.pass)) fail(401, 'Wrong username or password.');
  if (u.status == 'pending') fail(403, 'Your account is waiting for administrator verification.');
  if (u.status == 'rejected') fail(403, 'Your account was not approved.');
  const token = crypto.randomBytes(24).toString('hex');
  await C.sessions.insertOne({ _id: token, user_id: u._id, created: Date.now() });
  await emit(u.username, 'auth.login', 'Signed in as ' + u.role);
  return { token, user: { id: u._id, username: u.username, role: u.role } };
}
async function authenticate(token) {
  if (!token) return null;
  const s = await C.sessions.findOne({ _id: token });
  if (!s) return null;
  if (Date.now() - s.created > SESSION_MS) { await C.sessions.deleteOne({ _id: token }); return null; }
  const u = await C.users.findOne({ _id: s.user_id });
  return u && u.status == 'active' ? { id: u._id, username: u.username, role: u.role } : null;
}
async function logout(user, token) { await C.sessions.deleteOne({ _id: token }); await emit(user.username, 'auth.logout', 'Signed out'); }
async function listUsers(u) {
  need(u, 'staff');
  return (await C.users.find({}).sort({ _id: 1 }).toArray()).map(x => ({ id: x._id, username: x.username, role: x.role, status: x.status }));
}
async function setUserStatus(u, id, status) {
  need(u, 'staff');
  if (!['active', 'rejected'].includes(status)) fail(400, 'status must be "active" or "rejected".');
  const t = await C.users.findOne({ _id: +id });
  if (!t) fail(404, 'User not found.');
  if (['customer', 'administrator'].includes(t.role)) fail(400, 'Only staff accounts need verification.');
  await C.users.updateOne({ _id: t._id }, { $set: { status } });
  if (status == 'active' && t.role == 'delivery rider' && !(await C.riders.findOne({ _id: t.username }))) await C.riders.insertOne({ _id: t.username, busy: 0 });
  if (status == 'rejected') await C.sessions.deleteMany({ user_id: t._id });
  await emit(u.username, 'staff.verify', 'Account "' + t.username + '" ' + (status == 'active' ? 'approved' : 'rejected') + ' as ' + t.role, true);
  return { id: t._id, username: t.username, role: t.role, status };
}

/* ---------- menu ---------- */
const listMenu = async () => (await C.menu.find({}).sort({ _id: 1 }).toArray()).map(strip);
async function addMenu(u, b = {}) {
  need(u, 'menu');
  const name = str(b.name, 80), price = +b.price;
  if (!name || !(price > 0)) fail(400, 'A name and a price above 0 are required.');
  if (await C.menu.findOne({ name })) fail(409, 'That menu item already exists.');
  const d = { _id: await nextId('menu'), name, descr: str(b.descr, 300) || 'Made fresh to order.', price, category: str(b.category, 40) || 'Specials' };
  await C.menu.insertOne(d);
  await emit(u.username, 'menu.added', 'Menu item "' + name + '" added (₱' + price + ')', true);
  return strip(d);
}
async function delMenu(u, id) {
  need(u, 'menu');
  const m = await C.menu.findOne({ _id: +id });
  if (!m) fail(404, 'Menu item not found.');
  await C.menu.deleteOne({ _id: m._id });
  await emit(u.username, 'menu.removed', 'Menu item "' + m.name + '" removed', true);
}

/* ---------- orders (items and history are embedded in the order document) ---------- */
const view = o => ({ ...strip(o), order_id: o._id, user: o.username });
const getOrder = async id => { const o = await C.orders.findOne({ _id: +id }); return o && view(o); };
const listOrders = async u => (await C.orders.find(u.role == 'customer' ? { username: u.username } : {}).sort({ _id: 1 }).toArray()).map(view);
async function readOrder(u, id) {
  const o = await getOrder(id);
  if (!o || (u.role == 'customer' && o.username != u.username)) fail(404, 'Order not found.');
  return o;
}
async function createOrder(u, b = {}) {
  const method = b.payment_method;
  if (!METHODS.includes(method)) fail(400, 'payment_method must be one of ' + METHODS.join(', ') + '.');
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 50) fail(400, 'items must be a non-empty list.');
  let total = 0; const items = [];
  for (const i of b.items) {                                   // validate everything before writing anything
    const m = await C.menu.findOne({ name: str(i && i.item, 80) }), qty = +(i && i.qty);
    if (!m) fail(400, 'Unknown menu item: ' + str(i && i.item, 40));
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) fail(400, 'qty must be a whole number from 1 to 50.');
    total += m.price * qty; items.push({ name: m.name, price: m.price, qty });   // price always comes from the DB
  }
  const id = 100 + await nextId('orders');
  await C.orders.insertOne({ _id: id, username: u.username, total, method, pay: 'Pending', status: 'Pending Payment', rider: '-', ref: null, created: stamp(), items, history: [H('Customer order submitted')] });
  await emit(u.username, 'order.created', 'Order #' + id + ' placed', true);
  if (method != 'Cash') await confirmPay(id, u.username);
  return getOrder(id);
}
async function confirmPay(id, actor) {
  const ref = 'PAY-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const r = await C.orders.updateOne({ _id: id, pay: 'Pending' }, { $set: { pay: 'Paid', ref, status: 'Queued' }, $push: { history: { $each: [H('Payment confirmed (' + ref + ')'), H('Entered kitchen queue')] } } });
  if (!r.matchedCount) fail(409, 'Order is already paid.');
  await emit(actor, 'order.paid', 'Payment confirmed for #' + id + ' ref ' + ref, true);
}
async function assign(id, name, actor, auto) {
  if (!(await C.riders.findOne({ _id: name }))) fail(404, 'Unknown rider.');
  const claim = await C.riders.updateOne({ _id: name, busy: 0 }, { $set: { busy: id } });   // atomic: two orders can't grab one rider
  if (!claim.matchedCount) fail(409, 'Rider ' + name + ' is busy.');
  await C.orders.updateOne({ _id: id }, { $set: { rider: name, status: 'Out for Delivery' }, $push: { history: { $each: [H('Rider ' + name + ' assigned'), H('Rider status: Out for Delivery')] } } });
  await emit(actor, 'rider.assigned', 'Rider ' + name + ' assigned to #' + id + (auto ? ' (auto)' : ''), true);
}
async function setStatus(u, id, b = {}) {
  const o = await C.orders.findOne({ _id: +id }), s = b.status;
  if (!o) fail(404, 'Order not found.');
  const from = (...a) => { if (!a.includes(o.status)) fail(409, 'Order #' + o._id + ' is "' + o.status + '"; cannot move to "' + s + '".'); };
  const move = async (set, text) => {                           // only applies if nobody changed the order meanwhile
    const r = await C.orders.updateOne({ _id: o._id, status: o.status }, { $set: set, $push: { history: H(text) } });
    if (!r.matchedCount) fail(409, 'Order was just updated by someone else. Refresh and try again.');
  };
  if (s == 'Paid') { need(u, 'ops'); await confirmPay(o._id, u.username); }
  else if (s == 'Preparing') { need(u, 'kitchen'); from('Queued'); await move({ status: s }, 'Preparation started'); await emit(u.username, 'order.status', 'Order #' + o._id + ' is Preparing', true); }
  else if (s == 'Ready') {
    need(u, 'kitchen'); from('Preparing'); await move({ status: s }, 'Marked ready for pickup');
    await emit(u.username, 'order.ready', 'Order #' + o._id + ' is Ready', true);
    const free = await C.riders.find({ busy: 0 }).toArray();
    const real = new Set((await C.users.find({ role: 'delivery rider', status: 'active' }).toArray()).map(x => x.username));
    const candidates = [...free.filter(r => real.has(r._id)), ...free.filter(r => !real.has(r._id))];
    let done = false;
    for (const r of candidates) {                                // if someone else grabbed this rider first, try the next one
      try { await assign(o._id, r._id, u.username, true); done = true; break; }
      catch (e) { if (!(e instanceof HttpError)) throw e; }
    }
    if (!done) await C.notifications.insertOne({ ts: stamp(), msg: 'No free rider for order #' + o._id });
  }
  else if (s == 'Out for Delivery') {
    need(u, 'rider'); from('Ready');
    const name = u.role == 'delivery rider' ? u.username : str(b.rider, 40);
    if (!name) fail(400, 'rider is required.');
    await assign(o._id, name, u.username, false);
  }
  else if (s == 'Delivered') {
    from('Out for Delivery');
    if (!(MGMT.includes(u.role) || (u.role == 'delivery rider' && o.rider == u.username))) fail(403, 'Only management or the assigned rider can mark this delivered.');
    await move({ status: s }, 'Status: Delivered');
    await C.riders.updateOne({ _id: o.rider }, { $set: { busy: 0 } });
    await emit(u.username, 'order.status', 'Order #' + o._id + ' is Delivered', true);
  }
  else fail(400, 'Unsupported status "' + str(s, 30) + '".');
  return getOrder(o._id);
}
const listRiders = async () => (await C.riders.find({}).sort({ _id: 1 }).toArray()).map(r => ({ name: r._id, busy: r.busy }));

/* ---------- production tasks (versions and comments embedded) ---------- */
const listTasks = async () => (await C.tasks.find({}).sort({ _id: 1 }).toArray()).map(strip);
const getTask = async id => { const t = await C.tasks.findOne({ _id: +id }); if (!t) fail(404, 'Task not found.'); return t; };
const readTask = async id => strip(await C.tasks.findOne({ _id: +id }));
async function addTask(u, b = {}) {
  need(u, 'manage');
  const title = str(b.title, 120);
  if (!title) fail(400, 'title is required.');
  const due = /^\d{4}-\d{2}-\d{2}$/.test(b.due || '') ? b.due : new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const id = await nextId('tasks');
  await C.tasks.insertOne({ _id: id, project: str(b.project, 80) || 'General', title, due, status: 'To Do', versions: [], comments: [] });
  await emit(u.username, 'task.created', 'Task "' + title + '" created', true);
  return readTask(id);
}
async function uploadAsset(u, id, b = {}) {
  need(u, 'upload'); const t = await getTask(id), file = str(b.file, 120);
  if (!file) fail(400, 'file is required.');
  const n = t.versions.length + 1;
  await C.tasks.updateOne({ _id: t._id }, { $push: { versions: { v: 'v' + n, file, type: str(b.type, 30) || 'image', status: 'Submitted', by: u.role } }, $set: { status: 'For Review' } });
  await emit(u.username, 'asset.uploaded', file + ' v' + n + ' uploaded to "' + t.title + '"', true);
  await emit(u.username, 'workflow.auto', 'Task "' + t.title + '" auto-set to For Review');
  return readTask(t._id);
}
async function reviewTask(u, id, b = {}) {
  need(u, 'review'); const t = await getTask(id);
  const map = { approve: ['Approved', 'asset.approved'], reject: ['Rejected', 'asset.rejected'], revise: ['Revision', 'asset.revision'] }[b.result];
  if (!map) fail(400, 'result must be approve, reject or revise.');
  if (!t.versions.length) fail(409, 'Nothing has been submitted for this task yet.');
  const last = t.versions.length - 1, upd = { $set: { status: map[0], ['versions.' + last + '.status']: map[0] } };
  if (str(b.comment, 500)) upd.$push = { comments: { by: u.role, text: str(b.comment, 500) } };
  await C.tasks.updateOne({ _id: t._id }, upd);
  await emit(u.username, map[1], '"' + t.title + '" ' + t.versions[last].v + ' ' + map[0], true);
  return readTask(t._id);
}
async function finalizeTask(u, id) {
  need(u, 'manage'); const t = await getTask(id);
  if (t.status != 'Approved') fail(409, 'Only approved tasks can be released as final.');
  await C.tasks.updateOne({ _id: t._id }, { $set: { status: 'Final', ['versions.' + (t.versions.length - 1) + '.status']: 'Final' } });
  await emit(u.username, 'asset.final', '"' + t.title + '" released as final', true);
  return readTask(t._id);
}

/* ---------- logs ---------- */
async function readLogs(u) {
  need(u, 'ops');
  const rec = async (c, f) => (await C[c].find({}).sort({ _id: -1 }).limit(200).toArray()).map(r => Object.fromEntries(f.map(k => [k, r[k]])));
  return { audit: await rec('audit_log', ['ts', 'actor', 'type', 'msg']), notifications: await rec('notifications', ['ts', 'msg']) };
}
async function readApiLog(u) { need(u, 'ops'); return (await C.api_log.find({}).sort({ _id: -1 }).limit(200).toArray()).map(({ _id, ...r }) => r); }
const logApi = (method, path, code, username) => C.api_log.insertOne({ ts: stamp(), method, path, code, username: username || null });

module.exports = { HttpError, ROLES, init, seed, signup, login, authenticate, logout, listUsers, setUserStatus, listMenu, addMenu, delMenu, listOrders, readOrder, createOrder, setStatus, listRiders, listTasks, addTask, uploadAsset, reviewTask, finalizeTask, readLogs, readApiLog, logApi };

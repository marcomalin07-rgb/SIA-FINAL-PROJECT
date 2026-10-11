
let REMOTE = false, TOKEN = null;
const ROLES = ['customer', 'kitchen staff', 'delivery rider', 'restaurant staff manager', 'administrator'];
const ADMIN_CODE = 'LUNAR-ADMIN';
const MGMT = ['administrator', 'restaurant staff manager'];
const ACCESS = {
    customer: 'home menu cart orders', 'kitchen staff': 'home menu orders', 'delivery rider': 'home orders',
    'restaurant staff manager': 'home menu cart orders production dashboard logs evidence', administrator: 'all'
};
const PERM = {
    upload: MGMT, review: MGMT, manage: MGMT, ops: MGMT, menu: MGMT,
    kitchen: [...MGMT, 'kitchen staff'], rider: [...MGMT, 'delivery rider'], staff: ['administrator']
};
const MENU = [['Nebula Latte', 'Espresso with steamed milk and a hint of vanilla, swirled like a cloud.', 130, 'Coffee'], ['Moon Rock Brownie', 'Fudgy brownie with white chocolate chips, resembling a lunar surface.', 85, 'Bites'], ['Meteorite Sandwich', 'Toasted whole wheat bread with ham, cheese, and dark greens.', 180, 'Bites'], ['Cosmic Caramel Crunch', 'Iced caramel latte blended with crushed honeycomb candy.', 195, 'Coffee'],
    ['Eclipse Espresso', 'A double shot, dark and bold, finished with a thin crema ring.', 95, 'Coffee'], ['Stardust Cappuccino', 'Velvety foam dusted with cinnamon and edible gold sparkle.', 140, 'Coffee'], ['Galaxy Mocha', 'Espresso, dark chocolate and milk topped with violet whipped cream.', 160, 'Coffee'], ['Comet Cold Brew', 'Slow-steeped for 18 hours and served over cosmic ice.', 150, 'Coffee'],
    ['Aurora Matcha Latte', 'Ceremonial matcha with oat milk and a ribbon of honey.', 165, 'Non-coffee'], ['Milky Way Hot Chocolate', 'Thick cocoa with marshmallow stars.', 145, 'Non-coffee'], ['Solar Berry Smoothie', 'Strawberry, mango and blueberry blended with yogurt.', 175, 'Non-coffee'],
    ['Orbit Croissant', 'Buttery croissant with a ring of almond cream.', 110, 'Bites'], ['Asteroid Cookies', 'Three chewy chocolate chunk cookies, baked fresh.', 75, 'Bites'], ['Supernova Pasta', 'Creamy garlic pasta with mushrooms and a chili kick.', 220, 'Bites'], ['Lunar Waffles', 'Crisp waffles with vanilla ice cream and maple syrup.', 155, 'Bites']];
const SLIDES = [['📄', 'Menu & Ordering', 'Browse the menu, fill your cart and pay with GCash, card or cash.'], ['🛵', 'Kitchen & Riders', 'Orders flow from payment to the kitchen queue to rider dispatch.'], ['🎬', 'Production Studio', 'Submit assets, track versions and approve work.'], ['🧑‍🚀', 'Personal Profile', 'Manage your personal details, check your member status, and update your preferences.']];
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const esc = s => String(s).replace(/[&<>"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
}[c]));
const fresh = () => ({
    role: null, user: null, users: [], tab: 'home', cart: [], orders: [], seq: 100, log: [], notes: [], api: [], tests: [],
    riders: [{ n: 'Luna', busy: 0 }, { n: 'Orion', busy: 0 }, { n: 'Vega', busy: 0 }],
    projects: ['Lunar Veil Promo Reel', 'Menu Launch Campaign'],
    tasks: [{
            id: 1, project: 'Lunar Veil Promo Reel', title: 'Storyboard', due: day(-2), status: 'To Do', v: [], c: []
        }, {
            id: 2, project: 'Lunar Veil Promo Reel', title: 'Animation pass', due: day(5), status: 'To Do', v: [], c: []
        }, {
            id: 3, project: 'Menu Launch Campaign', title: 'Poster draft', due: day(3), status: 'To Do', v: [], c: []
        }]
});
let S = fresh(), slide = 0;
try {
    const x = localStorage.getItem('lvc');
    if (x)
        S = JSON.parse(x);
}
catch (e) {
}
S.users = S.users || [];
S.menu = S.menu || MENU.map(m => m.slice());
const OLDROLE = { admin: 'administrator', 'project manager': 'restaurant staff manager', client: 'customer' };
const fixRole = r => OLDROLE[r] || (ROLES.includes(r) ? r : 'customer');
S.users.forEach(u => { u.role = fixRole(u.role); u.status = u.status || 'active'; });
if (S.role) S.role = fixRole(S.role);
S.api = S.api || [];
S.tests = S.tests || [];
if (!S.user)
    S.role = null;
const save = () => {
    if (REMOTE) return;
    try {
        localStorage.setItem('lvc', JSON.stringify(S));
    }
    catch (e) {
    }
};
const can = a => PERM[a].includes(S.role);
const toast = m => {
    const t = document.getElementById('toast');
    t.textContent = m;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 2200);
};
const now = () => new Date().toLocaleTimeString();
/* EVENT BUS: every action is an event -> audit log, optional notification, automation handlers */
const H = {
    'asset.uploaded': (e) => {
        const t = task(e.id);
        t.status = 'For Review';
        note('Task "' + t.title + '" auto-set to For Review (workflow automation)');
    },
    'order.paid': (e) => {
        ord(e.id).status = 'Queued';
        hist(ord(e.id), 'Entered kitchen queue');
    },
    'order.ready': (e) => {
        const free = S.riders.filter(r => !r.busy), r = free.find(r => S.users.some(u => u.u == r.n)) || free[0];
        if (r) {
            assign(e.id, r.n, true);
        }
        else
            note('No free rider for order #' + e.id);
    }
};
function emit(type, msg, data = {}, notify = false) {
    S.log.push(now() + ' [' + (S.user || 'guest') + '] ' + type + ' - ' + msg);
    if (notify)
        note(msg);
    if (H[type])
        H[type](data);
    save();
}
function note(m) {
    S.notes.push(now() + ' ' + m);
}
let curTest = 'MANUAL';
const VER = '1.1.0';
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const mask = t => String(t).replace(/\[([^\]\s])[^\]]*\]/, '[$1***]');
function hist(o, t) {
    (o.hist = o.hist || []).push({ ts: stamp(), t });
}
function apiLog(method, path, req, code, res, test) {
    S.api.push({
        id: 'API-' + (S.api.length + 1), ts: stamp(), method, path, code, test: test || curTest, req, res
    });
}
const task = id => S.tasks.find(t => t.id == id), ord = id => S.orders.find(o => o.id == id);
/* CAFE */
const total = () => S.cart.reduce((a, i) => a + i.p * i.q, 0);
function add(i) {
    const m = S.menu[i], f = S.cart.find(c => c.n == m[0]);
    f ? f.q++ : S.cart.push({
        n: m[0], p: m[2], q: 1
    });
    toast(m[0] + ' added');
    render();
}
function checkout(m) {
    const method = m || document.getElementById('pm').value;
    if (!S.cart.length)
        return;
    const o = {
        id: ++S.seq, items: S.cart, total: total(), method, pay: 'Pending', status: 'Pending Payment', rider: '-', user: S.user
    };
    S.orders.push(o);
    S.cart = [];
    hist(o, 'Customer order submitted');
    apiLog('POST', '/api/orders', { items: o.items.map(i => ({ item: i.n, qty: i.q })), payment_method: method }, 201, {
        order_id: o.id, status: o.status, total: o.total
    });
    emit('order.created', 'Order #' + o.id + ' placed', {}, true);
    if (method != 'Cash')
        confirmPay(o.id);
    S.tab = 'orders';
    render();
}
function confirmPay(id) {
    const o = ord(id);
    o.pay = 'Paid';
    o.ref = 'PAY-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    hist(o, 'Payment confirmed (' + o.ref + ')');
    apiLog('PATCH', '/api/orders/' + id + '/status', { status: 'Paid' }, 200, {
        order_id: id, status: 'Queued', payment_ref: o.ref
    }, curTest == 'TC-01' ? 'TC-02' : curTest);
    emit('order.paid', 'Payment confirmed for #' + id + ' ref ' + o.ref, { id }, true);
    render();
}
function setStatus(id, s) {
    ord(id).status = s;
    hist(ord(id), s == 'Preparing' ? 'Preparation started' : s == 'Ready' ? 'Marked ready for pickup' : 'Status: ' + s);
    apiLog('PATCH', '/api/orders/' + id + '/status', { status: s }, 200, { order_id: id, status: s });
    emit(s == 'Ready' ? 'order.ready' : 'order.status', 'Order #' + id + ' is ' + s, { id }, true);
    render();
}
function assign(id, name, auto) {
    const o = ord(id), r = S.riders.find(r => r.n == name);
    if (!r || r.busy)
        return;
    r.busy = id;
    o.rider = name;
    o.status = 'Out for Delivery';
    hist(o, 'Rider ' + name + ' assigned');
    hist(o, 'Rider status: Out for Delivery');
    apiLog('PATCH', '/api/orders/' + id + '/status', { status: 'Out for Delivery', rider: name }, 200, {
        order_id: id, status: 'Out for Delivery', rider: name
    });
    emit('rider.assigned', 'Rider ' + name + ' assigned to #' + id + (auto ? ' (auto)' : ''), {}, true);
    if (!auto)
        render();
}
function deliver(id) {
    const o = ord(id);
    const r = S.riders.find(r => r.n == o.rider);
    if (r)
        r.busy = 0;
    setStatus(id, 'Delivered');
}
/* PRODUCTION */
function upload() {
    const id = +val('ut'), f = val('uf').trim();
    if (!f)
        return toast('Enter a file name');
    const t = task(id), n = t.v.length + 1;
    t.v.push({
        v: 'v' + n, f, type: val('uy'), st: 'Submitted', by: S.role
    });
    emit('asset.uploaded', f + ' v' + n + ' uploaded to "' + t.title + '"', { id }, true);
    render();
}
function review(id, res) {
    const t = task(id), v = t.v[t.v.length - 1];
    if (!v)
        return;
    const c = document.getElementById('c' + id).value.trim();
    if (c) {
        t.c.push({ by: S.role, text: c });
    }
    const map = {
        approve: ['Approved', 'asset.approved'], reject: ['Rejected', 'asset.rejected'], revise: ['Revision', 'asset.revision']
    };
    v.st = t.status = map[res][0];
    emit(map[res][1], '"' + t.title + '" ' + v.v + ' ' + map[res][0], { id }, true);
    render();
}
function finalize(id) {
    const t = task(id);
    t.status = 'Final';
    t.v[t.v.length - 1].st = 'Final';
    emit('asset.final', '"' + t.title + '" released as final', { id }, true);
    render();
}
function addTask() {
    const ti = val('nt').trim();
    if (!ti)
        return;
    S.tasks.push({
        id: Date.now(), project: val('np'), title: ti, due: val('nd') || day(7), status: 'To Do', v: [], c: []
    });
    emit('task.created', 'Task "' + ti + '" created', {}, true);
    render();
}
const val = id => document.getElementById(id).value;
const overdue = t => t.due < day(0) && !['Approved', 'Final'].includes(t.status);
/* VIEWS */
const W1 = ['Nebula', 'Comet', 'Stardust', 'Eclipse', 'Aurora', 'Orbit', 'Cosmic', 'Lunar', 'Solar', 'Galactic', 'Meteor', 'Pulsar'];
const W2 = ['Mocha', 'Latte', 'Croissant', 'Pancakes', 'Tart', 'Frappe', 'Sandwich', 'Pie', 'Float', 'Muffin', 'Noodles', 'Rice Bowl'];
const WD = ['Made fresh to order.', 'A customer favorite from the Lunar Veil kitchen.', 'Sweet, rich and out of this world.', 'Light, warm and perfect any time of day.'];
const pick = a => a[Math.floor(Math.random() * a.length)];
function addItem() {
    const n = val('mn').trim(), pr = +val('mp'), c = val('mc'), d = val('md').trim() || pick(WD);
    if (!n || !(pr > 0)) return toast('Enter a name and a price');
    S.menu.push([n, d, pr, c]);
    emit('menu.added', 'Menu item "' + n + '" added (₱' + pr + ')', {}, true);
    render();
}
function randomItem() {
    let n = pick(W1) + ' ' + pick(W2);
    if (S.menu.some(m => m[0] == n)) n += ' ' + (S.menu.length + 1);
    const pr = (Math.floor(Math.random() * 20) + 5) * 10;
    S.menu.push([n, pick(WD), pr, pick(['Coffee', 'Non-coffee', 'Bites', 'Specials'])]);
    emit('menu.added', 'Random menu item "' + n + '" added (₱' + pr + ')', {}, true);
    render();
}
function delItem(i) {
    const m = S.menu[i];
    S.menu.splice(i, 1);
    S.cart = S.cart.filter(c => c.n != m[0]);
    emit('menu.removed', 'Menu item "' + m[0] + '" removed', {}, true);
    render();
}
function addForm() {
    const cats = [...new Set(S.menu.map(m => m[3]).concat('Specials'))];
    return `<div class="panel"><h3>Add a menu item</h3><div class="row"><input id="mn" placeholder="Item name"><input id="mp" type="number" min="1" placeholder="Price"><select id="mc">${cats.map(c => `<option>${c}</option>`).join('')}</select></div><p><input id="md" placeholder="Short description" style="width:100%"></p><div class="row"><button class="btn" onclick="addItem()">Add to menu</button><button class="btn" onclick="randomItem()">🎲 Add random item</button></div></div>`;
}
function verify(i, st) {
    const u = S.users[i];
    u.status = st;
    if (st == 'active' && u.role == 'delivery rider' && !S.riders.some(r => r.n == u.u)) S.riders.push({ n: u.u, busy: 0 });
    emit('staff.verify', 'Account "' + u.u + '" ' + (st == 'active' ? 'approved' : 'rejected') + ' as ' + u.role, {}, true);
    render();
}
const card = (i, adm) => {
    const m = S.menu[i];
    return `<div class="panel item"><h3>${esc(m[0]).toUpperCase()}</h3><p>${esc(m[1])}</p><div class="row"><span class="price">₱${m[2]}.00</span><button class="btn" onclick="add(${i})">Add</button></div>${adm ? `<p><button class="btn bad" onclick="delItem(${i})">Remove</button></p>` : ''}</div>`;
};
const V = {
    home: () => {
        const s = SLIDES[slide];
        return `<div class="hero"><h1>Celestial Brews &amp; Cosmic Bites</h1><p>Experience the otherworldly taste of the Lunar Veil Cafe.</p><button class="btn big" onclick="go('menu')">View Full Menu →</button></div>
<div class="panel"><div class="car"><button onclick="sl(-1)">‹</button><div><h2>${s[0]} ${s[1]}</h2><p>${s[2]}</p></div><button onclick="sl(1)">›</button></div><div class="dots">${SLIDES.map((_, i) => `<i class="${i == slide ? 'on' : ''}"></i>`).join('')}</div></div>
<div class="sec">FEATURED ITEMS</div>${V.menu(true)}`;
    },
    menu: (bare) => bare ? `<div class="grid">${[0, 1, 2, 3].filter(i => S.menu[i]).map(i => card(i)).join('')}</div>` : '<div class="sec">MENU &amp; ORDERING</div>' + (can('menu') ? addForm() : '') + [...new Set(S.menu.map(m => m[3]))].map(c => `<h2 class="cat">${c}</h2><div class="grid">${S.menu.map((m, i) => m[3] == c ? card(i, can('menu')) : '').join('')}</div>`).join(''),
    cart: () => `<div class="sec">YOUR CART</div><div class="panel">${S.cart.map(c => `<div class="row"><span>${c.q} × ${c.n}</span><span class="price">₱${c.p * c.q}.00</span></div>`).join('') || '<p class="muted">Your cart is empty. Add something from the menu.</p>'}
<hr><div class="row"><b>Total</b><span class="price">₱${total()}.00</span></div><p><select id="pm"><option>GCash</option><option>Card</option><option>Cash</option></select> <button class="btn" ${S.cart.length ? '' : 'disabled'} onclick="checkout()">Place order &amp; pay</button></p><p class="muted">GCash and Card confirm instantly. Cash waits for staff confirmation.</p></div>`,
    orders: () => {
        const mine = S.role == 'customer', O = mine ? S.orders.filter(o => o.user == S.user) : S.orders;
        const col = (t, f, b) => `<div class="panel"><h2>${t}</h2>${O.filter(f).map(b).join('') || '<p class="muted">Nothing here.</p>'}</div>`;
        const ops = can('ops'), kit = can('kitchen'), isRider = S.role == 'delivery rider';
        const staffCols = `<div class="cols">
 ${col('Payments', o => o.pay == 'Pending', o => `<div class="row">#${o.id} ₱${o.total} ${o.method} ${ops ? `<button class="btn ok" onclick="confirmPay(${o.id})">Confirm</button>` : ''}</div>`)}
 ${col('Kitchen queue', o => ['Queued', 'Preparing'].includes(o.status), o => `<div class="row"><span>#${o.id} ${o.items.map(i => i.q + '× ' + i.n).join(', ')} <span class="pill">${o.status}</span></span>${kit ? `<button class="btn" onclick="setStatus(${o.id},'${o.status == 'Queued' ? 'Preparing' : 'Ready'}')">${o.status == 'Queued' ? 'Start' : 'Mark ready'}</button>` : ''}</div>`)}
 ${col('Rider dispatch', o => o.status == 'Ready' || o.status == 'Out for Delivery', o => `<div class="row"><span>#${o.id} <span class="pill">${o.status}</span> ${o.rider}</span>${o.status == 'Ready' ? (ops ? `<select id="r${o.id}">${S.riders.filter(r => !r.busy).map(r => `<option>${r.n}</option>`).join('')}</select><button class="btn" onclick="assign(${o.id},val('r${o.id}'))">Assign</button>` : isRider ? `<button class="btn" onclick="assign(${o.id},'${esc(S.user)}')">Pick up</button>` : '') : (ops || (isRider && o.rider == S.user) ? `<button class="btn ok" onclick="deliver(${o.id})">Delivered</button>` : '')}</div>`)}
 </div>`;
        return `<div class="sec">${mine ? 'MY ORDERS' : 'ORDER TRACKING'}</div>${mine ? '' : staffCols}<div class="panel"><h2>${mine ? 'My orders' : 'All orders'}</h2><div class="tbl">${O.map(o => `<div class="row"><span>#${o.id}</span><span>₱${o.total}</span><span class="pill ${o.pay}">${o.pay}${o.ref ? ' ' + o.ref : ''}</span><span class="pill ${o.status}">${o.status}</span></div>`).join('') || '<p class="muted">No orders yet.</p>'}</div>${mine ? '' : `<p class="muted">Riders: ${S.riders.map(r => r.n + (r.busy ? ' (busy)' : ' (free)')).join(', ')}</p>`}</div>`;
    },
    production: () => `<div class="sec">PRODUCTION STUDIO</div>
${can('manage') ? `<div class="panel"><h3>New task</h3><div class="row"><select id="np">${S.projects.map(p => `<option>${esc(p)}</option>`).join('')}</select><input id="nt" placeholder="Task title"><input id="nd" type="date"><button class="btn" onclick="addTask()">Create task</button></div></div>` : ''}
${can('upload') ? `<div class="panel"><h3>Submit asset</h3><div class="row"><select id="ut">${S.tasks.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select><input id="uf" placeholder="file name e.g. storyboard.pdf"><select id="uy"><option>storyboard</option><option>image</option><option>video</option><option>audio</option><option>animation</option><option>render</option></select><button class="btn" onclick="upload()">Submit</button></div></div>` : ''}
<div class="grid">${S.tasks.map(t => `<div class="panel"><div class="row"><h3>${esc(t.title)}</h3><span class="pill ${t.status.split(' ')[0]}">${t.status}</span></div><p class="muted">${esc(t.project)} · due ${t.due}${overdue(t) ? ' · <b style="color:var(--bad)">overdue</b>' : ''}</p>
${t.v.map(v => `<div class="ver">${v.v} · ${esc(v.f)} (${v.type}) <span class="pill ${v.st}">${v.st}</span><br><span class="muted">by ${v.by}</span></div>`).join('') || '<p class="muted">No versions yet.</p>'}
${t.c.map(c => `<div class="ver">💬 <b>${c.by}:</b> ${esc(c.text)}</div>`).join('')}
${can('review') && t.v.length ? `<textarea id="c${t.id}" placeholder="Feedback or revision notes" style="min-height:50px"></textarea><div class="row"><button class="btn ok" onclick="review(${t.id},'approve')">Approve</button><button class="btn" onclick="review(${t.id},'revise')">Revise</button><button class="btn bad" onclick="review(${t.id},'reject')">Reject</button></div>` : ''}
${can('manage') && t.status == 'Approved' ? `<p><button class="btn" onclick="finalize(${t.id})">Release as final</button></p>` : ''}</div>`).join('')}</div>`,
    dashboard: () => {
        const paid = S.orders.filter(o => o.pay == 'Paid'), rev = paid.reduce((a, o) => a + o.total, 0), cnt = {};
        S.orders.forEach(o => o.items.forEach(i => cnt[i.n] = (cnt[i.n] || 0) + i.q));
        const ts = ['To Do', 'For Review', 'Revision', 'Rejected', 'Approved', 'Final'], mx = Math.max(1, ...ts.map(s => S.tasks.filter(t => t.status == s).length)), top = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
        return `<div class="sec">ANALYTICS DASHBOARD</div><div class="grid">${[['₱' + rev, 'Revenue'], [S.orders.length, 'Orders'], [S.orders.filter(o => o.status == 'Delivered').length, 'Delivered'], [S.tasks.filter(overdue).length, 'Overdue tasks'], [S.tasks.filter(t => ['Approved', 'Final'].includes(t.status)).length, 'Approved assets']].map(k => `<div class="panel kpi"><b>${k[0]}</b>${k[1]}</div>`).join('')}</div>
 <div class="cols"><div class="panel"><h2>Production status</h2>${ts.map(s => {
            const n = S.tasks.filter(t => t.status == s).length;
            return `<div class="row"><span style="width:90px">${s}</span><div class="bar" style="width:${n / mx * 60}%"></div><b>${n}</b></div>`;
        }).join('')}</div>
 <div class="panel"><h2>Best sellers</h2>${top.map(([n, q]) => `<div class="row"><span>${n}</span><b>${q}</b></div>`).join('') || '<p class="muted">No sales yet.</p>'}</div></div>`;
    },
    logs: () => `<div class="sec">LOGS</div><div class="cols"><div class="panel"><h2>Notifications</h2><div class="list">${S.notes.slice().reverse().map(n => `<div>🔔 ${esc(n)}</div>`).join('') || '<p class="muted">No alerts yet.</p>'}</div></div><div class="panel"><h2>Audit log</h2><div class="list">${S.log.slice().reverse().map(n => `<div>${esc(n)}</div>`).join('') || '<p class="muted">No actions yet.</p>'}</div></div></div>`,
    staff: () => `<div class="sec">STAFF VERIFICATION</div><div class="panel"><p class="muted">Kitchen staff, riders and managers can only sign in after an administrator approves their account.</p>${S.users.map((u, i) => `<div class="row"><span>${esc(u.u)}</span><span>${u.role}</span><span class="pill ${u.status == 'active' ? 'Approved' : u.status == 'pending' ? 'Pending' : 'Rejected'}">${u.status}</span>${u.role == 'customer' || u.role == 'administrator' ? '' : u.status == 'active' ? `<button class="btn bad" onclick="verify(${i},'rejected')">Revoke</button>` : `<button class="btn ok" onclick="verify(${i},'active')">Approve</button>${u.status == 'pending' ? `<button class="btn bad" onclick="verify(${i},'rejected')">Reject</button>` : ''}`}</div>`).join('') || '<p class="muted">No accounts yet.</p>'}</div>`,
    evidence: () => {
        const id = S.evOrder || (S.orders.length ? S.orders[S.orders.length - 1].id : 0), o = ord(id) || {}, mk = u => u[0] + '***';
        const TB = (n, c, r) => `<h3>${n}</h3><div class="tbl"><table><tr>${c.map(x => `<th>${x}</th>`).join('')}</tr>${r.map(x => `<tr>${x.map(y => `<td>${esc(y)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${c.length}">No rows yet</td></tr>`}</table></div>`;
        const ln = (l, f) => l.slice(-10).map(n => {
            const m = n.match(/#(\d+)/);
            return [n.split(' ').slice(0, 2).join(' '), f(n.split(' ').slice(2).join(' ')), 'Recorded', m ? m[1] : '-'];
        });
        return `<div class="sec">EVIDENCE (APPENDICES A–F)</div>
<div class="panel"><div class="row"><span>Sample order ID:</span><select onchange="evOrd(this.value)">${S.orders.map(x => `<option ${x.id == id ? 'selected' : ''}>${x.id}</option>`).join('') || '<option>none</option>'}</select><button class="btn" onclick="runTests()">Run test order (TC-01 to TC-09)</button><button class="btn" onclick="window.print()">Print / PDF</button></div><p class="muted">Click "Run test order" first. It places one fictional order and moves it through every step, so the same order ID appears in every appendix.</p></div>
<div class="panel"><h2>A. API request and response</h2>${S.api.slice(-6).reverse().map(a => `<h3>${a.id} · ${a.method} ${esc(a.path)} · HTTP ${a.code} · Test ${a.test}</h3><div class="muted">${a.ts}</div><pre>Request: ${esc(JSON.stringify(a.req, null, 1))}\nResponse: ${esc(JSON.stringify(a.res, null, 1))}</pre>`).join('') || '<p class="muted">No API calls yet.</p>'}<p class="muted">No tokens, passwords or personal data are recorded.</p></div>
<div class="panel"><h2>B. Database evidence</h2><pre>Users(user_id PK, username, role, status)   -- passwords never shown
Food_Items(food_id PK, name, category, price)
Orders(order_id PK, total, payment_method, payment_status, status)
Order_Items(order_id FK, item, qty, price)
Kitchen_Queue(queue_no, order_id FK, status)
Deliveries(order_id FK, rider, status)
Notifications(id, message)   Audit_Logs(id, entry)</pre>
${TB('Users', ['user_id', 'username', 'role', 'status'], S.users.map((u, i) => [i + 1, mk(u.u), u.role, u.status]))}${TB('Food_Items', ['food_id', 'name', 'category', 'price'], S.menu.map((m, i) => [i + 1, m[0], m[3], m[2]]).slice(0, 8))}
${TB('Orders', ['order_id', 'total', 'payment_method', 'payment_status', 'status'], S.orders.slice(-8).map(x => [x.id, x.total, x.method, x.pay, x.status]))}${TB('Order_Items', ['order_id', 'item', 'qty', 'price'], S.orders.slice(-8).flatMap(x => x.items.map(i => [x.id, i.n, i.q, i.p])))}
${TB('Kitchen_Queue', ['queue_no', 'order_id', 'status'], S.orders.filter(x => ['Queued', 'Preparing', 'Ready'].includes(x.status)).map((x, i) => [i + 1, x.id, x.status]))}${TB('Deliveries', ['order_id', 'rider', 'status'], S.orders.filter(x => x.rider != '-').slice(-8).map(x => [x.id, x.rider, x.status]))}
${TB('Notifications', ['id', 'message'], S.notes.slice(-8).map((n, i) => [i + 1, n]))}${TB('Audit_Logs', ['id', 'entry'], S.log.slice(-8).map((n, i) => [i + 1, mask(n)]))}</div>
<div class="panel"><h2>C. Workflow for order #${id || '-'}</h2>${(o.hist || []).map((h, i) => `<div class="ver">${i + 1}. ${h.ts} — ${esc(h.t)}</div>`).join('') || '<p class="muted">No steps yet. Run the test order.</p>'}<div class="ver">Customer tracking: order #${id || '-'} is now <span class="pill">${o.status || '-'}</span></div></div>
<div class="panel"><h2>D. Test records</h2>${TB('Sections 9.2–9.5 test cases', ['Test ID', 'Date', 'Test', 'Test data', 'Expected', 'Actual', 'Status', 'Evidence file', 'Corrective action'], S.tests.map(t => [t.id, t.date, t.name, t.data, t.exp, t.act, t.st, t.ev, t.fix]))}</div>
<div class="panel"><h2>E. Audit and notification logs</h2>${TB('Notification log', ['Time', 'Message', 'Status', 'Order ID'], ln(S.notes, x => x))}${TB('Audit log (usernames masked)', ['Time', 'Event', 'Status', 'Order ID'], ln(S.log, x => mask(x)))}</div>
<div class="panel"><h2>F. Deployment and backup</h2>${TB('Running application', ['Item', 'Value'], [['Application', 'Lunar Veil Cafe'], ['Version', VER], ['Runtime', 'Browser web app (HTML, CSS, JavaScript)'], ['Host', location.hostname || 'local file'], ['Browser', navigator.userAgent.slice(0, 70)], ['Data store', 'Browser localStorage']])}
${TB('Backup and restore', ['Item', 'Value'], [['Last backup file', S.backup ? S.backup.file : 'none yet'], ['Backup date', S.backup ? S.backup.ts : '-'], ['Restore test file', S.restore ? S.restore.file : 'none yet'], ['Restore date / orders restored', S.restore ? S.restore.ts + ' / ' + S.restore.orders : '-']])}
<div class="row"><button class="btn" onclick="exportBackup()">Export backup</button><label>Restore test: <input type="file" accept=".json" onchange="restore(this)"></label></div><p class="muted">Backups exclude accounts and passwords. No environment variables or keys are shown.</p></div>`;
    },
};
const EVF = {
    'TC-01': 'Step_1_customer_order_submission.png', 'TC-02': 'Step_2_kitchen_queue_entry.png', 'TC-03': 'Step_2_kitchen_queue_entry.png',
    'TC-04': 'Step_3_preparation_status_update.png', 'TC-05': 'Step_4_rider_assignment.png', 'TC-06': 'Step_5_rider_status_update.png',
    'TC-07': 'Step_7_integration_event_logs.png', 'TC-08': 'Step_7_integration_event_logs.png', 'TC-09': 'Appendix_A_api.png'
};
function verifyTests(id) {
    const o = ord(id), d = stamp().slice(0, 10), T = [], has = x => (o.hist || []).some(h => h.t.includes(x));
    const t = (tid, name, data, exp, act) => T.push({ id: tid, date: d, name, data, exp, act, st: exp == act ? 'Pass' : 'Fail', ev: EVF[tid], fix: exp == act ? '-' : 'Check the related function, fix and re-test' });
    const ok = c => c ? 'recorded' : 'missing';
    t('TC-01', 'Place order (POST /api/orders)', '2 items, GCash, order #' + id, 'recorded', ok(has('Customer order submitted') && S.api.some(a => a.method == 'POST' && a.res.order_id == id)));
    t('TC-02', 'Payment confirmation', 'GCash auto-confirm, order #' + id, 'Paid', o.pay);
    t('TC-03', 'Kitchen queue entry', 'paid order #' + id, 'recorded', ok(has('Entered kitchen queue')));
    t('TC-04', 'Preparation status update', 'PATCH status Preparing', 'recorded', ok(has('Preparation started')));
    t('TC-05', 'Rider assignment', 'free rider available', 'assigned', o.rider != '-' ? 'assigned' : 'none');
    t('TC-06', 'Rider status update / delivery', 'PATCH status Delivered', 'Delivered', o.status);
    t('TC-07', 'Audit log entry', 'search log for #' + id, 'logged', S.log.some(l => l.includes('#' + id)) ? 'logged' : 'missing');
    t('TC-08', 'Notification entry', 'search notifications for #' + id, 'logged', S.notes.some(l => l.includes('#' + id)) ? 'logged' : 'missing');
    t('TC-09', 'API request evidence', 'PATCH calls for #' + id, 'recorded', ok(S.api.some(a => a.path.includes('/' + id + '/status'))));
    S.evOrder = id;
    S.tests = T;
    emit('test.run', 'Test run completed for order #' + id);
    S.tab = 'evidence';
    render();
}
function evOrd(v) {
    S.evOrder = +v;
    render();
}
function exportBackup() {
    const name = 'lunar-veil-backup-' + stamp().slice(0, 10) + '.json', { users, user, role, cart, tab, ...rest } = S;
    try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(rest, null, 1)], { type: 'application/json' }));
        a.download = name;
        a.click();
    }
    catch (e) {
    }
    S.backup = { file: name, ts: stamp() };
    emit('backup.export', 'Backup exported: ' + name);
    toast('Backup file: ' + name);
    render();
}
function restore(inp) {
    const f = inp.files[0];
    if (!f)
        return;
    f.text().then(x => {
        try {
            const b = JSON.parse(x);
            ['orders', 'tasks', 'log', 'notes', 'api', 'tests', 'riders', 'projects', 'seq'].forEach(k => {
                if (b[k] !== undefined)
                    S[k] = b[k];
            });
            S.restore = {
                file: f.name, ts: stamp(), orders: S.orders.length
            };
            emit('backup.restore', 'Backup restored from ' + f.name);
            render();
        }
        catch (e) {
            toast('Invalid backup file');
        }
    });
}
function go(t) {
    S.tab = t;
    render();
}
function sl(d) {
    slide = (slide + d + SLIDES.length) % SLIDES.length;
    render();
}
let mode = 'in', msg = '';
async function hash(x) {
    try {
        const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x));
        return [...new Uint8Array(b)].map(n => n.toString(16).padStart(2, '0')).join('');
    }
    catch (e) {
        return btoa(unescape(encodeURIComponent(x)));
    }
}
const err = m => {
    const a = document.getElementById('amsg');
    a.style.color = 'var(--bad)';
    a.textContent = m;
};
async function signup() {
    const u = val('au').trim().toLowerCase(), p = val('ap'), p2 = val('ap2');
    if (u.length < 3)
        return err('Username must be at least 3 characters.');
    if (p.length < 6)
        return err('Password must be at least 6 characters.');
    if (p != p2)
        return err('Passwords do not match.');
    if (S.users.some(x => x.u == u))
        return err('That username is taken. Choose another.');
    const role = val('ar');
    if (role == 'administrator' && val('ac').trim() != ADMIN_CODE)
        return err('Wrong administrator setup code.');
    const status = role == 'customer' || role == 'administrator' ? 'active' : 'pending';
    S.users.push({
        u, p: await hash(p), role, status
    });
    emit('auth.signup', 'Account "' + u + '" created as ' + role + ' (' + status + ')');
    mode = 'in';
    msg = status == 'pending' ? 'Account submitted. An administrator must verify it before you can sign in.' : 'Account created. Sign in to continue.';
    render();
}
async function signin() {
    const u = val('au').trim().toLowerCase(), a = S.users.find(x => x.u == u);
    if (!a || a.p != await hash(val('ap')))
        return err('Wrong username or password.');
    if (a.status == 'pending')
        return err('Your account is waiting for administrator verification.');
    if (a.status == 'rejected')
        return err('Your account was not approved.');
    S.user = u;
    S.role = a.role;
    emit('auth.login', 'Signed in as ' + a.role);
    S.tab = 'home';
    msg = '';
    render();
}
function out() {
    emit('auth.logout', 'Signed out');
    S.user = null;
    S.role = null;
    render();
}
function authHTML() {
    const up = mode == 'up', tb = (m, l) => `<button class="btn" style="${mode == m ? '' : 'opacity:.5'}" onclick="mode='${m}';msg='';render()">${l}</button>`;
    return `<div class="login panel"><h1 class="logo" style="text-decoration:none">☾ Lunar Veil Cafe</h1><p>${up ? 'Create your account first, then sign in.' : 'Sign in with your username and password.'}</p><div class="row" style="justify-content:center">${tb('in', 'Sign in')}${tb('up', 'Create account')}</div>
 <div class="form"><input id="au" placeholder="Username" autocomplete="username"><input id="ap" type="password" placeholder="Password" autocomplete="${up ? 'new-password' : 'current-password'}">
 ${up ? `<input id="ap2" type="password" placeholder="Confirm password" autocomplete="new-password"><select id="ar">${ROLES.map(r => `<option>${r}</option>`).join('')}</select><input id="ac" placeholder="Administrator setup code (administrator only)"><p class="muted">Customers can sign in right away. Kitchen staff, riders and managers must be verified by an administrator before they can sign in.</p>` : ''}
 <p id="amsg" style="color:var(--ok)">${msg}</p><button class="btn big" onclick="${up ? 'signup()' : 'signin()'}">${up ? 'Create account' : 'Sign in'}</button></div></div>`;
}
function render() {
    save();
    const A = document.getElementById('app');
    if (!S.role) {
        A.innerHTML = authHTML();
        return;
    }
    const ok = ACCESS[S.role] == 'all' ? Object.keys(V) : ACCESS[S.role].split(' ');
    if (!ok.includes(S.tab))
        S.tab = 'home';
    const lab = {
        home: 'Home', menu: 'Menu', cart: 'Cart (' + S.cart.reduce((a, c) => a + c.q, 0) + ')', orders: 'Tracking', production: 'Production', dashboard: 'Dashboard', logs: 'Logs', evidence: 'Evidence', staff: 'Staff' + (S.users.some(u => u.status == 'pending') ? ' ●' : '')
    };
    A.innerHTML = `<nav><span class="logo" onclick="go('home')">☾ LUNAR VEIL CAFE ☕</span>${ok.map(t => `<a class="${t == S.tab ? 'on' : ''}" onclick="go('${t}')">${lab[t]}</a>`).join('')}<span class="who">${esc(S.user)} · ${S.role} · <a onclick="out()">Sign out</a></span></nav><main>${V[S.tab]()}</main>`;
}
/* ===================== BACKEND API MODE =====================
   When this page is served by the Express server, every action goes through /api.
   When opened as a plain file, the original localStorage version keeps working. */
const LOCAL = { signup, signin, out, checkout, confirmPay, setStatus, assign, deliver, upload, review, finalize, addTask, addItem, randomItem, delItem, verify };
async function api(method, path, body) {
    const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (method != 'GET' && !path.startsWith('/auth'))
        apiLog(method, '/api' + path, body || {}, r.status, j.error ? { error: j.error } : { order_id: j.order_id, status: j.status, total: j.total, rider: j.rider, payment_ref: j.ref }, curTest);
    if (!r.ok) {
        const e = new Error(j.error || 'Request failed');
        e.status = r.status;
        throw e;
    }
    return j;
}
async function refresh() {
    const g = p => api('GET', p).catch(() => null);
    const [menu, orders, riders, tasks, users, logs] = await Promise.all([g('/menu'), g('/orders'), g('/riders'), g('/tasks'), g('/users'), g('/logs')]);
    if (menu) S.menu = menu.map(m => [m.name, m.descr, m.price, m.category, m.id]);
    if (orders) S.orders = orders.map(o => ({ id: o.id, total: o.total, method: o.method, pay: o.pay, status: o.status, rider: o.rider, ref: o.ref, user: o.username, items: o.items.map(i => ({ n: i.name, p: i.price, q: i.qty })), hist: o.history.map(h => ({ ts: h.ts, t: h.text })) }));
    if (riders) S.riders = riders.map(r => ({ n: r.name, busy: r.busy }));
    if (tasks) S.tasks = tasks.map(t => ({ id: t.id, project: t.project, title: t.title, due: t.due, status: t.status, v: t.versions.map(v => ({ v: v.v, f: v.file, type: v.type, st: v.status, by: v.by })), c: t.comments }));
    if (users) S.users = users.map(u => ({ id: u.id, u: u.username, role: u.role, status: u.status }));
    if (logs) { S.log = logs.audit.map(a => a.ts + ' [' + a.actor + '] ' + a.type + ' - ' + a.msg); S.notes = logs.notifications.map(n => n.ts + ' ' + n.msg); }
}
async function act(method, path, body) {
    try { await api(method, path, body); await refresh(); }
    catch (e) { toast(e.message); if (e.status == 401) { TOKEN = null; S.user = S.role = null; } }
    render();
}
const postMenu = (n, d, p, c) => act('POST', '/menu', { name: n, descr: d, price: p, category: c });
const R = {
    async signup() {
        if (val('ap') != val('ap2')) return err('Passwords do not match.');
        try {
            const r = await api('POST', '/auth/signup', { username: val('au'), password: val('ap'), role: val('ar'), adminCode: val('ac') });
            mode = 'in';
            msg = r.status == 'pending' ? 'Account submitted. An administrator must verify it before you can sign in.' : 'Account created. Sign in to continue.';
            render();
        } catch (e) { err(e.message); }
    },
    async signin() {
        try {
            const r = await api('POST', '/auth/login', { username: val('au'), password: val('ap') });
            TOKEN = r.token; localStorage.setItem('lvc-token', TOKEN);
            S = fresh(); S.user = r.user.username; S.role = r.user.role; S.tab = 'home'; msg = '';
            await refresh(); render();
        } catch (e) { err(e.message); }
    },
    async out() {
        await api('POST', '/auth/logout').catch(() => { });
        TOKEN = null; localStorage.removeItem('lvc-token'); S = fresh(); render();
    },
    async checkout(m) {
        const method = m || val('pm');
        if (!S.cart.length) return;
        const items = S.cart.map(i => ({ item: i.n, qty: i.q }));
        try { await api('POST', '/orders', { items, payment_method: method }); S.cart = []; S.tab = 'orders'; await refresh(); }
        catch (e) { toast(e.message); }
        render();
    },
    confirmPay: id => act('PATCH', '/orders/' + id + '/status', { status: 'Paid' }),
    setStatus: (id, s) => act('PATCH', '/orders/' + id + '/status', { status: s }),
    assign: (id, name) => act('PATCH', '/orders/' + id + '/status', { status: 'Out for Delivery', rider: name }),
    deliver: id => act('PATCH', '/orders/' + id + '/status', { status: 'Delivered' }),
    upload() { if (!val('uf').trim()) return toast('Enter a file name'); return act('POST', '/tasks/' + val('ut') + '/versions', { file: val('uf'), type: val('uy') }); },
    review: (id, res) => act('POST', '/tasks/' + id + '/review', { result: res, comment: val('c' + id) }),
    finalize: id => act('POST', '/tasks/' + id + '/finalize'),
    addTask: () => act('POST', '/tasks', { project: val('np'), title: val('nt'), due: val('nd') }),
    addItem: () => postMenu(val('mn'), val('md').trim() || pick(WD), +val('mp'), val('mc')),
    randomItem() {
        let n = pick(W1) + ' ' + pick(W2);
        if (S.menu.some(m => m[0] == n)) n += ' ' + (S.menu.length + 1);
        return postMenu(n, pick(WD), (Math.floor(Math.random() * 20) + 5) * 10, pick(['Coffee', 'Non-coffee', 'Bites', 'Specials']));
    },
    delItem: i => act('DELETE', '/menu/' + S.menu[i][4]),
    verify: (i, st) => act('PATCH', '/users/' + S.users[i].id, { status: st }),
};
for (const k in R) window[k] = (...a) => REMOTE ? R[k](...a) : LOCAL[k](...a);
async function runTests() {
    S.cart = []; add(0); add(1);
    curTest = 'TC-01'; await checkout('GCash');
    const id = S.orders[S.orders.length - 1].id;
    curTest = 'TC-04'; await setStatus(id, 'Preparing');
    curTest = 'TC-05'; await setStatus(id, 'Ready');
    curTest = 'TC-06'; await deliver(id);
    curTest = 'MANUAL'; verifyTests(id);
}
(async () => {
    try {
        const h = await fetch('/api/health');
        REMOTE = h.ok && (await h.json()).app == 'lunar-veil-cafe';
    } catch (e) { }
    if (REMOTE) {
        S = fresh(); TOKEN = localStorage.getItem('lvc-token');
        if (TOKEN) {
            try { const me = await api('GET', '/me'); S.user = me.username; S.role = me.role; await refresh(); }
            catch (e) { TOKEN = null; localStorage.removeItem('lvc-token'); }
        }
        // live updates for kitchen / rider screens (skipped while someone is typing)
        setInterval(async () => {
            if (!S.role || document.activeElement.matches('input,select,textarea')) return;
            await refresh(); render();
        }, 5000);
    }
    render();
})();


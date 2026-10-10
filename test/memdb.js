// Tiny in-memory stand-in for the subset of the MongoDB driver that services.js uses (tests only).
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => { const k = p.split('.'), l = k.pop(); k.reduce((a, x) => a[x], o)[l] = v; };
const match = (d, f) => Object.entries(f).every(([k, v]) => getPath(d, k) === v);
let auto = 0;
class Cursor {
  constructor(rows) { this.rows = rows; }
  sort(s) { const [k, d] = Object.entries(s)[0]; this.rows.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * d); return this; }
  limit(n) { this.rows = this.rows.slice(0, n); return this; }
  async toArray() { return this.rows.map(x => structuredClone(x)); }
}
class Coll {
  constructor() { this.docs = []; }
  async createIndex() { }
  async insertOne(d) {
    d = structuredClone(d); if (d._id === undefined) d._id = 'o' + String(++auto).padStart(10, '0');
    if (this.docs.some(x => x._id === d._id)) throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
    this.docs.push(d); return { insertedId: d._id };
  }
  async findOne(f) { const d = this.docs.find(x => match(x, f)); return d ? structuredClone(d) : null; }
  find(f = {}) { return new Cursor(this.docs.filter(x => match(x, f))); }
  async countDocuments(f = {}) { return this.docs.filter(x => match(x, f)).length; }
  _apply(d, u) {
    for (const [k, v] of Object.entries(u.$set || {})) setPath(d, k, v);
    for (const [k, v] of Object.entries(u.$inc || {})) setPath(d, k, (getPath(d, k) || 0) + v);
    for (const [k, v] of Object.entries(u.$push || {})) { const a = getPath(d, k); a.push(...(v && v.$each ? v.$each : [v]).map(x => structuredClone(x))); }
  }
  async updateOne(f, u, o = {}) {
    let d = this.docs.find(x => match(x, f));
    if (!d && o.upsert) { d = {}; Object.entries(f).forEach(([k, v]) => { d[k] = v; }); this.docs.push(d); }
    else if (!d) return { matchedCount: 0, modifiedCount: 0 };
    this._apply(d, u); return { matchedCount: 1, modifiedCount: 1 };
  }
  async findOneAndUpdate(f, u, o = {}) { await this.updateOne(f, u, o); return this.findOne(f); }
  async deleteOne(f) { const i = this.docs.findIndex(x => match(x, f)); if (i >= 0) this.docs.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; }
  async deleteMany(f) { const n = this.docs.length; this.docs = this.docs.filter(x => !match(x, f)); return { deletedCount: n - this.docs.length }; }
}
module.exports = () => { const c = {}; return { collection: n => (c[n] = c[n] || new Coll()) }; };

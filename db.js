// MongoDB connection. Set MONGO_URL (local, Docker or Atlas) and optionally MONGO_DB.
const { MongoClient } = require('mongodb');
async function connect() {
  const url = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  return client.db(process.env.MONGO_DB || 'lunar_veil');
}
module.exports = { connect };

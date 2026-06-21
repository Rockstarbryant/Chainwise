require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');

// ── Inline DB connect (avoids import path issues) ─────────────────────────
async function connectDB() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ MongoDB connected');
}

async function main() {
  await connectDB();

  const ExchangeFee = require('./src/models/ExchangeFee');
  const ExchangeApiKey = require('./src/models/ExchangeApiKey');
  const { syncExchange } = require('./src/services/exchangeSync');

  // ── Step 1: Wipe all coins arrays ────────────────────────────────────────
  console.log('\n🗑️  Wiping all coin/network data...');
  const result = await ExchangeFee.updateMany(
    {},
    { $set: { coins: [], lastUpdated: new Date(), dataSource: 'api' } }
  );
  console.log(`✅ Cleared coins from ${result.modifiedCount} exchange documents`);

  // ── Step 2: List what exchanges have API keys ─────────────────────────────
  const keys = await ExchangeApiKey.find({ isValid: true }).lean();
  if (keys.length === 0) {
    console.log('\n⚠️  No valid API keys found. Skipping sync.');
    console.log('   Add API keys via the admin panel first, then re-run this script.');
    process.exit(0);
  }

  console.log(`\n🔑 Found ${keys.length} valid API key(s):`);
  keys.forEach(k => console.log(`   • ${k.exchange} (adminUserId: ${k.adminUserId})`));

  // ── Step 3: Sync each exchange sequentially ───────────────────────────────
  console.log('\n🔄 Starting fresh sync for all exchanges...\n');

  const results = [];
  for (const key of keys) {
    try {
      console.log(`▶  Syncing ${key.exchange}...`);
      const r = await syncExchange(key.exchange, key.adminUserId.toString());
      results.push({ exchange: key.exchange, status: 'ok', ...r });
      console.log(`✅ ${key.exchange}: ${r.synced} coins synced in ${r.durationSecs}s\n`);
    } catch (err) {
      results.push({ exchange: key.exchange, status: 'error', error: err.message });
      console.error(`❌ ${key.exchange} failed: ${err.message}\n`);
    }
  }

  // ── Step 4: Summary ───────────────────────────────────────────────────────
  console.log('─'.repeat(50));
  console.log('SYNC SUMMARY');
  console.log('─'.repeat(50));
  for (const r of results) {
    if (r.status === 'ok') {
      console.log(`✅ ${r.exchange.padEnd(12)} ${r.synced} coins | ${r.durationSecs}s`);
    } else {
      console.log(`❌ ${r.exchange.padEnd(12)} FAILED: ${r.error}`);
    }
  }
  console.log('─'.repeat(50));

  // ── Step 5: Verify spot check ─────────────────────────────────────────────
  console.log('\n🔍 Spot check — USDT networks per exchange:');
  const allDocs = await ExchangeFee.find({}, 'exchange coins').lean();
  for (const doc of allDocs) {
    const usdt = doc.coins.find(c => c.symbol === 'USDT');
    if (usdt) {
      const cheapest = [...usdt.networks].sort((a, b) => a.withdrawFee - b.withdrawFee)[0];
      console.log(
        `   ${doc.exchange.padEnd(12)} ${usdt.networks.length} networks | ` +
        `cheapest: ${cheapest?.chain} @ ${cheapest?.withdrawFee} USDT`
      );
    } else {
      console.log(`   ${doc.exchange.padEnd(12)} ⚠️  no USDT data`);
    }
  }

  console.log('\n✅ Done. Fresh data is in the database.\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
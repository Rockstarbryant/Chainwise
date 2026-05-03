require('dotenv').config({ path: '.env' });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');           // ← fix this line
const ExchangeFee = require('../src/models/ExchangeFee');

// ─── REAL DATA — sourced from exchange interfaces (May 2025) ───────────────
const exchanges = [
  {
    exchange: 'bybit',
    displayName: 'Bybit',
    website: 'https://www.bybit.com',
    twitterHandle: '@Bybit_Official',
    p2p: true,
    p2pMinUSD: 1.5,
    p2pCountries: ['KE', 'NG', 'GH', 'ZA', 'UG', 'TZ', 'IN', 'PK', 'EG', 'MA'],
    dataSource: 'manual',
    coins: [
      {
        symbol: 'USDT',
        networks: [
          // ← Real data: Image 1 screenshot
          { chain: 'Plasma',       chainId: 'plasma',    withdrawFee: 0,    withdrawFeeUSD: 0,    minWithdraw: 0.2,  minDeposit: 0.2,  arrivalMins: 1 },
          { chain: 'APTOS',        chainId: 'aptos',     withdrawFee: 0,    withdrawFeeUSD: 0,    minWithdraw: 1,    minDeposit: 1,    arrivalMins: 1 },
          { chain: 'Mantle',       chainId: 'mantle',    withdrawFee: 0,    withdrawFeeUSD: 0,    minWithdraw: 0.5,  minDeposit: 0.5,  arrivalMins: 1 },
          { chain: 'TON',          chainId: 'ton',       withdrawFee: 0.15, withdrawFeeUSD: 0.15, minWithdraw: 1,    minDeposit: 1,    arrivalMins: 1 },
          { chain: 'BEP20',        chainId: 'bsc',       withdrawFee: 0.2,  withdrawFeeUSD: 0.20, minWithdraw: 1,    minDeposit: 1,    arrivalMins: 1 },
          { chain: 'Arbitrum One', chainId: 'arbitrum',  withdrawFee: 0.1,  withdrawFeeUSD: 0.10, minWithdraw: 1,    minDeposit: 1,    arrivalMins: 1 },
          { chain: 'Polygon PoS',  chainId: 'polygon',   withdrawFee: 0.1,  withdrawFeeUSD: 0.10, minWithdraw: 1,    minDeposit: 1,    arrivalMins: 1 },
          { chain: 'AVAXC',        chainId: 'avalanche', withdrawFee: 0.1,  withdrawFeeUSD: 0.10, minWithdraw: 1,    minDeposit: 1,    arrivalMins: 1 },
          { chain: 'Solana',       chainId: 'solana',    withdrawFee: 0.5,  withdrawFeeUSD: 0.50, minWithdraw: 1,    minDeposit: 1,    arrivalMins: 1 },
          { chain: 'Ethereum',     chainId: 'ethereum',  withdrawFee: 0.8,  withdrawFeeUSD: 0.80, minWithdraw: 5,    minDeposit: 5,    arrivalMins: 2 },
          { chain: 'TRC20',        chainId: 'tron',      withdrawFee: 1,    withdrawFeeUSD: 1.00, minWithdraw: 10,   minDeposit: 1,    arrivalMins: 1 },
        ],
      },
      {
        symbol: 'USDC',
        networks: [
          // ← Real data: Image 2 screenshot
          { chain: 'BEP20',        chainId: 'bsc',       withdrawFee: 0,    withdrawFeeUSD: 0,    minWithdraw: 10,   minDeposit: 1,    arrivalMins: 1 },
          { chain: 'Polygon PoS',  chainId: 'polygon',   withdrawFee: 0.12, withdrawFeeUSD: 0.12, minWithdraw: 10,   minDeposit: 1,    arrivalMins: 1 },
          { chain: 'Solana',       chainId: 'solana',    withdrawFee: 0.3,  withdrawFeeUSD: 0.30, minWithdraw: 10,   minDeposit: 1,    arrivalMins: 1 },
          { chain: 'Ethereum',     chainId: 'ethereum',  withdrawFee: 0.8,  withdrawFeeUSD: 0.80, minWithdraw: 10,   minDeposit: 10,   arrivalMins: 2 },
        ],
      },
      {
        symbol: 'ETH',
        networks: [
          // ← Real data: Image 3 screenshot
          { chain: 'BEP20',        chainId: 'bsc',       withdrawFee: 0.000008,  withdrawFeeUSD: 0.018, minWithdraw: 0.000016, minDeposit: 0.0001, arrivalMins: 1 },
          { chain: 'Arbitrum One', chainId: 'arbitrum',  withdrawFee: 0.00002,   withdrawFeeUSD: 0.046, minWithdraw: 0.0003,   minDeposit: 0.0001, arrivalMins: 1 },
          { chain: 'BASE',         chainId: 'base',      withdrawFee: 0.00005,   withdrawFeeUSD: 0.115, minWithdraw: 0.002,    minDeposit: 0.0001, arrivalMins: 1 },
          { chain: 'Ethereum',     chainId: 'ethereum',  withdrawFee: 0.00015,   withdrawFeeUSD: 0.345, minWithdraw: 0.002,    minDeposit: 0.001,  arrivalMins: 2 },
        ],
      },
    ],
  },
  {
    exchange: 'binance',
    displayName: 'Binance',
    website: 'https://www.binance.com',
    twitterHandle: '@binance',
    p2p: true,
    p2pMinUSD: 1,
    p2pCountries: ['KE', 'NG', 'GH', 'ZA', 'UG', 'TZ', 'RW', 'IN', 'PK'],
    dataSource: 'manual',
    coins: [
      {
        symbol: 'USDT',
        networks: [
          { chain: 'TON',          chainId: 'ton',       withdrawFee: 0.01, withdrawFeeUSD: 0.01, minWithdraw: 5,  minDeposit: 1,  arrivalMins: 1 },
          { chain: 'TRC20',        chainId: 'tron',      withdrawFee: 1,    withdrawFeeUSD: 1.00, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'BEP20',        chainId: 'bsc',       withdrawFee: 0.29, withdrawFeeUSD: 0.29, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Polygon PoS',  chainId: 'polygon',   withdrawFee: 0.8,  withdrawFeeUSD: 0.80, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Arbitrum One', chainId: 'arbitrum',  withdrawFee: 0.1,  withdrawFeeUSD: 0.10, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Optimism',     chainId: 'optimism',  withdrawFee: 0.1,  withdrawFeeUSD: 0.10, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Solana',       chainId: 'solana',    withdrawFee: 1,    withdrawFeeUSD: 1.00, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Ethereum',     chainId: 'ethereum',  withdrawFee: 4.5,  withdrawFeeUSD: 4.50, minWithdraw: 20, minDeposit: 10, arrivalMins: 2 },
        ],
      },
      {
        symbol: 'USDC',
        networks: [
          { chain: 'BEP20',        chainId: 'bsc',       withdrawFee: 0.29, withdrawFeeUSD: 0.29, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Polygon PoS',  chainId: 'polygon',   withdrawFee: 0.8,  withdrawFeeUSD: 0.80, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Arbitrum One', chainId: 'arbitrum',  withdrawFee: 0.1,  withdrawFeeUSD: 0.10, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'BASE',         chainId: 'base',      withdrawFee: 0.1,  withdrawFeeUSD: 0.10, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Solana',       chainId: 'solana',    withdrawFee: 1,    withdrawFeeUSD: 1.00, minWithdraw: 10, minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Ethereum',     chainId: 'ethereum',  withdrawFee: 4.5,  withdrawFeeUSD: 4.50, minWithdraw: 20, minDeposit: 10, arrivalMins: 2 },
        ],
      },
      {
        symbol: 'ETH',
        networks: [
          { chain: 'Arbitrum One', chainId: 'arbitrum',  withdrawFee: 0.0001,  withdrawFeeUSD: 0.23,  minWithdraw: 0.001, minDeposit: 0.001, arrivalMins: 1 },
          { chain: 'BASE',         chainId: 'base',      withdrawFee: 0.0001,  withdrawFeeUSD: 0.23,  minWithdraw: 0.001, minDeposit: 0.001, arrivalMins: 1 },
          { chain: 'Optimism',     chainId: 'optimism',  withdrawFee: 0.0001,  withdrawFeeUSD: 0.23,  minWithdraw: 0.001, minDeposit: 0.001, arrivalMins: 1 },
          { chain: 'BEP20',        chainId: 'bsc',       withdrawFee: 0.00045, withdrawFeeUSD: 1.04,  minWithdraw: 0.001, minDeposit: 0.001, arrivalMins: 1 },
          { chain: 'Ethereum',     chainId: 'ethereum',  withdrawFee: 0.0005,  withdrawFeeUSD: 1.15,  minWithdraw: 0.01,  minDeposit: 0.001, arrivalMins: 2 },
        ],
      },
    ],
  },
  {
    exchange: 'coinex',
    displayName: 'CoinEx',
    website: 'https://www.coinex.com',
    twitterHandle: '@coinexcom',
    p2p: false,
    p2pMinUSD: null,
    p2pCountries: [],
    dataSource: 'manual',
    coins: [
      {
        symbol: 'USDT',
        networks: [
          { chain: 'Plasma',  chainId: 'plasma',    withdrawFee: 0,   withdrawFeeUSD: 0,    minWithdraw: 0.2, minDeposit: 0.2, arrivalMins: 1 },
          { chain: 'CSC',     chainId: 'csc',       withdrawFee: 0.1, withdrawFeeUSD: 0.10, minWithdraw: 1,   minDeposit: 1,   arrivalMins: 1 },
          { chain: 'BEP20',   chainId: 'bsc',       withdrawFee: 0.5, withdrawFeeUSD: 0.50, minWithdraw: 5,   minDeposit: 1,   arrivalMins: 1 },
          { chain: 'TRC20',   chainId: 'tron',      withdrawFee: 1,   withdrawFeeUSD: 1.00, minWithdraw: 5,   minDeposit: 1,   arrivalMins: 1 },
          { chain: 'Ethereum',chainId: 'ethereum',  withdrawFee: 4,   withdrawFeeUSD: 4.00, minWithdraw: 20,  minDeposit: 10,  arrivalMins: 2 },
        ],
      },
    ],
  },
  {
    exchange: 'bitget',
    displayName: 'Bitget',
    website: 'https://www.bitget.com',
    twitterHandle: '@BitgetGlobal',
    p2p: true,
    p2pMinUSD: 1,
    p2pCountries: ['KE', 'NG', 'GH', 'ZA', 'IN'],
    dataSource: 'manual',
    coins: [
      {
        symbol: 'USDT',
        networks: [
          { chain: 'TRC20',        chainId: 'tron',     withdrawFee: 1,    withdrawFeeUSD: 1.00, minWithdraw: 5,  minDeposit: 1,  arrivalMins: 1 },
          { chain: 'BEP20',        chainId: 'bsc',      withdrawFee: 0.29, withdrawFeeUSD: 0.29, minWithdraw: 5,  minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Arbitrum One', chainId: 'arbitrum', withdrawFee: 0.5,  withdrawFeeUSD: 0.50, minWithdraw: 5,  minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Solana',       chainId: 'solana',   withdrawFee: 1,    withdrawFeeUSD: 1.00, minWithdraw: 5,  minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Ethereum',     chainId: 'ethereum', withdrawFee: 4,    withdrawFeeUSD: 4.00, minWithdraw: 20, minDeposit: 10, arrivalMins: 2 },
        ],
      },
    ],
  },
  {
    exchange: 'kucoin',
    displayName: 'KuCoin',
    website: 'https://www.kucoin.com',
    twitterHandle: '@kucoincom',
    p2p: true,
    p2pMinUSD: 1,
    p2pCountries: ['KE', 'NG', 'GH', 'IN', 'PK'],
    dataSource: 'manual',
    coins: [
      {
        symbol: 'USDT',
        networks: [
          { chain: 'TRC20',        chainId: 'tron',     withdrawFee: 1,    withdrawFeeUSD: 1.00, minWithdraw: 5,  minDeposit: 1,  arrivalMins: 1 },
          { chain: 'BEP20',        chainId: 'bsc',      withdrawFee: 0.29, withdrawFeeUSD: 0.29, minWithdraw: 5,  minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Solana',       chainId: 'solana',   withdrawFee: 1,    withdrawFeeUSD: 1.00, minWithdraw: 5,  minDeposit: 1,  arrivalMins: 1 },
          { chain: 'Ethereum',     chainId: 'ethereum', withdrawFee: 4.5,  withdrawFeeUSD: 4.50, minWithdraw: 20, minDeposit: 10, arrivalMins: 2 },
        ],
      },
    ],
  },
];

async function seed() {
  await connectDB();
  console.log('Connected. Seeding...');

  for (const data of exchanges) {
    await ExchangeFee.findOneAndUpdate(
      { exchange: data.exchange },
      { ...data, lastUpdated: new Date() },
      { upsert: true, new: true }
    );
    console.log(`✓ Seeded ${data.displayName}`);
  }

  console.log('\n✅ All exchanges seeded successfully.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
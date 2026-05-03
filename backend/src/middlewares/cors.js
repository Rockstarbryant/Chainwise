const cors = require('cors');
const logger = require('../../utils/logger');

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'https://chainwise-seven.vercel.app',
  // Add production domains here
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no origin (curl, mobile apps, Postman)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`CORS blocked: ${origin}`);
    callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
    'X-API-Version',
  ],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
  credentials: true,
  maxAge: 86400, // 24h preflight cache
};

module.exports = cors(corsOptions);
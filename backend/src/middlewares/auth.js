const { createClient } = require('@supabase/supabase-js');
const logger = require('../../utils/logger');
const { error: sendError } = require('../../utils/response');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Shared token verifier ─────────────────────────────────────────────────
async function verifyToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return {
    id:       user.id,
    email:    user.email,
    provider: user.app_metadata?.provider,
    name:     user.user_metadata?.full_name,
    avatar:   user.user_metadata?.avatar_url,
  };
}

// ── Full auth — blocks unauthenticated ───────────────────────────────────
const requireAuth = async (req, res, next) => {
  try {
    const user = await verifyToken(req);
    if (!user) {
      return sendError(res, 'Authorization required', 401);
    }
    req.userId    = user.id;
    req.userEmail = user.email;
    req.user      = user;
    next();
  } catch (err) {
    logger.error('Auth error:', err);
    return sendError(res, 'Authentication error', 500);
  }
};

// ── Admin — must be authenticated AND email in ADMIN_EMAILS ──────────────
const requireAdmin = async (req, res, next) => {
  try {
    const user = await verifyToken(req);
    if (!user) {
      return sendError(res, 'Authorization required', 401);
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean);

    if (!adminEmails.includes(user.email?.toLowerCase())) {
      logger.warn(`Admin access denied for: ${user.email}`);
      return sendError(res, 'Admin access required', 403);
    }

    req.userId    = user.id;
    req.userEmail = user.email;
    req.user      = user;
    next();
  } catch (err) {
    logger.error('Admin auth error:', err);
    return sendError(res, 'Authentication error', 500);
  }
};

// ── Optional — attaches user if token present, never blocks ─────────────
const optionalAuth = async (req, res, next) => {
  try {
    const user = await verifyToken(req);
    req.userId    = user?.id    || null;
    req.userEmail = user?.email || null;
    req.user      = user        || null;
    next();
  } catch {
    req.userId = null;
    req.user   = null;
    next();
  }
};

module.exports = { requireAuth, optionalAuth, requireAdmin };
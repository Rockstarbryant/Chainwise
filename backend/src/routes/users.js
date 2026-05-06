// backend/src/routes/users.js
// Mount in server.js: app.use('/api/admin/users', usersRoute);

const express = require('express');
const router  = express.Router();
const { requireAdmin } = require('../middlewares/auth');
const { createClient } = require('@supabase/supabase-js');
const { success, error: sendError } = require('../../utils/response');
const logger = require('../../utils/logger');

// Service-role client — can list all users
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * GET /api/admin/users
 * Returns all registered users with auth provider info.
 * Admin only.
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const page     = parseInt(req.query.page  || '1',  10);
    const perPage  = parseInt(req.query.limit || '50', 10);

    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      logger.error('Failed to list users:', error);
      return sendError(res, 'Failed to fetch users', 500);
    }

    // Shape the response — strip anything sensitive
    const users = data.users.map(u => ({
      id:              u.id,
      email:           u.email || null,
      name:            u.user_metadata?.full_name || u.user_metadata?.name || null,
      avatar:          u.user_metadata?.avatar_url || null,
      provider:        u.app_metadata?.provider || 'email',
      providers:       u.app_metadata?.providers || [u.app_metadata?.provider || 'email'],
      emailVerified:   !!u.email_confirmed_at,
      phoneVerified:   !!u.phone_confirmed_at,
      lastSignIn:      u.last_sign_in_at || null,
      createdAt:       u.created_at,
      isBanned:        !!u.banned_until,
    }));

    // Summary stats
    const providerCounts = users.reduce((acc, u) => {
      const p = u.provider;
      acc[p] = (acc[p] || 0) + 1;
      return acc;
    }, {});

    return success(res, {
      users,
      total:      data.total   || users.length,
      page:       data.page    || page,
      perPage:    data.perPage || perPage,
      stats: {
        total:    data.total || users.length,
        byProvider: providerCounts,
        verified: users.filter(u => u.emailVerified).length,
      },
    });

  } catch (err) {
    logger.error('Users route error:', err);
    return sendError(res, 'Internal server error', 500);
  }
});

/**
 * DELETE /api/admin/users/:id
 * Hard-deletes a user from Supabase. Admin only.
 */
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) {
      logger.error('Failed to delete user:', error);
      return sendError(res, 'Failed to delete user', 500);
    }
    return success(res, { deleted: id });
  } catch (err) {
    logger.error('Delete user error:', err);
    return sendError(res, 'Internal server error', 500);
  }
});

module.exports = router;
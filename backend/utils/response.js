// Standardized API response envelope used by every controller

const success = (res, data, statusCode = 200, meta = {}) => {
  const payload = {
    success: true,
    data,
    ...(Object.keys(meta).length && { meta }),
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(payload);
};

const error = (res, message, statusCode = 500, details = null) => {
  const payload = {
    success: false,
    error: {
      message,
      ...(details && { details }),
      ...(process.env.NODE_ENV === 'development' && details?.stack
        ? { stack: details.stack }
        : {}),
    },
    timestamp: new Date().toISOString(),
  };
  return res.status(statusCode).json(payload);
};

const paginated = (res, data, total, page, limit) => {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
    },
    timestamp: new Date().toISOString(),
  });
};

module.exports = { success, error, paginated };
const { run, uuid } = require('./db');

/**
 * Log sensitive database access/modification to audit trail
 */
function logAudit(userId, username, action, targetTable = null, recordId = null, accessedFields = null) {
  try {
    const timestamp = new Date().toISOString();
    run(
      `INSERT INTO audit_logs (id, user_id, username, action, target_table, record_id, accessed_fields, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        userId || 'system',
        username || 'system_service',
        action,
        targetTable,
        recordId,
        accessedFields ? (typeof accessedFields === 'string' ? accessedFields : JSON.stringify(accessedFields)) : null,
        timestamp
      ]
    );
  } catch (err) {
    console.error('[Audit Logger Error] Failed to write audit log:', err);
  }
}

/**
 * Express Middleware to audit sensitive API calls
 */
function auditRoute(actionName, targetTable) {
  return (req, res, next) => {
    // Audit log after response is successfully sent
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const userId = req.user ? req.user.id : null;
        const username = req.user ? req.user.username : 'anonymous';
        
        // Log query parameters, URL path, or body items as record references
        const recordId = req.params.id || req.query.undertrialId || req.body.undertrialId || null;
        
        logAudit(
          userId,
          username,
          actionName,
          targetTable,
          recordId,
          Object.keys(req.body || {}).join(',') || null
        );
      }
    });
    next();
  };
}

module.exports = {
  logAudit,
  auditRoute
};

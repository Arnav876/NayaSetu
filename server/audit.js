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
 * Log user activity (login, logout, navigation, actions) to database
 */
function logActivity(userId, username, role, actionType, actionDetail = null, ipAddress = null, userAgent = null, status = 'SUCCESS', metadata = null) {
  try {
    const timestamp = new Date().toISOString();
    const metaStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;

    // 1. Insert into user_activity_logs
    run(
      `INSERT INTO user_activity_logs (id, user_id, username, role, action_type, action_detail, ip_address, user_agent, status, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        userId || null,
        username || 'anonymous',
        role || null,
        actionType,
        actionDetail,
        ipAddress || '127.0.0.1',
        userAgent || 'Unknown',
        status,
        metaStr,
        timestamp
      ]
    );

    // 2. Also record in audit_logs for backward compatibility
    run(
      `INSERT INTO audit_logs (id, user_id, username, action, target_table, record_id, accessed_fields, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        userId || 'system',
        username || 'anonymous',
        actionType,
        'user_activity_logs',
        null,
        metaStr || actionDetail,
        timestamp
      ]
    );
  } catch (err) {
    console.error('[Activity Logger Error] Failed to write user activity log:', err);
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
  logActivity,
  auditRoute
};


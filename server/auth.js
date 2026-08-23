const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, run, uuid } = require('./db');
const { logActivity } = require('./audit');

const JWT_SECRET = 'nyayasetu_secure_jwt_secret_key_sih_2026';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, hash] = storedHash.split(':');
  const checkHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === checkHash;
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// Role-based access control middleware
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Unauthorized: Access restricted to roles: [${allowedRoles.join(', ')}]` });
    }
    next();
  };
}

// Helper to get client IP and user agent
function getClientMeta(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown';
  return { ip, userAgent };
}

// Login Controller
function handleLogin(req, res) {
  const { username, password } = req.body;
  const { ip, userAgent } = getClientMeta(req);

  if (!username || !password) {
    logActivity(null, username || 'anonymous', null, 'LOGIN_FAILED', 'Missing username or password', ip, userAgent, 'FAILED', { reason: 'missing_fields' });
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const cleanUsername = username.toLowerCase().trim();

  try {
    const user = query('SELECT * FROM users WHERE LOWER(username) = ?', [cleanUsername])[0];
    
    if (!user || !verifyPassword(password, user.password_hash)) {
      logActivity(
        user ? user.id : null,
        cleanUsername,
        user ? user.role : null,
        'LOGIN_FAILED',
        'Failed login attempt: Invalid username or password',
        ip,
        userAgent,
        'FAILED',
        { attempted_username: cleanUsername }
      );
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Sign JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.full_name },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Record successful login in database
    logActivity(
      user.id,
      user.username,
      user.role,
      'LOGIN_SUCCESS',
      `User ${user.full_name} (${user.role}) logged in successfully`,
      ip,
      userAgent,
      'SUCCESS',
      { full_name: user.full_name, role: user.role }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name
      }
    });
  } catch (err) {
    console.error('[Auth Error] Error in login', err);
    logActivity(null, cleanUsername, null, 'LOGIN_ERROR', `Internal login error: ${err.message}`, ip, userAgent, 'ERROR', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

function handleRegister(req, res) {
  const { username, password, role, fullName, contactInfo } = req.body;
  const { ip, userAgent } = getClientMeta(req);

  if (!username || !password || !role || !fullName) {
    return res.status(400).json({ error: 'Username, password, role, and full name are required' });
  }

  const allowedRoles = ['prison_official', 'dlsa_officer', 'lawyer', 'prisoner', 'family_member', 'admin'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role specified. Allowed roles: ${allowedRoles.join(', ')}` });
  }

  const cleanUsername = username.toLowerCase().trim();

  try {
    const existing = query('SELECT * FROM users WHERE LOWER(username) = ?', [cleanUsername]);
    if (existing.length > 0) {
      logActivity(null, cleanUsername, role, 'REGISTER_FAILED', 'Registration failed: Username already exists', ip, userAgent, 'FAILED', { cleanUsername });
      return res.status(400).json({ error: 'Username already exists' });
    }

    const userId = uuid();
    const passwordHash = hashPassword(password);

    run(
      'INSERT INTO users (id, username, password_hash, role, full_name, contact_info) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, cleanUsername, passwordHash, role, fullName.trim(), contactInfo ? contactInfo.trim() : '']
    );

    // Auto-create matching undertrial and case records for prisoners
    if (role === 'prisoner') {
      const undertrialId = uuid();
      const prisonerNumber = `UT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || 'Prisoner';
      const lastName = nameParts.slice(1).join(' ') || 'User';

      run(
        'INSERT INTO undertrials (id, user_id, prisoner_number, first_name, last_name, date_of_birth, gender, date_of_arrest, remand_date, primary_charge, sections, detention_facility, bail_status, bail_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          undertrialId,
          userId,
          prisonerNumber,
          firstName,
          lastName,
          '1995-01-01',
          'Male',
          new Date().toISOString().split('T')[0],
          new Date().toISOString().split('T')[0],
          'Theft (BNS Section 303)',
          'BNS Sec 303',
          'Tihar Jail No. 4',
          'not_applied',
          0
        ]
      );

      const caseId = uuid();
      const caseNo = `CNR-DLHC-00${Math.floor(100000 + Math.random() * 900000)}-2026`;
      run(
        'INSERT INTO cases (id, undertrial_id, case_number, court_name, judge_name, status) VALUES (?, ?, ?, ?, ?, ?)',
        [caseId, undertrialId, caseNo, 'Patiala House Court, Delhi', 'Metropolitan Magistrate', 'active']
      );

      run(
        'INSERT INTO case_events (id, case_id, event_type, event_date, status, title, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), caseId, 'arrest', new Date().toISOString().split('T')[0], 'done', 'Arrest', 'Arrest recorded in system upon registration']
      );

      run(
        'INSERT INTO legal_aid_requests (id, undertrial_id, request_type, request_date, status, assigned_lawyer_id, notes) VALUES (?, ?, ?, ?, \'pending\', NULL, ?)',
        [uuid(), undertrialId, 'lawyer_assignment', new Date().toISOString().split('T')[0], 'System auto-initialized legal-aid request for newly registered prisoner']
      );
    }

    // Record registration activity in database
    logActivity(
      userId,
      cleanUsername,
      role,
      'REGISTER',
      `User ${fullName.trim()} successfully registered with role: ${role}`,
      ip,
      userAgent,
      'SUCCESS',
      { fullName: fullName.trim(), role, contactInfo }
    );

    // Sign JWT so client can either auto-login or redirect
    const token = jwt.sign(
      { id: userId, username: cleanUsername, role, name: fullName.trim() },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: userId,
        username: cleanUsername,
        role,
        full_name: fullName.trim()
      }
    });
  } catch (err) {
    console.error('[Auth Error] Error in register', err);
    logActivity(null, cleanUsername, role, 'REGISTER_ERROR', `Internal registration error: ${err.message}`, ip, userAgent, 'ERROR', { error: err.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = {
  authenticateToken,
  requireRole,
  handleLogin,
  handleRegister,
  JWT_SECRET
};


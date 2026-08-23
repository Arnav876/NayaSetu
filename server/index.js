const express = require('express');
const { query, run, uuid } = require('./db');
const { evaluateRules } = require('./rules');
const { mockSummarizeDocument, processChatQuery, getChatHistory } = require('./ai');
const { authenticateToken, requireRole, handleLogin, handleRegister, hashPassword } = require('./auth');
const { logAudit, logActivity, auditRoute } = require('./audit');

const app = express();
app.use(express.json());

// Enable basic CORS for development if needed (Vite proxy will bypass this under normal circumstances)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  next();
});

// Automatic User Session & API Activity Logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    // Only log API calls (skip internal high-frequency queries to logs themselves to prevent loops)
    if (
      req.originalUrl.startsWith('/api') &&
      !req.originalUrl.startsWith('/api/activity/logs') &&
      !req.originalUrl.startsWith('/api/audit/logs')
    ) {
      const userId = req.user ? req.user.id : null;
      const username = req.user ? req.user.username : (req.body?.username || 'anonymous');
      const role = req.user ? req.user.role : null;
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const durationMs = Date.now() - start;

      // Extract sanitized metadata
      let safeMeta = { method: req.method, url: req.originalUrl, statusCode: res.statusCode, durationMs };
      if (req.params && Object.keys(req.params).length > 0) safeMeta.params = req.params;

      logActivity(
        userId,
        username,
        role,
        'API_REQUEST',
        `${req.method} ${req.originalUrl} (${res.statusCode}) - ${durationMs}ms`,
        ip,
        userAgent,
        res.statusCode >= 200 && res.statusCode < 400 ? 'SUCCESS' : 'FAILED',
        safeMeta
      );
    }
  });
  next();
});

// 1. Authentication Routes
app.post('/api/auth/login', handleLogin);
app.post('/api/auth/register', handleRegister);

// 2. Data Minimization helper
function serializeUndertrial(undertrial, role) {
  if (!undertrial) return null;

  // Clone undertrial to avoid mutations
  const result = { ...undertrial };

  if (role === 'family_member') {
    // strict minimization: family member never sees criminal charges, sections, PII DOB, or legal-aid notes
    delete result.primary_charge;
    delete result.sections;
    delete result.date_of_birth;
    delete result.user_id;
    if (result.legal_aid) {
      delete result.legal_aid.notes;
    }
  } else if (role === 'prisoner') {
    // prisoner sees details, but we omit internal system logs or lawyer personal logs
    delete result.user_id;
  }
  return result;
}

// 3. Undertrials Roster & Detailed Information
// GET /api/undertrials - Returns roster based on user role (Module 5)
app.get('/api/undertrials', authenticateToken, (req, res) => {
  const { id: userId, role } = req.user;

  try {
    let list = [];
    if (role === 'prison_official' || role === 'dlsa_officer' || role === 'admin') {
      // Prison & DLSA staff can view all undertrials
      list = query(`
        SELECT u.*, c.case_number, c.court_name 
        FROM undertrials u
        LEFT JOIN cases c ON c.undertrial_id = u.id
      `);
    } else if (role === 'lawyer') {
      // Lawyers view undertrials where they are the assigned counsel
      list = query(`
        SELECT u.*, c.case_number, c.court_name 
        FROM undertrials u
        LEFT JOIN cases c ON c.undertrial_id = u.id
        JOIN legal_aid_requests lar ON u.id = lar.undertrial_id
        WHERE lar.assigned_lawyer_id = ? AND lar.status = 'assigned'
      `, [userId]);
    } else if (role === 'prisoner') {
      // Prisoner views only their own record
      list = query(`
        SELECT u.*, c.case_number, c.court_name 
        FROM undertrials u
        LEFT JOIN cases c ON c.undertrial_id = u.id
        WHERE u.user_id = ?
      `, [userId]);
    } else if (role === 'family_member') {
      // Family member views only their relative's record
      // Find prisoner associated with this family username (e.g., rajesh_family has relative rajesh_kumar)
      const relativeUsername = req.user.username.replace(/_family$/i, '').toLowerCase().trim();
      list = query(`
        SELECT u.*, c.case_number, c.court_name 
        FROM undertrials u
        LEFT JOIN cases c ON c.undertrial_id = u.id
        JOIN users pu ON u.user_id = pu.id
        WHERE LOWER(pu.username) = ? OR LOWER(pu.username) LIKE ?
      `, [relativeUsername, `%${relativeUsername}%`]);

      // If no exact linked prisoner found, provide minimized roster of available undertrials
      if (list.length === 0) {
        list = query(`
          SELECT u.*, c.case_number, c.court_name 
          FROM undertrials u
          LEFT JOIN cases c ON c.undertrial_id = u.id
        `);
      }
    }

    const auditedFields = 'id,first_name,last_name,prisoner_number,bail_status';
    logAudit(userId, req.user.username, 'view_undertrials_roster', 'undertrials', null, auditedFields);

    const serialized = list.map(item => serializeUndertrial(item, role));
    res.json(serialized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch roster' });
  }
});

// GET /api/undertrials/:id - Detailed view including timeline, hearings, legal-aid, docs, rehab (Module 1, 5)
app.get('/api/undertrials/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { id: userId, role } = req.user;

  try {
    // 1. Basic check if user has access to this specific record
    let hasAccess = false;
    if (role === 'prison_official' || role === 'dlsa_officer' || role === 'admin') {
      hasAccess = true;
    } else if (role === 'lawyer') {
      const assigned = query(`
        SELECT 1 FROM legal_aid_requests 
        WHERE undertrial_id = ? AND assigned_lawyer_id = ? AND status = 'assigned'
      `, [id, userId]);
      if (assigned.length > 0) hasAccess = true;
    } else if (role === 'prisoner') {
      const owned = query('SELECT 1 FROM undertrials WHERE id = ? AND user_id = ?', [id, userId]);
      if (owned.length > 0) hasAccess = true;
    } else if (role === 'family_member') {
      hasAccess = true; // Permitted under data minimization
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this prisoner record' });
    }

    // 2. Fetch main undertrial record
    const undertrial = query('SELECT * FROM undertrials WHERE id = ?', [id])[0];
    if (!undertrial) {
      return res.status(404).json({ error: 'Undertrial not found' });
    }

    // 3. Fetch Case and timelines (Module 1)
    const caseRecord = query('SELECT * FROM cases WHERE undertrial_id = ?', [id])[0];
    let timeline = [];
    let hearings = [];
    let documents = [];
    let legalAid = null;
    let rehabPrograms = [];

    if (caseRecord) {
      // Fetch timeline case_events
      timeline = query(`
        SELECT * FROM case_events 
        WHERE case_id = ? 
        ORDER BY event_date ASC
      `, [caseRecord.id]);

      // Fetch hearings
      hearings = query(`
        SELECT * FROM hearings 
        WHERE case_id = ? 
        ORDER BY hearing_date ASC
      `, [caseRecord.id]);

      // Fetch documents (minimized for family members)
      if (role !== 'family_member') {
        documents = query(`
          SELECT id, file_name, file_type, uploaded_at, is_confirmed, ai_summary, ai_extracted_json
          FROM documents 
          WHERE case_id = ?
        `, [caseRecord.id]);
      }
    }

    // Fetch legal aid requests
    legalAid = query(`
      SELECT lar.*, u.full_name AS lawyer_name, u.contact_info AS lawyer_contact 
      FROM legal_aid_requests lar
      LEFT JOIN users u ON lar.assigned_lawyer_id = u.id
      WHERE lar.undertrial_id = ?
      ORDER BY lar.request_date DESC LIMIT 1
    `, [id])[0];

    // Fetch rehabilitation status (Module 10)
    rehabPrograms = query(`
      SELECT r.*, 
        (SELECT json_group_array(json_object('date', date, 'status', status, 'verification_mode', verification_mode)) 
         FROM rehabilitation_attendance WHERE rehabilitation_id = r.id) as attendance
      FROM rehabilitation r
      WHERE r.undertrial_id = ?
    `, [id]).map(p => {
      try {
        p.attendance = p.attendance ? JSON.parse(p.attendance) : [];
        if (Array.isArray(p.attendance)) {
          p.attendance = p.attendance.filter(a => a && a.date !== null);
        }
      } catch (e) {
        p.attendance = [];
      }
      return p;
    });

    logAudit(userId, req.user.username, 'view_undertrial_details', 'undertrials', id, 'all_related_records');

    // Package detailed output
    const detailedData = {
      ...undertrial,
      case: caseRecord ? {
        ...caseRecord,
        timeline,
        hearings,
        documents
      } : null,
      legal_aid: legalAid,
      rehabilitation: rehabPrograms
    };

    // Serialize details for data minimization
    const serialized = serializeUndertrial(detailedData, role);
    res.json(serialized);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch undertrial details' });
  }
});

// POST /api/undertrials - Manual Undertrial Entry (Restricted to Prison Officials and Admins)
app.post('/api/undertrials', authenticateToken, requireRole(['prison_official', 'admin']), (req, res) => {
  const {
    firstName,
    lastName,
    prisonerNumber,
    dateOfArrest,
    remandDate,
    detentionFacility,
    primaryCharge,
    sections,
    dateOfBirth,
    gender,
    caseNumber,
    courtName,
    judgeName
  } = req.body;

  if (!firstName || !lastName || !dateOfArrest || !remandDate || !detentionFacility) {
    return res.status(400).json({ error: 'First Name, Last Name, Arrest Date, Remand Date, and Facility are required.' });
  }

  const pNumber = prisonerNumber && prisonerNumber.trim() ? prisonerNumber.trim() : `UT-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim();
  const cleanFacility = detentionFacility.trim();
  const cleanCharge = primaryCharge ? primaryCharge.trim() : 'Under Investigation';
  const cleanSections = sections ? sections.trim() : 'BNS Sec 303';
  const cleanDob = dateOfBirth || '1995-01-01';
  const cleanGender = gender || 'Male';
  const cleanCaseNo = caseNumber ? caseNumber.trim() : `CNR-DLHC-00${Math.floor(100000 + Math.random() * 900000)}-2026`;
  const cleanCourt = courtName ? courtName.trim() : 'Metropolitan Magistrate Court, Delhi';
  const cleanJudge = judgeName ? judgeName.trim() : 'Metropolitan Magistrate';

  try {
    // 1. Create a User Account for the Undertrial
    const baseUsername = `${cleanFirstName.toLowerCase().replace(/[^a-z0-9]/g, '')}_${cleanLastName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    let pUsername = baseUsername;
    const existing = query('SELECT id FROM users WHERE LOWER(username) = ?', [pUsername]);
    if (existing.length > 0) {
      pUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
    }

    const userId = uuid();
    const passwordHash = hashPassword('prisoner123');

    run(
      'INSERT INTO users (id, username, password_hash, role, full_name, contact_info) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, pUsername, passwordHash, 'prisoner', `${cleanFirstName} ${cleanLastName}`, `Detention: ${cleanFacility}`]
    );

    // 2. Create Undertrial Record
    const undertrialId = uuid();
    run(
      `INSERT INTO undertrials (
        id, user_id, prisoner_number, first_name, last_name, date_of_birth, gender,
        date_of_arrest, remand_date, primary_charge, sections, detention_facility,
        bail_status, bail_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_applied', 0)`,
      [
        undertrialId,
        userId,
        pNumber,
        cleanFirstName,
        cleanLastName,
        cleanDob,
        cleanGender,
        dateOfArrest,
        remandDate,
        cleanCharge,
        cleanSections,
        cleanFacility
      ]
    );

    // 3. Create Case Record
    const caseId = uuid();
    run(
      'INSERT INTO cases (id, undertrial_id, case_number, court_name, judge_name, status) VALUES (?, ?, ?, ?, ?, ?)',
      [caseId, undertrialId, cleanCaseNo, cleanCourt, cleanJudge, 'active']
    );

    // 4. Initialize Justice Timeline Events (Arrest & Remand)
    run(
      'INSERT INTO case_events (id, case_id, event_type, event_date, status, title, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid(), caseId, 'arrest', dateOfArrest, 'done', 'Arrest', `Arrest registered on ${dateOfArrest}. Intake processed at ${cleanFacility}.`]
    );

    run(
      'INSERT INTO case_events (id, case_id, event_type, event_date, status, title, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid(), caseId, 'remand', remandDate, 'done', 'Initial Remand Order', `Produced before Magistrate. Remanded to judicial custody at ${cleanFacility}.`]
    );

    // 5. Initialize Legal Aid Request Queue entry
    const legalAidId = uuid();
    run(
      'INSERT INTO legal_aid_requests (id, undertrial_id, request_type, request_date, status, assigned_lawyer_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [legalAidId, undertrialId, 'lawyer_assignment', remandDate, 'pending', null, 'Auto-generated legal aid intake request upon undertrial registration.']
    );

    // 6. Log in Audit Trail
    logAudit(
      req.user.id,
      req.user.username,
      'create_undertrial',
      'undertrials',
      undertrialId,
      'first_name,last_name,prisoner_number,date_of_arrest,remand_date,detention_facility'
    );

    logActivity(
      req.user.id,
      req.user.username,
      req.user.role,
      'MANUAL_INTAKE_PRISONER',
      `Manual intake created for undertrial ${cleanFirstName} ${cleanLastName} (${pNumber}) by ${req.user.full_name}`,
      req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
      req.headers['user-agent'] || 'Unknown',
      'SUCCESS',
      { undertrialId, prisonerNumber: pNumber, createdBy: req.user.username }
    );

    res.status(201).json({
      success: true,
      message: `Undertrial ${cleanFirstName} ${cleanLastName} created successfully with ID ${pNumber}.`,
      undertrial: {
        id: undertrialId,
        user_id: userId,
        prisoner_number: pNumber,
        first_name: cleanFirstName,
        last_name: cleanLastName,
        facility: cleanFacility,
        username: pUsername,
        case_number: cleanCaseNo
      }
    });
  } catch (err) {
    console.error('[Undertrial Create Error]', err);
    res.status(500).json({ error: `Failed to create undertrial: ${err.message}` });
  }
});

// 4. Action Required Engine (Module 2)
app.get('/api/cases/action-items', authenticateToken, (req, res) => {
  const { role } = req.user;
  try {
    const allItems = evaluateRules('2026-08-17'); // Constant mock date representing system time
    
    // Filter action items by role
    let filteredItems = allItems;
    if (role === 'dlsa_officer') {
      filteredItems = allItems.filter(item => item.responsible_role === 'dlsa_officer');
    } else if (role === 'lawyer') {
      // Lawyer only sees items for their assigned cases
      const lawyerCases = query(`
        SELECT c.id FROM cases c
        JOIN legal_aid_requests lar ON c.undertrial_id = lar.undertrial_id
        WHERE lar.assigned_lawyer_id = ? AND lar.status = 'assigned'
      `, [req.user.id]).map(c => c.id);

      filteredItems = allItems.filter(item => item.responsible_role === 'lawyer' && lawyerCases.includes(item.case_id));
    } else if (role === 'prison_official') {
      // Prison official sees BNSS 479 alerts and lawyer assignment alerts to coordinates releases
      filteredItems = allItems.filter(item => item.title.includes('Threshold') || item.title.includes('Escalation'));
    } else if (role === 'prisoner' || role === 'family_member') {
      // Prisoners and families do not see operational alerts directly
      filteredItems = [];
    }

    res.json(filteredItems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to evaluate action engine' });
  }
});

// 5. DLSA/Legal Aid Workflows (Module 4)
// Get lawyer list for assignment
app.get('/api/legal-aid/lawyers', authenticateToken, requireRole(['dlsa_officer', 'admin']), (req, res) => {
  try {
    const lawyers = query("SELECT id, username, full_name, contact_info FROM users WHERE role = 'lawyer'");
    res.json(lawyers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch lawyer roster' });
  }
});

// POST /api/legal-aid/lawyers - Manual Lawyer Entry (Restricted to DLSA Officers and Admins)
app.post('/api/legal-aid/lawyers', authenticateToken, requireRole(['dlsa_officer', 'admin']), (req, res) => {
  const { fullName, barRegistrationId, contactInfo, affiliation, password } = req.body;

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Lawyer full name is required.' });
  }

  const cleanName = fullName.trim();
  const cleanBarId = barRegistrationId ? barRegistrationId.trim() : '';
  const cleanContact = contactInfo ? contactInfo.trim() : '';
  const cleanAffiliation = affiliation ? affiliation.trim() : 'DLSA Panel';

  // Construct contact details string
  const contactDetails = [cleanContact, cleanBarId ? `Bar ID: ${cleanBarId}` : '', cleanAffiliation ? `(${cleanAffiliation})` : '']
    .filter(Boolean)
    .join(' • ');

  // Generate username
  const baseUsername = `lawyer_${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  let lawyerUsername = baseUsername;
  const existing = query('SELECT id FROM users WHERE LOWER(username) = ?', [lawyerUsername]);
  if (existing.length > 0) {
    lawyerUsername = `${baseUsername}_${Math.floor(100 + Math.random() * 900)}`;
  }

  const lawyerId = uuid();
  const passwordHash = hashPassword(password && password.trim() ? password.trim() : 'password123');

  try {
    run(
      'INSERT INTO users (id, username, password_hash, role, full_name, contact_info) VALUES (?, ?, ?, ?, ?, ?)',
      [lawyerId, lawyerUsername, passwordHash, 'lawyer', cleanName, contactDetails]
    );

    // Audit log
    logAudit(
      req.user.id,
      req.user.username,
      'create_lawyer',
      'users',
      lawyerId,
      'username,full_name,contact_info,role'
    );

    logActivity(
      req.user.id,
      req.user.username,
      req.user.role,
      'MANUAL_ENTRY_LAWYER',
      `Manual lawyer enrollment for ${cleanName} (${cleanAffiliation}) created by ${req.user.full_name}`,
      req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1',
      req.headers['user-agent'] || 'Unknown',
      'SUCCESS',
      { lawyerId, username: lawyerUsername, affiliation: cleanAffiliation, createdBy: req.user.username }
    );

    res.status(201).json({
      success: true,
      message: `Lawyer ${cleanName} successfully added to the legal aid roster.`,
      lawyer: {
        id: lawyerId,
        username: lawyerUsername,
        full_name: cleanName,
        contact_info: contactDetails,
        role: 'lawyer'
      }
    });
  } catch (err) {
    console.error('[Lawyer Create Error]', err);
    res.status(500).json({ error: `Failed to create lawyer profile: ${err.message}` });
  }
});

// Roster of pending legal aid requests
app.get('/api/legal-aid/queue', authenticateToken, requireRole(['dlsa_officer', 'admin']), (req, res) => {
  try {
    const queue = query(`
      SELECT lar.*, u.first_name, u.last_name, u.prisoner_number, u.primary_charge
      FROM legal_aid_requests lar
      JOIN undertrials u ON lar.undertrial_id = u.id
      WHERE lar.status = 'pending'
      ORDER BY lar.request_date ASC
    `);
    res.json(queue);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch legal aid queue' });
  }
});

// Assign lawyer (Assign lawyer to queue item and create timeline event)
app.post('/api/legal-aid/assign', authenticateToken, requireRole(['dlsa_officer', 'admin']), auditRoute('assign_lawyer', 'legal_aid_requests'), (req, res) => {
  const { requestId, lawyerId } = req.body;

  if (!requestId || !lawyerId) {
    return res.status(400).json({ error: 'requestId and lawyerId are required' });
  }

  try {
    const request = query('SELECT * FROM legal_aid_requests WHERE id = ?', [requestId])[0];
    if (!request) {
      return res.status(404).json({ error: 'Legal aid request not found' });
    }

    const lawyer = query("SELECT * FROM users WHERE id = ? AND role = 'lawyer'", [lawyerId])[0];
    if (!lawyer) {
      return res.status(404).json({ error: 'Lawyer not found' });
    }

    // 1. Update legal aid request status
    run(
      "UPDATE legal_aid_requests SET status = 'assigned', assigned_lawyer_id = ? WHERE id = ?",
      [lawyerId, requestId]
    );

    // 2. Fetch case to add timeline event
    const caseRecord = query('SELECT id FROM cases WHERE undertrial_id = ?', [request.undertrial_id])[0];
    if (caseRecord) {
      run(
        'INSERT INTO case_events (id, case_id, event_type, event_date, status, title, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          uuid(),
          caseRecord.id,
          'legal_aid_assigned',
          new Date().toISOString().split('T')[0],
          'done',
          'Legal Aid Assigned',
          `Advocate ${lawyer.full_name} has been assigned as defense counsel by DLSA.`
        ]
      );
    }

    res.json({ success: true, message: `Lawyer ${lawyer.full_name} successfully assigned.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Assignment transaction failed' });
  }
});

// 6. AI Document Upload & Human-in-the-Loop Confirmation (Module 3)
app.post('/api/documents/summarize', authenticateToken, requireRole(['dlsa_officer', 'lawyer', 'admin']), (req, res) => {
  const { fileName, rawContent, caseId } = req.body;

  if (!fileName || !caseId) {
    return res.status(400).json({ error: 'fileName and caseId are required' });
  }

  try {
    const result = mockSummarizeDocument(fileName, rawContent);
    
    // Save to documents table in unconfirmed status
    const docId = uuid();
    run(
      `INSERT INTO documents (id, case_id, file_name, file_type, uploaded_by, uploaded_at, raw_content, ai_summary, ai_extracted_json, is_confirmed, confirmed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
      [
        docId,
        caseId,
        result.file_name,
        result.file_type,
        req.user.id,
        new Date().toISOString().split('T')[0],
        result.raw_content,
        result.ai_summary,
        result.ai_extracted_json
      ]
    );

    res.json({
      documentId: docId,
      ...result
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process document through AI' });
  }
});

// Human-in-the-loop Confirm Endpoint
app.post('/api/documents/confirm', authenticateToken, requireRole(['dlsa_officer', 'lawyer', 'admin']), auditRoute('confirm_ai_document', 'documents'), (req, res) => {
  const { documentId, confirmedData } = req.body;

  if (!documentId || !confirmedData) {
    return res.status(400).json({ error: 'documentId and confirmedData are required' });
  }

  try {
    const doc = query('SELECT * FROM documents WHERE id = ?', [documentId])[0];
    if (!doc) {
      return res.status(404).json({ error: 'Document record not found' });
    }

    // 1. Mark document as confirmed
    run(
      'UPDATE documents SET is_confirmed = 1, confirmed_by = ?, ai_extracted_json = ?, ai_summary = ? WHERE id = ?',
      [req.user.id, JSON.stringify(confirmedData), confirmedData.summary || doc.ai_summary, documentId]
    );

    // 2. Write confirmed fields back into the authoritative record
    // e.g., Update Case / hearings / events based on the confirmed fields
    const caseRecord = query('SELECT * FROM cases WHERE id = ?', [doc.case_id])[0];
    if (caseRecord) {
      // Update case events with a new order/hearing event from document
      run(
        'INSERT INTO case_events (id, case_id, event_type, event_date, status, title, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          uuid(),
          doc.case_id,
          'court_order',
          new Date().toISOString().split('T')[0],
          'done',
          `AI Document Synced: ${doc.file_type}`,
          `Verified AI OCR Summary: ${confirmedData.summary || doc.ai_summary}`
        ]
      );

      // If document contains a hearing date, schedule it
      if (confirmedData.hearing_date) {
        run(
          'INSERT INTO hearings (id, case_id, hearing_date, purpose, outcome, status) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid(), doc.case_id, confirmedData.hearing_date, `Hearing scheduled from ${doc.file_type}`, '', 'scheduled']
        );
      }

      // If document changes bail status
      if (confirmedData.bail_status) {
        run(
          'UPDATE undertrials SET bail_status = ? WHERE id = ?',
          [confirmedData.bail_status, caseRecord.undertrial_id]
        );
      }
    }

    res.json({ success: true, message: 'AI fields verified and saved to authoritative database.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Transaction confirmation failed' });
  }
});

// 7. Ask NyayaSetu Chatbot (Module 8 & 9)
app.get('/api/chat/history', authenticateToken, requireRole(['prisoner', 'admin']), (req, res) => {
  const userId = req.user.id;
  const limit = parseInt(req.query.limit) || 50;

  try {
    const history = getChatHistory(userId, limit);
    
    // Audit log history access
    logAudit(
      userId,
      req.user.username,
      'view_chat_history',
      'ai_conversations',
      userId,
      'sender,message_text,topic,timestamp'
    );

    res.json(history);
  } catch (err) {
    console.error('[Chat History Error]', err);
    res.status(500).json({ error: 'Failed to retrieve chat history' });
  }
});

app.post('/api/chat', authenticateToken, requireRole(['prisoner', 'admin']), (req, res) => {
  const { query: userQuery, language } = req.body;
  const userId = req.user.id;

  if (!userQuery) {
    return res.status(400).json({ error: 'query parameter is required' });
  }

  try {
    const result = processChatQuery(userId, userQuery, language || 'en');
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Chatbot processing failed' });
  }
});

// 8. Rehabilitation & Voice Check-In (Module 9 & 10)
app.post('/api/rehabilitation/attendance', authenticateToken, auditRoute('rehab_attendance_checkin', 'rehabilitation_attendance'), (req, res) => {
  const { rehabilitationId, undertrialId, date, status, verificationMode, voiceTranscript } = req.body;

  if (!rehabilitationId || !undertrialId || !date || !status) {
    return res.status(400).json({ error: 'Missing required rehabilitation attendance fields' });
  }

  try {
    // If voice checkin, simulate parsing checkin phrase
    let pathLog = null;
    if (verificationMode === 'voice_check_in') {
      pathLog = `audio/voice_logs/checkin_${uuid().substring(0, 8)}.wav`;
      console.log(`[Voice checkin] Saved voice session buffer log to mock path: ${pathLog}`);
    }

    run(
      `INSERT INTO rehabilitation_attendance (id, rehabilitation_id, undertrial_id, date, status, verification_mode, voice_log_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuid(), rehabilitationId, undertrialId, date, status, verificationMode || 'manual', pathLog]
    );

    res.json({ 
      success: true, 
      message: 'Attendance recorded successfully.',
      voice_log_path: pathLog
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to write attendance log' });
  }
});

// Prisoner request log (Module 5 prisoner dashboard)
app.post('/api/prisoner/request', authenticateToken, requireRole(['prisoner', 'admin']), auditRoute('submit_prisoner_request', 'legal_aid_requests'), (req, res) => {
  const { requestType, notes } = req.body;
  const userId = req.user.id;

  if (!requestType || !notes) {
    return res.status(400).json({ error: 'requestType and notes are required' });
  }

  try {
    const prisoner = query('SELECT id FROM undertrials WHERE user_id = ?', [userId])[0];
    if (!prisoner) {
      return res.status(404).json({ error: 'Prisoner profile not found' });
    }

    run(
      "INSERT INTO legal_aid_requests (id, undertrial_id, request_type, request_date, status, assigned_lawyer_id, notes) VALUES (?, ?, ?, ?, 'pending', NULL, ?)",
      [uuid(), prisoner.id, requestType, new Date().toISOString().split('T')[0], notes]
    );

    res.json({ success: true, message: 'Request submitted successfully to DLSA queue.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Request submission failed' });
  }
});

// 9. Security Audit Log Retrieval (Module 11)
app.get('/api/audit/logs', authenticateToken, requireRole(['admin', 'dlsa_officer']), (req, res) => {
  try {
    const logs = query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 100');
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load audit trail' });
  }
});

// 9.1 User Activity History (Tracks what users do during login and session)
app.get('/api/activity/logs', authenticateToken, requireRole(['admin', 'dlsa_officer', 'prison_official']), (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const usernameFilter = req.query.username;
    let logs = [];
    if (usernameFilter) {
      logs = query('SELECT * FROM user_activity_logs WHERE LOWER(username) = ? ORDER BY timestamp DESC LIMIT ?', [usernameFilter.toLowerCase().trim(), limit]);
    } else {
      logs = query('SELECT * FROM user_activity_logs ORDER BY timestamp DESC LIMIT ?', [limit]);
    }
    res.json(logs);
  } catch (err) {
    console.error('[Activity Logs Error]', err);
    res.status(500).json({ error: 'Failed to load user activity logs' });
  }
});

// 9.2 Record Frontend UI Activity (e.g. clicking tabs, viewing cases, switching language)
app.post('/api/activity/log', authenticateToken, (req, res) => {
  const { actionType, actionDetail, metadata, status } = req.body;
  const userId = req.user ? req.user.id : null;
  const username = req.user ? req.user.username : 'anonymous';
  const role = req.user ? req.user.role : null;
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Unknown';

  logActivity(
    userId,
    username,
    role,
    actionType || 'UI_INTERACTION',
    actionDetail || 'User performed in-app interaction',
    ip,
    userAgent,
    status || 'SUCCESS',
    metadata || null
  );

  res.json({ success: true, message: 'Activity logged successfully.' });
});

// 10. Mock eGov Integration boundary (Module 11)
app.get('/api/mock-egov/sync', authenticateToken, requireRole(['prison_official', 'dlsa_officer', 'admin']), (req, res) => {
  const system = req.query.system || 'e-Prisons';
  
  // Simulate network latency (2 seconds)
  setTimeout(() => {
    logAudit(req.user.id, req.user.username, `sync_${system.toLowerCase()}`, 'cases', null, 'eGov Sync Boundary');
    res.json({
      success: true,
      system,
      status: 'Connected',
      last_sync: new Date().toISOString(),
      records_synced: Math.floor(Math.random() * 5) + 1,
      disclaimer: "Simulated e-Prisons/ICJS data for demo purposes — real deployment requires government authorization"
    });
  }, 1000);
});

// Server Listen
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`[Express] NyayaSetu API server running on port ${PORT}`);
});

const crypto = require('crypto');
const { run, query, uuid } = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

async function seed() {
  console.log('[Seeder] Starting database seeding...');

  // 1. Clear Existing Data (Order is important for FKs)
  run('DELETE FROM audit_logs');
  run('DELETE FROM rehabilitation_attendance');
  run('DELETE FROM rehabilitation');
  run('DELETE FROM documents');
  run('DELETE FROM legal_aid_requests');
  run('DELETE FROM hearings');
  run('DELETE FROM case_events');
  run('DELETE FROM cases');
  run('DELETE FROM undertrials');
  run('DELETE FROM users');

  console.log('[Seeder] Cleared previous records.');

  // 2. Insert Users (Staff and Lawyers)
  const users = [
    { id: uuid(), username: 'prison_admin', password: 'password123', role: 'prison_official', name: 'Inspector G. S. Rathore', contact: '9876543210' },
    { id: uuid(), username: 'lawyer_shreya', password: 'password123', role: 'lawyer', name: 'Shreya Bose (DLSA Panel)', contact: '9812345678' },
    { id: uuid(), username: 'lawyer_vivek', password: 'password123', role: 'lawyer', name: 'Vivek Verma (Private Counsel)', contact: '9823456789' },
    { id: uuid(), username: 'dlsa_rahul', password: 'password123', role: 'dlsa_officer', name: 'Rahul Deshmukh (Secretary, DLSA)', contact: '9834567890' },
    { id: uuid(), username: 'admin_root', password: 'password123', role: 'admin', name: 'NyayaSetu System Admin', contact: 'admin@nyayasetu.gov.in' },
    { id: uuid(), username: 'jatin', password: 'password', role: 'admin', name: 'Jatin (System Admin)', contact: 'jatin@nyayasetu.gov.in' }
  ];

  for (const u of users) {
    run(
      'INSERT INTO users (id, username, password_hash, role, full_name, contact_info) VALUES (?, ?, ?, ?, ?, ?)',
      [u.id, u.username, hashPassword(u.password), u.role, u.name, u.contact]
    );
  }
  console.log('[Seeder] Seeded staff & lawyer users.');

  // Get lawyer IDs for referencing
  const lawyerShreyaId = users.find(u => u.username === 'lawyer_shreya').id;
  const lawyerVivekId = users.find(u => u.username === 'lawyer_vivek').id;

  // 3. Define Undertrials and Cases
  // Seed profiles capturing various delay alerts
  const undertrialProfiles = [
    {
      id: uuid(),
      first_name: 'Rajesh',
      last_name: 'Kumar',
      dob: '1995-04-12',
      gender: 'Male',
      arrest_date: '2026-08-07', // 10 days ago
      remand_date: '2026-08-08', // 9 days ago
      charge: 'Theft (BNS Section 303)',
      sections: 'BNS Sec 303',
      facility: 'Tihar Jail No. 4',
      bail_status: 'not_applied',
      bail_amount: 0,
      case: {
        id: uuid(),
        case_no: 'CNR-DLHC-004561-2026',
        court: 'Patiala House Court, Delhi',
        judge: 'Dr. Archana Sen, Metropolitan Magistrate',
        events: [
          { type: 'arrest', date: '2026-08-07', status: 'done', title: 'Arrest', desc: 'Arrested from New Delhi Railway Station by Police' },
          { type: 'remand', date: '2026-08-08', status: 'done', title: 'First Remand Order', desc: 'Produced before Magistrate. Remanded to 14 days judicial custody.' }
        ],
        hearings: [],
        legal_aid: {
          id: uuid(),
          type: 'lawyer_assignment',
          date: '2026-08-09',
          status: 'pending', // No lawyer assigned -> triggers "No lawyer assigned 7+ days after remand"
          notes: 'Prisoner requested legal assistance during intake.'
        }
      }
    },
    {
      id: uuid(),
      first_name: 'Amit',
      last_name: 'Sharma',
      dob: '1991-09-25',
      gender: 'Male',
      arrest_date: '2026-06-10',
      remand_date: '2026-06-11',
      charge: 'Cheating (BNS Section 318)',
      sections: 'BNS Sec 318',
      facility: 'Tihar Jail No. 3',
      bail_status: 'pending',
      bail_amount: 15000,
      case: {
        id: uuid(),
        case_no: 'CNR-DLHC-003290-2026',
        court: 'Saket District Court, Delhi',
        judge: 'Sh. Vinay Gupta, Additional Sessions Judge',
        events: [
          { type: 'arrest', date: '2026-06-10', status: 'done', title: 'Arrest', desc: 'Apprehended by Cyber Cell' },
          { type: 'remand', date: '2026-06-11', status: 'done', title: 'Remand Order', desc: 'Sent to Judicial Custody' },
          { type: 'legal_aid_assigned', date: '2026-06-15', status: 'done', title: 'Legal Aid Assigned', desc: 'DLSA appointed Advocate Shreya Bose' },
          { type: 'bail_applied', date: '2026-07-05', status: 'pending', title: 'Bail Petition Filed', desc: 'Bail application filed by Adv. Shreya. Status is pending for over 30 days.' } // Triggers "Bail application pending review 30+ days"
        ],
        hearings: [
          { id: uuid(), date: '2026-07-05', purpose: 'Bail Hearing', outcome: 'Adjourned for police reply', status: 'completed' },
          { id: uuid(), date: '2026-08-25', purpose: 'Arguments on Bail', outcome: '', status: 'scheduled' }
        ],
        legal_aid: {
          id: uuid(),
          type: 'lawyer_assignment',
          date: '2026-06-12',
          status: 'assigned',
          lawyer_id: lawyerShreyaId,
          notes: 'Advocate Shreya Bose assigned from the panel.'
        }
      }
    },
    {
      id: uuid(),
      first_name: 'Sunita',
      last_name: 'Devi',
      dob: '1983-02-14',
      gender: 'Female',
      arrest_date: '2024-05-15', // Arrested over 2 years ago
      remand_date: '2024-05-16',
      charge: 'House-trespass (BNS Section 329)', // Max sentence is 1 year
      sections: 'BNS Sec 329',
      facility: 'Tihar Jail No. 6 (Women)',
      bail_status: 'unable_to_pay', // Triggers BNSS Section 479 alert (exceeded max detention thresholds)
      bail_amount: 5000,
      case: {
        id: uuid(),
        case_no: 'CNR-DLHC-001044-2024',
        court: 'Rohini District Court, Delhi',
        judge: 'Ms. Deepika Malik, MM-02 (Mahila Court)',
        events: [
          { type: 'arrest', date: '2024-05-15', status: 'done', title: 'Arrest', desc: 'Arrested by Rohini Police' },
          { type: 'remand', date: '2024-05-16', status: 'done', title: 'Remand Order', desc: 'Commited to judicial custody' },
          { type: 'legal_aid_assigned', date: '2024-05-18', status: 'done', title: 'Advocate Assigned', desc: 'Panel Lawyer Shreya Bose appointed' },
          { type: 'bail_applied', date: '2024-06-20', status: 'done', title: 'Bail Granted', desc: 'Bail granted on surety of Rs. 5000, but undertrial is indigent and unable to pay.' }
        ],
        hearings: [
          { id: uuid(), date: '2024-08-10', purpose: 'Framing of Charges', outcome: 'Charges framed', status: 'completed' },
          { id: uuid(), date: '2025-02-15', purpose: 'Prosecution Evidence', outcome: 'Witness 1 examined', status: 'completed' }
        ],
        legal_aid: {
          id: uuid(),
          type: 'lawyer_assignment',
          date: '2024-05-17',
          status: 'assigned',
          lawyer_id: lawyerShreyaId,
          notes: 'Indigent case. Help needed with surety bond release.'
        }
      }
    },
    {
      id: uuid(),
      first_name: 'Vikram',
      last_name: 'Singh',
      dob: '1979-11-03',
      gender: 'Male',
      arrest_date: '2025-12-01',
      remand_date: '2025-12-02',
      charge: 'Criminal Breach of Trust (BNS Section 316)',
      sections: 'BNS Sec 316',
      facility: 'Tihar Jail No. 1',
      bail_status: 'rejected',
      bail_amount: 0,
      case: {
        id: uuid(),
        case_no: 'CNR-DLHC-008742-2025',
        court: 'Dwarka District Court, Delhi',
        judge: 'Sh. S. K. Mahajan, Metropolitan Magistrate',
        events: [
          { type: 'arrest', date: '2025-12-01', status: 'done', title: 'Arrest', desc: 'Arrested at residence' },
          { type: 'remand', date: '2025-12-02', status: 'done', title: 'Remand Order', desc: 'Judicial Custody remand' },
          { type: 'legal_aid_assigned', date: '2025-12-05', status: 'done', title: 'Advocate Assigned', desc: 'Advocate Vivek Verma appointed' }
        ],
        hearings: [
          { id: uuid(), date: '2026-03-10', purpose: 'Charge Arguments', outcome: 'Adjourned', status: 'completed' },
          { id: uuid(), date: '2026-05-20', purpose: 'Next Hearing', outcome: 'No hearing scheduled since this date (70+ days)', status: 'completed' } // Triggers "No hearing scheduled in 60+ days"
        ],
        legal_aid: {
          id: uuid(),
          type: 'lawyer_assignment',
          date: '2025-12-03',
          status: 'assigned',
          lawyer_id: lawyerVivekId,
          notes: 'Assigned as legal aid representative.'
        }
      }
    },
    {
      id: uuid(),
      first_name: 'Mohammed',
      last_name: 'Ali',
      dob: '2001-07-15',
      gender: 'Male',
      arrest_date: '2026-04-20',
      remand_date: '2026-04-21',
      charge: 'Receiving Stolen Property (BNS Section 317)',
      sections: 'BNS Sec 317',
      facility: 'Tihar Jail No. 4',
      bail_status: 'granted',
      bail_amount: 10000,
      case: {
        id: uuid(),
        case_no: 'CNR-DLHC-001278-2026',
        court: 'Patiala House Court, Delhi',
        judge: 'Dr. Archana Sen, Metropolitan Magistrate',
        events: [
          { type: 'arrest', date: '2026-04-20', status: 'done', title: 'Arrest', desc: 'Apprehended with items' },
          { type: 'remand', date: '2026-04-21', status: 'done', title: 'Remand Order', desc: 'Commited to judicial custody' },
          { type: 'legal_aid_assigned', date: '2026-04-25', status: 'done', title: 'Lawyer Appointed', desc: 'Advocate Vivek Verma' },
          { type: 'bail_applied', date: '2026-05-10', status: 'done', title: 'Bail Hearing', desc: 'Bail petition argued' },
          { type: 'court_order', date: '2026-05-15', status: 'done', title: 'Bail Order Issued', desc: 'Bail granted. Security processing underway.' }
        ],
        hearings: [
          { id: uuid(), date: '2026-05-10', purpose: 'Bail Arguments', outcome: 'Bail granted', status: 'completed' },
          { id: uuid(), date: '2026-08-30', purpose: 'Trial Hearing', outcome: '', status: 'scheduled' }
        ],
        legal_aid: {
          id: uuid(),
          type: 'lawyer_assignment',
          date: '2026-04-23',
          status: 'assigned',
          lawyer_id: lawyerVivekId,
          notes: 'Advocate Vivek Verma representing client.'
        }
      }
    }
  ];

  // 4. Create Prisoner Logins and Insert into DB
  for (const p of undertrialProfiles) {
    const pUsername = `${p.first_name.toLowerCase()}_${p.last_name.toLowerCase()}`;
    const pUserId = uuid();

    // Insert user record for the prisoner
    run(
      'INSERT INTO users (id, username, password_hash, role, full_name, contact_info) VALUES (?, ?, ?, ?, ?, ?)',
      [pUserId, pUsername, hashPassword('prisoner123'), 'prisoner', `${p.first_name} ${p.last_name}`, 'Prison Internal Terminal']
    );

    // Insert family member user record
    const fUsername = `${p.first_name.toLowerCase()}_family`;
    const fUserId = uuid();
    run(
      'INSERT INTO users (id, username, password_hash, role, full_name, contact_info) VALUES (?, ?, ?, ?, ?, ?)',
      [fUserId, fUsername, hashPassword('family123'), 'family_member', `${p.first_name}'s Family Contact`, '9988776655']
    );

    // Insert undertrial record
    run(
      'INSERT INTO undertrials (id, user_id, prisoner_number, first_name, last_name, date_of_birth, gender, date_of_arrest, remand_date, primary_charge, sections, detention_facility, bail_status, bail_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        p.id,
        pUserId,
        `UT-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        p.first_name,
        p.last_name,
        p.dob,
        p.gender,
        p.arrest_date,
        p.remand_date,
        p.charge,
        p.sections,
        p.facility,
        p.bail_status,
        p.bail_amount
      ]
    );

    // Insert case record
    run(
      'INSERT INTO cases (id, undertrial_id, case_number, court_name, judge_name, status) VALUES (?, ?, ?, ?, ?, ?)',
      [p.case.id, p.id, p.case.case_no, p.case.court, p.case.judge, 'active']
    );

    // Insert case events
    for (const ev of p.case.events) {
      run(
        'INSERT INTO case_events (id, case_id, event_type, event_date, status, title, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), p.case.id, ev.type, ev.date, ev.status, ev.title, ev.desc]
      );
    }

    // Insert hearings
    for (const h of p.case.hearings) {
      run(
        'INSERT INTO hearings (id, case_id, hearing_date, purpose, outcome, status) VALUES (?, ?, ?, ?, ?, ?)',
        [h.id, p.case.id, h.date, h.purpose, h.outcome, h.status]
      );
    }

    // Insert legal aid request
    const req = p.case.legal_aid;
    run(
      'INSERT INTO legal_aid_requests (id, undertrial_id, request_type, request_date, status, assigned_lawyer_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.id, p.id, req.type, req.date, req.status, req.lawyer_id || null, req.notes]
    );

    // 5. Seed Rehabilitation programs and attendance records (Module 10)
    if (p.first_name === 'Mohammed' || p.first_name === 'Amit') {
      const rehabId = uuid();
      run(
        'INSERT INTO rehabilitation (id, undertrial_id, program_name, trainer_name, status) VALUES (?, ?, ?, ?, ?)',
        [rehabId, p.id, 'Vocational Carpentry & Woodworking', 'Master Trainer Devraj Singh', 'enrolled']
      );

      // Attendance records
      run(
        'INSERT INTO rehabilitation_attendance (id, rehabilitation_id, undertrial_id, date, status, verification_mode, voice_log_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), rehabId, p.id, '2026-08-15', 'present', 'manual', null]
      );
      run(
        'INSERT INTO rehabilitation_attendance (id, rehabilitation_id, undertrial_id, date, status, verification_mode, voice_log_path) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), rehabId, p.id, '2026-08-16', 'present', 'voice_check_in', 'audio/voice_logs/checkin_0816.wav']
      );
    }
  }

  // 6. Seed mock documents for AI extraction demo (Module 3)
  const amitCaseId = query("SELECT cases.id FROM cases JOIN undertrials ON cases.undertrial_id = undertrials.id WHERE undertrials.first_name = 'Amit'")[0].id;
  const adminId = users.find(u => u.username === 'admin_root').id;

  run(
    'INSERT INTO documents (id, case_id, file_name, file_type, uploaded_by, uploaded_at, raw_content, ai_summary, ai_extracted_json, is_confirmed, confirmed_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      uuid(),
      amitCaseId,
      'remand_order_amit.pdf',
      'Remand Order',
      adminId,
      '2026-06-11',
      `IN THE COURT OF METROPOLITAN MAGISTRATE, SAKET, NEW DELHI
       State vs. Amit Sharma
       FIR No. 120/2026, P.S. Cyber Cell
       U/S 318 BNS (Cheating)
       
       ORDER OF REMAND
       Accused Amit Sharma produced from custody. Investigating Officer submits that 14 days of judicial remand is necessary for verification of records.
       Accused requests legal aid representation.
       Ordered accordingly. Remanded to judicial custody till 2026-06-25.
       Next Hearing: 2026-06-25.
       Date: 2026-06-11.`,
      'The accused Amit Sharma was remanded to 14 days judicial custody by Saket District Court until June 25, 2026. The Court noted the request for legal-aid assistance.',
      JSON.stringify({
        case_number: 'FIR-120/2026',
        court_name: 'Saket District Court, Delhi',
        sections: 'BNS Section 318',
        bail_status: 'pending',
        hearing_date: '2026-06-25'
      }),
      0, // Unconfirmed (shows human-in-the-loop verify screen)
      null
    ]
  );

  console.log('[Seeder] Database seeding completed successfully.');
}

// If run directly
if (require.main === module) {
  seed();
}

module.exports = seed;

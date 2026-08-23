const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

// Ensure database file location
const dbPath = path.join(__dirname, 'nyayasetu.db');
const db = new DatabaseSync(dbPath);

console.log(`[Database] Connected to SQLite database at: ${dbPath}`);

// Create Tables Schema
function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      full_name TEXT NOT NULL,
      contact_info TEXT
    );

    CREATE TABLE IF NOT EXISTS undertrials (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      prisoner_number TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      gender TEXT NOT NULL,
      date_of_arrest TEXT NOT NULL,
      remand_date TEXT NOT NULL,
      primary_charge TEXT NOT NULL,
      sections TEXT NOT NULL,
      detention_facility TEXT NOT NULL,
      bail_status TEXT NOT NULL, -- 'not_applied', 'pending', 'granted', 'rejected', 'unable_to_pay'
      bail_amount INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      undertrial_id TEXT NOT NULL,
      case_number TEXT UNIQUE NOT NULL,
      court_name TEXT NOT NULL,
      judge_name TEXT NOT NULL,
      status TEXT NOT NULL, -- 'active', 'disposed'
      FOREIGN KEY(undertrial_id) REFERENCES undertrials(id)
    );

    CREATE TABLE IF NOT EXISTS case_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      event_type TEXT NOT NULL, -- 'arrest', 'remand', 'legal_aid_assigned', 'bail_applied', 'hearing_held', 'court_order', 'utrc_review', 'released'
      event_date TEXT NOT NULL,
      status TEXT NOT NULL, -- 'done', 'in_progress', 'pending', 'overdue'
      title TEXT NOT NULL,
      description TEXT,
      FOREIGN KEY(case_id) REFERENCES cases(id)
    );

    CREATE TABLE IF NOT EXISTS hearings (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      hearing_date TEXT NOT NULL,
      purpose TEXT NOT NULL,
      outcome TEXT,
      status TEXT NOT NULL, -- 'scheduled', 'completed', 'postponed'
      FOREIGN KEY(case_id) REFERENCES cases(id)
    );

    CREATE TABLE IF NOT EXISTS legal_aid_requests (
      id TEXT PRIMARY KEY,
      undertrial_id TEXT NOT NULL,
      request_type TEXT NOT NULL, -- 'lawyer_assignment', 'case_update_request', 'lawyer_visit'
      request_date TEXT NOT NULL,
      status TEXT NOT NULL, -- 'pending', 'assigned', 'rejected'
      assigned_lawyer_id TEXT,
      notes TEXT,
      FOREIGN KEY(undertrial_id) REFERENCES undertrials(id),
      FOREIGN KEY(assigned_lawyer_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,
      raw_content TEXT,
      ai_summary TEXT,
      ai_extracted_json TEXT, -- Store JSON string of extracted fields
      is_confirmed INTEGER DEFAULT 0, -- 0 = Unconfirmed, 1 = Confirmed by human
      confirmed_by TEXT,
      FOREIGN KEY(case_id) REFERENCES cases(id),
      FOREIGN KEY(uploaded_by) REFERENCES users(id),
      FOREIGN KEY(confirmed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS rehabilitation (
      id TEXT PRIMARY KEY,
      undertrial_id TEXT NOT NULL,
      program_name TEXT NOT NULL,
      trainer_name TEXT NOT NULL,
      status TEXT NOT NULL, -- 'enrolled', 'completed'
      FOREIGN KEY(undertrial_id) REFERENCES undertrials(id)
    );

    CREATE TABLE IF NOT EXISTS rehabilitation_attendance (
      id TEXT PRIMARY KEY,
      rehabilitation_id TEXT NOT NULL,
      undertrial_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL, -- 'present', 'absent'
      verification_mode TEXT NOT NULL, -- 'manual', 'voice_check_in'
      voice_log_path TEXT,
      FOREIGN KEY(rehabilitation_id) REFERENCES rehabilitation(id),
      FOREIGN KEY(undertrial_id) REFERENCES undertrials(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      action TEXT NOT NULL,
      target_table TEXT,
      record_id TEXT,
      accessed_fields TEXT,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_activity_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT NOT NULL,
      role TEXT,
      action_type TEXT NOT NULL, -- 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'REGISTER', 'LOGOUT', 'API_REQUEST', 'VIEW_PAGE', 'VOICE_CHECKIN', 'CHAT_QUERY'
      action_detail TEXT,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT, -- 'SUCCESS', 'FAILED', 'INFO'
      metadata TEXT, -- JSON string
      timestamp TEXT NOT NULL
    );
  `);
  console.log('[Database] Database tables initialized successfully.');
}

// Initialize tables
initDb();

// Helper to generate UUIDs locally (fallback if crypto.randomUUID isn't available, but it is in modern Node)
const { randomUUID } = require('crypto');

module.exports = {
  db,
  query: (sql, params = []) => {
    try {
      const stmt = db.prepare(sql);
      return stmt.all(...params);
    } catch (err) {
      console.error(`[Database Error] SQL: ${sql}`, err);
      throw err;
    }
  },
  run: (sql, params = []) => {
    try {
      const stmt = db.prepare(sql);
      return stmt.run(...params);
    } catch (err) {
      console.error(`[Database Error] SQL: ${sql}`, err);
      throw err;
    }
  },
  uuid: () => randomUUID()
};

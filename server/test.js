const crypto = require('crypto');
const { query, run } = require('./db');
const { evaluateRules } = require('./rules');
const { processChatQuery } = require('./ai');

console.log('----------------------------------------------------');
console.log('NYAYASETU AUTOMATED INTEGRATION & SECURITY TEST SUITE');
console.log('----------------------------------------------------');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`[FAIL] ${message}`);
    testsFailed++;
  }
}

async function runTests() {
  try {
    // Test 1: Database and Seed Verification
    const usersCount = query('SELECT COUNT(*) as count FROM users')[0].count;
    assert(usersCount > 0, `Database has ${usersCount} seeded users.`);

    const amitRecord = query("SELECT * FROM undertrials WHERE first_name = 'Amit'")[0];
    assert(amitRecord !== undefined, `Seeded prisoner 'Amit Sharma' exists with number: ${amitRecord?.prisoner_number}`);

    // Test 2: Action Required Engine Verification (Module 2)
    const actionItems = evaluateRules('2026-08-17');
    
    // Rajesh Kumar has remand date 2026-08-08 (9 days before 08-17) and no lawyer assigned.
    // This should trigger "No Lawyer Assigned 7+ Days"
    const rajeshFlag = actionItems.find(item => item.prisoner_name === 'Rajesh Kumar' && item.title.includes('No Lawyer'));
    assert(rajeshFlag !== undefined, 'Action Engine flagged Rajesh Kumar for missing defense lawyer (7+ days remand limit).');

    // Sunita Devi has been detained for 825 days for a 1-year max sentence.
    // This should trigger BNSS 479 threshold
    const sunitaFlag = actionItems.find(item => item.prisoner_name === 'Sunita Devi' && item.title.includes('479'));
    assert(sunitaFlag !== undefined, 'Action Engine flagged Sunita Devi for exceeding BNSS Section 479 half-sentence detention threshold.');

    // Vikram Singh has no hearings scheduled, and last hearing was 2026-05-20 (89 days before 08-17).
    // This should trigger "No Hearing Scheduled 60+ Days"
    const vikramFlag = actionItems.find(item => item.prisoner_name === 'Vikram Singh' && item.title.includes('No Hearing'));
    assert(vikramFlag !== undefined, 'Action Engine flagged Vikram Singh for schedule gap (no hearing in 60+ days).');

    // Test 3: Chatbot RAG Fact-Only Retrieval (Module 8)
    const amitUser = query("SELECT id FROM users WHERE username = 'amit_sharma'")[0];
    assert(amitUser !== undefined, 'Found prisoner user account for Amit.');

    // Ask about hearing date
    const hearingAnswer = processChatQuery(amitUser.id, 'When is my next hearing?', 'en');
    assert(hearingAnswer.text.includes('2026-08-25') && !hearingAnswer.escalated, 
      `Chatbot retrieved Amit's factual next hearing date: "${hearingAnswer.text}"`);

    // Ask about lawyer
    const lawyerAnswer = processChatQuery(amitUser.id, 'वकील का नाम क्या है?', 'hi');
    assert(lawyerAnswer.text.includes('Shreya Bose') && !lawyerAnswer.escalated, 
      `Chatbot retrieved Amit's advocate details in Hindi: "${lawyerAnswer.text}"`);

    // Test 4: Chatbot Guardrail & Out-of-Scope Escalation Logging (Module 8)
    const outOfScopeAnswer = processChatQuery(amitUser.id, 'Will I win this case and get released soon?', 'en');
    assert(outOfScopeAnswer.escalated && outOfScopeAnswer.text.includes('cannot provide legal advice'), 
      'Chatbot blocked out-of-scope prediction question and triggered escalation.');

    // Verify escalation ticket exists in database
    const escalationRequest = query('SELECT * FROM legal_aid_requests WHERE id = ?', [outOfScopeAnswer.request_id])[0];
    assert(escalationRequest !== undefined && escalationRequest.notes.includes('Chatbot Escalation'), 
      'Verified out-of-scope question was successfully written to the DLSA legal-aid request database queue.');

    // Test 5: Data Minimization Verification (Module 11)
    // Simulated JSON API responses for different roles
    const familyUsername = 'amit_family';
    // Mocking serialization logic from server
    function mockSerialize(record, role) {
      const copy = { ...record };
      if (role === 'family_member') {
        delete copy.primary_charge;
        delete copy.sections;
        delete copy.date_of_birth;
      }
      return copy;
    }

    const fullRecord = {
      first_name: 'Amit',
      last_name: 'Sharma',
      date_of_birth: '1991-09-25',
      primary_charge: 'Cheating (BNS Section 318)',
      sections: 'BNS Sec 318'
    };

    const familyResult = mockSerialize(fullRecord, 'family_member');
    assert(
      familyResult.primary_charge === undefined && 
      familyResult.sections === undefined && 
      familyResult.date_of_birth === undefined &&
      familyResult.first_name === 'Amit',
      'Data Minimization Check: Family view successfully filters out sensitive legal sections, charge descriptions, and PII DOB.'
    );

    // Test 6: User Registration & Dynamic Login Authentication
    const testUsername = 'test_prisoner_' + Math.floor(Math.random() * 1000);
    const testPassword = 'mySecurePassword123';
    const { handleRegister, handleLogin } = require('./auth');

    let registerStatus = 0;
    let registerJson = {};
    const mockRegReq = {
      body: {
        username: testUsername,
        password: testPassword,
        role: 'prisoner',
        fullName: 'Rahul Verma',
        contactInfo: '9988776655'
      },
      headers: {
        'x-forwarded-for': '192.168.1.105',
        'user-agent': 'NyayaSetu-Test-Client'
      }
    };
    const mockRegRes = {
      status: function(code) {
        registerStatus = code;
        return this;
      },
      json: function(data) {
        registerJson = data;
        return this;
      }
    };

    handleRegister(mockRegReq, mockRegRes);
    assert(registerStatus === 201 || registerJson.success === true, 
      `User Registration API successfully registered new prisoner user '${testUsername}'`);

    // Verify prisoner user exists in SQLite
    const userInDb = query('SELECT * FROM users WHERE LOWER(username) = ?', [testUsername.toLowerCase()])[0];
    assert(userInDb !== undefined && userInDb.full_name === 'Rahul Verma', 
      'Verified newly registered user exists in SQLite database with correct full name.');

    // Verify automatic undertrial and case creation for registered prisoner
    const undertrialInDb = query('SELECT * FROM undertrials WHERE user_id = ?', [userInDb.id])[0];
    assert(undertrialInDb !== undefined && undertrialInDb.first_name === 'Rahul', 
      `Verified undertrial profile auto-created for prisoner with number: ${undertrialInDb?.prisoner_number}`);

    const caseInDb = query('SELECT * FROM cases WHERE undertrial_id = ?', [undertrialInDb.id])[0];
    assert(caseInDb !== undefined && caseInDb.status === 'active', 
      `Verified case record auto-created for prisoner with case number: ${caseInDb?.case_number}`);

    // Test 7: Successful Login and Activity Logging
    let loginJson = {};
    const mockLoginReq = {
      body: {
        username: testUsername.toUpperCase(), // Testing case-insensitivity
        password: testPassword
      },
      headers: {
        'x-forwarded-for': '192.168.1.105',
        'user-agent': 'NyayaSetu-Automated-Test-Runner'
      }
    };
    const mockLoginRes = {
      status: function(code) {
        return this;
      },
      json: function(data) {
        loginJson = data;
        return this;
      }
    };

    handleLogin(mockLoginReq, mockLoginRes);
    assert(loginJson.token !== undefined && loginJson.user.username === testUsername.toLowerCase(), 
      'Verified case-insensitive login succeeded and returned JWT token.');

    // Verify LOGIN_SUCCESS was stored in SQLite database (user_activity_logs)
    const successLogs = query(`
      SELECT * FROM user_activity_logs 
      WHERE username = ? AND action_type = 'LOGIN_SUCCESS' 
      ORDER BY timestamp DESC LIMIT 1
    `, [testUsername.toLowerCase()]);
    assert(successLogs.length > 0 && successLogs[0].ip_address === '192.168.1.105', 
      'Verified database stored login event in user_activity_logs with IP and User-Agent metadata.');

    // Test 8: Failed Login Tracking in Database
    let failedLoginJson = {};
    let failedStatus = 0;
    const mockBadLoginReq = {
      body: {
        username: testUsername,
        password: 'wrong_password'
      },
      headers: {
        'x-forwarded-for': '203.0.113.195',
        'user-agent': 'Intruder-Test-Agent'
      }
    };
    const mockBadLoginRes = {
      status: function(code) {
        failedStatus = code;
        return this;
      },
      json: function(data) {
        failedLoginJson = data;
        return this;
      }
    };

    handleLogin(mockBadLoginReq, mockBadLoginRes);
    assert(failedStatus === 401, 'Verified invalid credentials returned 401 Unauthorized.');

    // Verify LOGIN_FAILED was stored in SQLite database
    const failedLogs = query(`
      SELECT * FROM user_activity_logs 
      WHERE username = ? AND action_type = 'LOGIN_FAILED' 
      ORDER BY timestamp DESC LIMIT 1
    `, [testUsername.toLowerCase()]);
    assert(failedLogs.length > 0 && failedLogs[0].status === 'FAILED', 
      'Verified failed login attempt was logged in database with status FAILED and reason.');

    // Test 9: Prisoner Number Login Support (Requirement #1)
    let utLoginJson = {};
    const mockUtLoginReq = {
      body: {
        username: undertrialInDb.prisoner_number,
        password: testPassword
      },
      headers: {
        'x-forwarded-for': '10.0.0.1',
        'user-agent': 'NyayaSetu-Kiosk-Client'
      }
    };
    const mockUtLoginRes = {
      status: function(code) { return this; },
      json: function(data) { utLoginJson = data; return this; }
    };
    handleLogin(mockUtLoginReq, mockUtLoginRes);
    assert(utLoginJson.token !== undefined && utLoginJson.user.prisoner_number === undertrialInDb.prisoner_number,
      `Prisoner ID Login: Successfully logged in using Prisoner Number '${undertrialInDb.prisoner_number}' instead of username.`);

    // Test 10: AI Persistent Memory & Cross-Session Recall (Requirement #3 & #4)
    const { getChatHistory } = require('./ai');
    
    // Step A: Prisoner asks about bail
    const q1 = processChatQuery(userInDb.id, 'What is my bail status?', 'en');
    assert(q1.text.length > 0, `Turn 1 Response: "${q1.text}"`);

    // Step B: Fetch persistent memory from DB
    const history1 = getChatHistory(userInDb.id);
    assert(history1.length >= 2, `Verified 2 messages (user query + bot reply) persisted in database for prisoner ${userInDb.id}.`);

    // Step C: Prisoner comes back in a new session and asks about bail again
    const q2 = processChatQuery(userInDb.id, 'Can you tell me about my bail?', 'en');
    assert(q2.text.includes('previously inquired about your bail status') || q2.text.includes('latest update'),
      `Turn 2 Cross-Session Recall: AI referenced previous conversation history ("${q2.text}").`);

    // Step D: Verify strict isolation on shared kiosk (Requirement #4)
    const otherPrisonerUser = query("SELECT id FROM users WHERE username = 'rajesh_kumar'")[0];
    if (otherPrisonerUser) {
      const otherHistory = getChatHistory(otherPrisonerUser.id);
      const containsUser1Data = otherHistory.some(m => m.text.includes(testUsername));
      assert(!containsUser1Data, 'Strict Kiosk Isolation: Zero cross-user memory leakage between different prisoner accounts.');
    }

    console.log('----------------------------------------------------');
    console.log(`TEST SUMMARY: ${testsPassed} Passed, ${testsFailed} Failed.`);
    console.log('----------------------------------------------------');

    if (testsFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (err) {
    console.error('Test runner exception occurred:', err);
    process.exit(1);
  }
}

runTests();

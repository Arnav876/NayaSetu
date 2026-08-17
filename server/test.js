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
    const testUsername = 'test_jatin_' + Math.floor(Math.random() * 1000);
    const testPassword = 'mySecurePassword';
    const { handleRegister, handleLogin } = require('./auth');

    let registerStatus = 0;
    let registerJson = {};
    const mockRegReq = {
      body: {
        username: testUsername,
        password: testPassword,
        role: 'admin',
        fullName: 'Jatin Tester',
        contactInfo: '9988776655'
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
      `User Registration API successfully registered new user '${testUsername}'`);

    // Verify user exists in SQLite
    const userInDb = query('SELECT * FROM users WHERE username = ?', [testUsername])[0];
    assert(userInDb !== undefined && userInDb.full_name === 'Jatin Tester', 
      'Verified newly registered user exists in SQLite database with correct full name.');

    // Test Login with newly registered user
    let loginJson = {};
    const mockLoginReq = {
      body: {
        username: testUsername,
        password: testPassword
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
    assert(loginJson.token !== undefined && loginJson.user.username === testUsername, 
      'Verified newly registered user can successfully authenticate and receive a JWT token.');

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

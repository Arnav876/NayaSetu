const { query, run, uuid } = require('./db');

// Mock Document Summarization (Module 3)
function mockSummarizeDocument(fileName, rawText) {
  // Simple extraction based on keywords in the raw text
  let case_number = 'FIR-UNKNOWN';
  let court_name = 'Metropolitan Sessions Court';
  let sections = 'BNS Section 303';
  let bail_status = 'pending';
  let hearing_date = '2026-09-10';
  let summary = 'A legal document regarding the undertrial case.';

  const text = rawText || '';

  if (text.includes('Saket') || fileName.includes('amit')) {
    case_number = 'FIR-120/2026';
    court_name = 'Saket District Court, Delhi';
    sections = 'BNS Section 318';
    bail_status = 'pending';
    hearing_date = '2026-06-25';
    summary = 'The accused Amit Sharma was remanded to 14 days judicial custody by Saket District Court. The court noted the requirement for legal aid.';
  } else if (text.includes('Rohini') || fileName.includes('sunita')) {
    case_number = 'FIR-88/2024';
    court_name = 'Rohini District Court, Delhi';
    sections = 'BNS Section 329';
    bail_status = 'granted';
    hearing_date = '2024-08-10';
    summary = 'Bail granted on surety of Rs. 5,000 for Sunita Devi. The accused has remained in custody due to indigency.';
  } else if (text.includes('Dwarka') || fileName.includes('vikram')) {
    case_number = 'FIR-402/2025';
    court_name = 'Dwarka District Court, Delhi';
    sections = 'BNS Section 316';
    bail_status = 'rejected';
    hearing_date = '2026-03-10';
    summary = 'Remand and charge sheets filed. Bail petition was rejected due to risk of witness tampering.';
  }

  return {
    file_name: fileName,
    file_type: fileName.includes('bail') ? 'Bail Petition' : fileName.includes('remand') ? 'Remand Order' : 'Charge Sheet',
    raw_content: rawText || 'Simulated scanned legal document.',
    ai_summary: summary,
    ai_extracted_json: JSON.stringify({
      case_number,
      court_name,
      sections,
      bail_status,
      hearing_date
    })
  };
}

// Scoped Chatbot Q&A Engine with Persistent Memory (Module 8 & 9)
function processChatQuery(userId, userQuery, language = 'en') {
  // 1. Audit Log the access attempt
  const timestamp = new Date().toISOString();
  
  // Find the undertrial associated with the prisoner userId
  const prisoner = query(`
    SELECT u.*, c.id AS case_id, c.case_number, c.court_name, c.judge_name
    FROM undertrials u
    JOIN cases c ON c.undertrial_id = u.id
    WHERE u.user_id = ?
  `, [userId])[0];

  if (!prisoner) {
    return {
      text: language === 'hi' 
        ? "मुझे आपका बंदी रिकॉर्ड नहीं मिला। कृपया जेल अधिकारी से संपर्क करें।" 
        : "I could not find your undertrial record. Please contact the prison official.",
      escalated: false
    };
  }

  // Retrieve past conversation memory strictly isolated for this specific prisoner
  const pastConversations = query(`
    SELECT sender, message_text, topic, timestamp 
    FROM ai_conversations 
    WHERE user_id = ? 
    ORDER BY timestamp DESC LIMIT 10
  `, [userId]);

  const pastUserQuestions = pastConversations.filter(c => c.sender === 'user');
  const hasPastHistory = pastUserQuestions.length > 0;
  const lastUserQuestion = pastUserQuestions[0];

  // Log the chatbot request to audit logs
  run(
    'INSERT INTO audit_logs (id, user_id, username, action, target_table, record_id, accessed_fields, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      uuid(),
      userId,
      `${prisoner.first_name}_${prisoner.last_name}`,
      'chatbot_query',
      'undertrials',
      prisoner.id,
      'first_name,last_name,bail_status,hearings,ai_conversations',
      timestamp
    ]
  );

  const queryLower = userQuery.toLowerCase().trim();

  // 2. Guardrails Check: Check for out-of-scope / legal strategy / outcome prediction
  const outOfScopeKeywords = [
    'win', 'guilty', 'innocent', 'chance', 'outcome', 'predict', 'opinion', 'should i plead', 'strategy',
    'जीत', 'हार', 'दोषी', 'निर्दोष', 'बचाव', 'रणनीति', 'सजा', 'फैसला', 'सलाह'
  ];

  const isOutOfScope = outOfScopeKeywords.some(keyword => queryLower.includes(keyword));

  if (isOutOfScope) {
    // Log an "escalation needed" action item in legal_aid_requests
    const reqId = uuid();
    run(
      'INSERT INTO legal_aid_requests (id, undertrial_id, request_type, request_date, status, assigned_lawyer_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        reqId,
        prisoner.id,
        'lawyer_visit',
        timestamp.split('T')[0],
        'pending',
        null,
        `Chatbot Escalation: Prisoner asked out-of-scope question: "${userQuery}"`
      ]
    );

    const hiResponse = "मैं कानूनी सलाह या परिणाम की भविष्यवाणी नहीं कर सकता। मैंने इस विषय को एक वकील से मिलकर परामर्श करने के लिए ('लॉयर विजिट') के रूप में डीएलएसए (DLSA) में दर्ज कर दिया है।";
    const enResponse = "I cannot provide legal advice, predictions, or strategies. I have logged this query and flagged an 'Escalation Needed' request for a lawyer visit with your legal-aid officer.";

    const botResponseText = language === 'hi' ? hiResponse : enResponse;

    // Save turn into persistent conversation memory
    saveConversationTurn(userId, prisoner.id, userQuery, botResponseText, 'escalation', 1, timestamp);

    return {
      text: botResponseText,
      escalated: true,
      request_id: reqId
    };
  }

  // 3. Retrieve facts from Database to answer the query
  // Fetch hearings
  const hearings = query(`
    SELECT hearing_date, purpose, outcome, status FROM hearings 
    WHERE case_id = ? 
    ORDER BY hearing_date ASC
  `, [prisoner.case_id]);

  // Fetch lawyer details
  const lawyer = query(`
    SELECT u.full_name, u.contact_info 
    FROM legal_aid_requests lar
    JOIN users u ON lar.assigned_lawyer_id = u.id
    WHERE lar.undertrial_id = ? AND lar.status = 'assigned'
    LIMIT 1
  `, [prisoner.id])[0];

  // 4. Formulate Response based on Query Type & Past Memory
  let topic = 'general';
  let responseText = '';

  // Query Type: Hearings / Dates
  const isHearingQuery = ['hearing', 'when', 'date', 'next', 'tarikh', 'sunwai', 'सुनवाई', 'तारीख', 'कब'].some(kw => queryLower.includes(kw));
  if (isHearingQuery) {
    topic = 'hearing';
    const hadPastHearingQuery = pastUserQuestions.some(q => q.topic === 'hearing');
    const memoryPrefixEn = hadPastHearingQuery ? "Regarding your hearing schedule (as previously discussed): " : "";
    const memoryPrefixHi = hadPastHearingQuery ? "आपकी सुनवाई की तारीख के संदर्भ में: " : "";

    const upcoming = hearings.find(h => h.status === 'scheduled');
    if (upcoming) {
      responseText = language === 'hi'
        ? `${memoryPrefixHi}आपकी अगली सुनवाई ${upcoming.hearing_date} को "${upcoming.purpose}" के लिए ${prisoner.court_name} में निर्धारित है।`
        : `${memoryPrefixEn}Your next hearing is scheduled on ${upcoming.hearing_date} for "${upcoming.purpose}" at ${prisoner.court_name}.`;
    } else {
      const completed = hearings.filter(h => h.status === 'completed');
      if (completed.length > 0) {
        const last = completed[completed.length - 1];
        responseText = language === 'hi'
          ? `${memoryPrefixHi}आपकी पिछली सुनवाई ${last.hearing_date} को हुई थी। वर्तमान में कोई आगामी सुनवाई निर्धारित नहीं है।`
          : `${memoryPrefixEn}Your last hearing was on ${last.hearing_date}. Currently, there is no upcoming hearing scheduled.`;
      } else {
        responseText = language === 'hi'
          ? "आपकी कोई सुनवाई अभी तक दर्ज नहीं हुई है।"
          : "No hearings have been scheduled for your case yet.";
      }
    }
  }

  // Query Type: Lawyer
  const isLawyerQuery = !isHearingQuery && ['lawyer', 'advocate', 'counsel', 'contact', 'vakeel', 'vakil', 'वकील', 'एडवोकेट', 'संपर्क'].some(kw => queryLower.includes(kw));
  if (isLawyerQuery) {
    topic = 'lawyer';
    const hadPastLawyerQuery = pastUserQuestions.some(q => q.topic === 'lawyer');
    const memoryPrefixEn = hadPastLawyerQuery ? "Regarding your legal representation: " : "";
    const memoryPrefixHi = hadPastLawyerQuery ? "आपके वकील की जानकारी: " : "";

    if (lawyer) {
      responseText = language === 'hi'
        ? `${memoryPrefixHi}आपके वकील ${lawyer.full_name} हैं। उनका संपर्क विवरण है: ${lawyer.contact_info}।`
        : `${memoryPrefixEn}Your assigned legal-aid lawyer is ${lawyer.full_name}. You can contact them at: ${lawyer.contact_info}.`;
    } else {
      const reqPending = query("SELECT status FROM legal_aid_requests WHERE undertrial_id = ? AND status = 'pending'", [prisoner.id]);
      if (reqPending.length > 0) {
        responseText = language === 'hi'
          ? "आपको वकील नियुक्त करने का अनुरोध अभी डीएलएसए (DLSA) में लंबित है।"
          : "Your request for lawyer assignment is currently pending review by the DLSA officer.";
      } else {
        responseText = language === 'hi'
          ? "आपको अभी तक कोई वकील नियुक्त नहीं किया गया है। आप अपने कियोस्क के माध्यम से वकील की मांग कर सकते हैं।"
          : "You do not have a lawyer assigned yet. You can submit a request for lawyer assignment via your panel.";
      }
    }
  }

  // Query Type: Bail
  const isBailQuery = !isHearingQuery && !isLawyerQuery && ['bail', 'release', 'surety', 'bond', 'jamat', 'zamanat', 'जमानत', 'रिहाई', 'पैसा', 'जमानत राशि'].some(kw => queryLower.includes(kw));
  if (isBailQuery) {
    topic = 'bail';
    const hadPastBailQuery = pastUserQuestions.some(q => q.topic === 'bail');
    const memoryPrefixEn = hadPastBailQuery ? "You previously inquired about your bail status — here is the latest update: " : "";
    const memoryPrefixHi = hadPastBailQuery ? "जैसा कि आपने पहले अपनी जमानत के बारे में पूछा था — उसका नवीनतम अपडेट यह है: " : "";

    if (prisoner.bail_status === 'granted') {
      responseText = language === 'hi'
        ? `${memoryPrefixHi}आपको ${prisoner.bail_amount > 0 ? `रु ${prisoner.bail_amount} की जमानत राशि` : 'निजी मुचलके'} पर जमानत मिल चुकी है। जमानत की कागजी कार्रवाई प्रक्रिया में है।`
        : `${memoryPrefixEn}Your bail has been granted on ${prisoner.bail_amount > 0 ? `a surety of Rs. ${prisoner.bail_amount}` : 'personal bond'}. Processing release paperwork.`;
    } else if (prisoner.bail_status === 'pending') {
      responseText = language === 'hi'
        ? `${memoryPrefixHi}आपकी जमानत का आवेदन अदालत में विचाराधीन (लंबित) है।`
        : `${memoryPrefixEn}Your bail application is currently pending review in court.`;
    } else if (prisoner.bail_status === 'unable_to_pay') {
      responseText = language === 'hi'
        ? `${memoryPrefixHi}आपको रु ${prisoner.bail_amount} पर जमानत मिल चुकी है, लेकिन भुगतान न होने के कारण रिहाई रुकी हुई है। डीएलएसए को सूचित कर दिया गया है।`
        : `${memoryPrefixEn}Bail was granted (surety: Rs. ${prisoner.bail_amount}) but status is marked as 'unable to pay'. DLSA has been alerted to provide indigent assistance.`;
    } else {
      responseText = language === 'hi'
        ? `${memoryPrefixHi}आपकी वर्तमान जमानत स्थिति: अभी तक कोई आवेदन दर्ज नहीं हुआ है या निरस्त कर दिया गया है। (धारा: ${prisoner.primary_charge})`
        : `${memoryPrefixEn}Your current bail status is: Not applied / Rejected. (Charge: ${prisoner.primary_charge})`;
    }
  }

  // Query Type: Documents
  const isDocQuery = !isHearingQuery && !isLawyerQuery && !isBailQuery && ['document', 'file', 'paper', 'fir', 'order', 'चार्ज', 'कागज', 'दस्तावेज', 'कागजात'].some(kw => queryLower.includes(kw));
  if (isDocQuery) {
    topic = 'documents';
    const docs = query(`
      SELECT file_name, uploaded_at FROM documents 
      WHERE case_id = ?
    `, [prisoner.case_id]);

    if (docs.length > 0) {
      const docList = docs.map(d => `${d.file_name} (Uploaded: ${d.uploaded_at})`).join(', ');
      responseText = language === 'hi'
        ? `आपके रिकॉर्ड में ये दस्तावेज उपलब्ध हैं: ${docList}।`
        : `The legal-aid officer has received the following documents: ${docList}.`;
    } else {
      responseText = language === 'hi'
        ? "आपके केस के लिए अभी तक कोई दस्तावेज अपलोड नहीं किया गया है।"
        : "No documents have been uploaded to your case file yet.";
    }
  }

  // General / Update Query (e.g. "Any update?", "What happened to my case?", or general greeting)
  if (!responseText) {
    const isUpdateQuery = ['update', 'status', 'kya hua', 'kya chal', 'progress', 'हालचाल', 'अपडेट'].some(kw => queryLower.includes(kw));
    
    if (isUpdateQuery && hasPastHistory && lastUserQuestion) {
      topic = 'general';
      const lastTopic = lastUserQuestion.topic || 'case';
      responseText = language === 'hi'
        ? `नमस्ते ${prisoner.first_name}। आपके पिछले सवाल (${lastTopic}) के संदर्भ में: आपकी वर्तमान जमानत स्थिति '${prisoner.bail_status}' है और कोर्ट ${prisoner.court_name} में केस सक्रिय है।`
        : `Welcome back, ${prisoner.first_name}. Following up on your previous questions regarding your ${lastTopic}: your current bail status is '${prisoner.bail_status}' and your case is active in ${prisoner.court_name}.`;
    } else if (hasPastHistory) {
      topic = 'general';
      responseText = language === 'hi'
        ? `नमस्ते ${prisoner.first_name}! मैं आपका व्यक्तिगत न्यायसेतु सहायक हूँ। मैं आपकी जमानत स्थिति, सुनवाई की तारीखें, और वकील की जानकारी दे सकता हूँ।`
        : `Welcome back, ${prisoner.first_name}. I have your past inquiry history on file. How can I assist you with your bail status, hearing dates, or lawyer details today?`;
    } else {
      topic = 'general';
      responseText = language === 'hi'
        ? `नमस्ते ${prisoner.first_name}। मैं आपकी जमानत स्थिति, सुनवाई की तारीखें, और वकील का विवरण बता सकता हूँ। कृपया स्पष्ट पूछें (जैसे: "मेरी अगली सुनवाई कब है?")।`
        : `Hello ${prisoner.first_name}. I can help you find your hearing dates, bail status, lawyer details, or case documents. Please ask a specific question like "When is my next hearing?".`;
    }
  }

  // Save the turn into persistent conversation memory table
  saveConversationTurn(userId, prisoner.id, userQuery, responseText, topic, 0, timestamp);

  return {
    text: responseText,
    escalated: false,
    topic
  };
}

// Helper to save conversation turn
function saveConversationTurn(userId, undertrialId, userMessage, botResponse, topic, escalated = 0, timestamp = new Date().toISOString()) {
  try {
    // Save user message
    run(
      'INSERT INTO ai_conversations (id, user_id, undertrial_id, sender, message_text, topic, escalated, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), userId, undertrialId, 'user', userMessage, topic, 0, timestamp]
    );

    // Save bot message
    run(
      'INSERT INTO ai_conversations (id, user_id, undertrial_id, sender, message_text, topic, escalated, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [uuid(), userId, undertrialId, 'bot', botResponse, topic, escalated, new Date(Date.now() + 50).toISOString()]
    );
  } catch (err) {
    console.error('[AI Memory Save Error]', err);
  }
}

// Helper to fetch chat history for a user
function getChatHistory(userId, limit = 50) {
  try {
    const rows = query(`
      SELECT id, sender, message_text AS text, topic, escalated, timestamp 
      FROM ai_conversations 
      WHERE user_id = ? 
      ORDER BY timestamp ASC 
      LIMIT ?
    `, [userId, limit]);

    return rows.map(r => ({
      id: r.id,
      sender: r.sender,
      text: r.text,
      topic: r.topic,
      escalated: Boolean(r.escalated),
      timestamp: new Date(r.timestamp)
    }));
  } catch (err) {
    console.error('[AI Memory Get Error]', err);
    return [];
  }
}

module.exports = {
  mockSummarizeDocument,
  processChatQuery,
  getChatHistory
};

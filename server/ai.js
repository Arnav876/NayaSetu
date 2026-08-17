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

// Scoped Chatbot Q&A Engine (Module 8 & 9)
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
      'first_name,last_name,bail_status,hearings',
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

    return {
      text: language === 'hi' ? hiResponse : enResponse,
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

  // 4. Formulate Response based on Query Type
  // Query Type: Hearings / Dates
  const isHearingQuery = ['hearing', 'when', 'date', 'next', 'सुनवाई', 'तारीख', 'कब'].some(kw => queryLower.includes(kw));
  if (isHearingQuery) {
    const upcoming = hearings.find(h => h.status === 'scheduled');
    if (upcoming) {
      return {
        text: language === 'hi'
          ? `आपकी अगली सुनवाई ${upcoming.hearing_date} को "${upcoming.purpose}" के लिए ${prisoner.court_name} में निर्धारित है।`
          : `Your next hearing is scheduled on ${upcoming.hearing_date} for "${upcoming.purpose}" at ${prisoner.court_name}.`,
        escalated: false
      };
    } else {
      const completed = hearings.filter(h => h.status === 'completed');
      if (completed.length > 0) {
        const last = completed[completed.length - 1];
        return {
          text: language === 'hi'
            ? `आपकी पिछली सुनवाई ${last.hearing_date} को हुई थी। वर्तमान में कोई आगामी सुनवाई निर्धारित नहीं है।`
            : `Your last hearing was on ${last.hearing_date}. Currently, there is no upcoming hearing scheduled.`,
          escalated: false
        };
      } else {
        return {
          text: language === 'hi'
            ? "आपकी कोई सुनवाई अभी तक दर्ज नहीं हुई है।"
            : "No hearings have been scheduled for your case yet.",
          escalated: false
        };
      }
    }
  }

  // Query Type: Lawyer
  const isLawyerQuery = ['lawyer', 'advocate', 'counsel', 'contact', 'वकील', 'एडवोकेट', 'संपर्क'].some(kw => queryLower.includes(kw));
  if (isLawyerQuery) {
    if (lawyer) {
      return {
        text: language === 'hi'
          ? `आपके वकील ${lawyer.full_name} हैं। उनका संपर्क विवरण है: ${lawyer.contact_info}।`
          : `Your assigned legal-aid lawyer is ${lawyer.full_name}. You can contact them at: ${lawyer.contact_info}.`,
        escalated: false
      };
    } else {
      // Check if request is pending
      const reqPending = query('SELECT status FROM legal_aid_requests WHERE undertrial_id = ? AND status = "pending"', [prisoner.id]);
      if (reqPending.length > 0) {
        return {
          text: language === 'hi'
            ? "आपको वकील नियुक्त करने का अनुरोध लंबित है। डीएलएसए (DLSA) जल्द ही कार्रवाई करेगा।"
            : "Your request for lawyer assignment is pending review by the DLSA officer.",
          escalated: false
        };
      } else {
        return {
          text: language === 'hi'
            ? "आपको अभी तक कोई वकील नियुक्त नहीं किया गया है। आप अपने कियोस्क के माध्यम से वकील की मांग कर सकते हैं।"
            : "You do not have a lawyer assigned yet. You can submit a request for lawyer assignment via your panel.",
          escalated: false
        };
      }
    }
  }

  // Query Type: Bail
  const isBailQuery = ['bail', 'release', 'surety', 'bond', 'जमानत', 'रिहाई', 'पैसा', 'जमानत राशि'].some(kw => queryLower.includes(kw));
  if (isBailQuery) {
    if (prisoner.bail_status === 'granted') {
      return {
        text: language === 'hi'
          ? `आपको ${prisoner.bail_amount > 0 ? `रु ${prisoner.bail_amount} की जमानत राशि` : 'निजी मुचलके'} पर जमानत मिल चुकी है। जमानत की कागजी कार्रवाई प्रक्रिया में है।`
          : `Your bail has been granted on ${prisoner.bail_amount > 0 ? `a surety of Rs. ${prisoner.bail_amount}` : 'personal bond'}. Processing release paperwork.`,
        escalated: false
      };
    } else if (prisoner.bail_status === 'pending') {
      return {
        text: language === 'hi'
          ? "आपकी जमानत का आवेदन अदालत में विचाराधीन (लंबित) है।"
          : "Your bail application is currently pending review in court.",
        escalated: false
      };
    } else if (prisoner.bail_status === 'unable_to_pay') {
      return {
        text: language === 'hi'
          ? `आपको रु ${prisoner.bail_amount} पर जमानत मिल चुकी है, लेकिन भुगतान न होने के कारण रिहाई रुकी हुई है। हमने विधिक सेवा प्राधिकारी को सूचित कर दिया है।`
          : `Bail was granted (surety: Rs. ${prisoner.bail_amount}) but status is marked as 'unable to pay'. DLSA has been alerted to provide indigent assistance.`,
        escalated: false
      };
    } else {
      return {
        text: language === 'hi'
          ? "आपकी वर्तमान जमानत स्थिति: अभी तक कोई आवेदन दर्ज नहीं हुआ है या निरस्त कर दिया गया है।"
          : `Your current bail status is: Not applied / Rejected. (Charge: ${prisoner.primary_charge})`,
        escalated: false
      };
    }
  }

  // Query Type: Documents
  const isDocQuery = ['document', 'file', 'paper', 'fir', 'order', 'चार्ज', 'कागज', 'दस्तावेज', 'कागजात'].some(kw => queryLower.includes(kw));
  if (isDocQuery) {
    const docs = query(`
      SELECT file_name, uploaded_at FROM documents 
      WHERE case_id = ?
    `, [prisoner.case_id]);

    if (docs.length > 0) {
      const docList = docs.map(d => `${d.file_name} (Uploaded: ${d.uploaded_at})`).join(', ');
      return {
        text: language === 'hi'
          ? `आपके रिकॉर्ड में ये दस्तावेज उपलब्ध हैं: ${docList}।`
          : `The legal-aid officer has received the following documents: ${docList}.`,
        escalated: false
      };
    } else {
      return {
        text: language === 'hi'
          ? "आपके केस के लिए अभी तक कोई दस्तावेज अपलोड नहीं किया गया है।"
          : "No documents have been uploaded to your case file yet.",
        escalated: false
      };
    }
  }

  // Default Response (out of matches, but factual)
  const hiDefault = `नमस्ते ${prisoner.first_name}। मैं आपकी जमानत स्थिति, सुनवाई की तारीखें, और वकील का विवरण बता सकता हूँ। कृपया स्पष्ट पूछें (जैसे: "मेरी अगली सुनवाई कब है?")।`;
  const enDefault = `Hello ${prisoner.first_name}. I can help you find your hearing dates, bail status, lawyer details, or case documents. Please ask a specific question like "When is my next hearing?".`;

  return {
    text: language === 'hi' ? hiDefault : enDefault,
    escalated: false
  };
}

module.exports = {
  mockSummarizeDocument,
  processChatQuery
};

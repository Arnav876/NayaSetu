const { query } = require('./db');

// Max sentences for seed charges (in days)
const CHARGE_MAX_SENTENCES = {
  'Theft (BNS Section 303)': 3 * 365, // 3 years
  'Cheating (BNS Section 318)': 3 * 365, // 3 years
  'House-trespass (BNS Section 329)': 1 * 365, // 1 year
  'Criminal Breach of Trust (BNS Section 316)': 5 * 365, // 5 years
  'Receiving Stolen Property (BNS Section 317)': 3 * 365, // 3 years
};

// Helper to calculate days between two ISO dates (YYYY-MM-DD)
function getDaysDiff(date1Str, date2Str) {
  if (!date1Str || !date2Str) return 0;
  const d1 = new Date(date1Str);
  const d2 = new Date(date2Str);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Check if date2 is after date1
function isAfter(date1Str, date2Str) {
  return new Date(date2Str) > new Date(date1Str);
}

function evaluateRules(currentDateStr = '2026-08-17') {
  const actionItems = [];

  // Fetch all active cases with undertrial, case, and legal aid details
  const cases = query(`
    SELECT 
      c.id AS case_id,
      c.case_number,
      c.court_name,
      u.id AS undertrial_id,
      u.first_name,
      u.last_name,
      u.prisoner_number,
      u.date_of_arrest,
      u.remand_date,
      u.primary_charge,
      u.sections,
      u.bail_status,
      lar.status AS legal_aid_status,
      lar.assigned_lawyer_id
    FROM cases c
    JOIN undertrials u ON c.undertrial_id = u.id
    LEFT JOIN legal_aid_requests lar ON u.id = lar.undertrial_id AND lar.request_type = 'lawyer_assignment'
  `);

  for (const c of cases) {
    const prisonerName = `${c.first_name} ${c.last_name}`;
    const daysSinceRemand = getDaysDiff(c.remand_date, currentDateStr);
    const daysSinceArrest = getDaysDiff(c.date_of_arrest, currentDateStr);

    // Rule 1: No lawyer assigned 7+ days after remand
    if ((!c.assigned_lawyer_id || c.legal_aid_status === 'pending') && daysSinceRemand >= 7) {
      actionItems.push({
        id: `rule1-${c.case_id}`,
        case_id: c.case_id,
        undertrial_id: c.undertrial_id,
        prisoner_name: prisonerName,
        prisoner_number: c.prisoner_number,
        title: 'No Lawyer Assigned 7+ Days',
        description: `Remand order was passed ${daysSinceRemand} days ago on ${c.remand_date}, but no defense counsel has been assigned.`,
        severity: 'high',
        responsible_role: 'dlsa_officer',
        created_at: currentDateStr
      });
    }

    // Rule 2: Bail application pending review 30+ days
    if (c.bail_status === 'pending') {
      const bailEvent = query(`
        SELECT event_date FROM case_events 
        WHERE case_id = ? AND event_type = 'bail_applied' 
        ORDER BY event_date DESC LIMIT 1
      `, [c.case_id])[0];

      if (bailEvent) {
        const daysBailPending = getDaysDiff(bailEvent.event_date, currentDateStr);
        if (daysBailPending >= 30) {
          actionItems.push({
            id: `rule2-${c.case_id}`,
            case_id: c.case_id,
            undertrial_id: c.undertrial_id,
            prisoner_name: prisonerName,
            prisoner_number: c.prisoner_number,
            title: 'Bail Pending 30+ Days',
            description: `Bail petition was filed on ${bailEvent.event_date} (${daysBailPending} days ago) and is still pending review.`,
            severity: 'medium',
            responsible_role: 'lawyer',
            created_at: currentDateStr
          });
        }
      }
    }

    // Rule 3: Detention period may meet BNSS Sec. 479 threshold (flag for UTRC review)
    // BNSS 479 states that an undertrial who has undergone detention for up to one-half of the maximum period of imprisonment
    // specified for that offense under the law shall be released on personal bond (or one-third for first-time offenders).
    const maxSentenceDays = CHARGE_MAX_SENTENCES[c.primary_charge] || 3 * 365; // Default 3 years
    const halfSentenceDays = Math.floor(maxSentenceDays / 2);
    
    if (daysSinceArrest >= halfSentenceDays) {
      actionItems.push({
        id: `rule3-${c.case_id}`,
        case_id: c.case_id,
        undertrial_id: c.undertrial_id,
        prisoner_name: prisonerName,
        prisoner_number: c.prisoner_number,
        title: 'BNSS Sec. 479 Threshold Exceeded',
        description: `Detained for ${daysSinceArrest} days (Arrest: ${c.date_of_arrest}) for charge "${c.primary_charge}". This exceeds the half-sentence limit of ${halfSentenceDays} days. Flagged for UTRC Review.`,
        severity: 'high',
        responsible_role: 'dlsa_officer',
        created_at: currentDateStr
      });
    }

    // Rule 4: No hearing scheduled in 60+ days
    // Check scheduled future hearings
    const futureHearings = query(`
      SELECT hearing_date FROM hearings 
      WHERE case_id = ? AND status = 'scheduled' AND hearing_date >= ?
    `, [c.case_id, currentDateStr]);

    if (futureHearings.length === 0) {
      // Find the last completed event or hearing date
      const lastHearing = query(`
        SELECT hearing_date FROM hearings 
        WHERE case_id = ? AND status = 'completed' 
        ORDER BY hearing_date DESC LIMIT 1
      `, [c.case_id])[0];

      const lastEvent = query(`
        SELECT event_date FROM case_events 
        WHERE case_id = ? AND status = 'done' 
        ORDER BY event_date DESC LIMIT 1
      `, [c.case_id])[0];

      const lastActiveDate = lastHearing?.hearing_date || lastEvent?.event_date || c.remand_date;
      const daysSinceLastActivity = getDaysDiff(lastActiveDate, currentDateStr);

      if (daysSinceLastActivity >= 60) {
        actionItems.push({
          id: `rule4-${c.case_id}`,
          case_id: c.case_id,
          undertrial_id: c.undertrial_id,
          prisoner_name: prisonerName,
          prisoner_number: c.prisoner_number,
          title: 'No Hearing Scheduled 60+ Days',
          description: `No upcoming hearings scheduled. The last case event/hearing occurred on ${lastActiveDate} (${daysSinceLastActivity} days ago).`,
          severity: 'high',
          responsible_role: 'lawyer',
          created_at: currentDateStr
        });
      }
    }
  }

  // Fetch pending out-of-scope legal aid requests to display chatbot escalations (Rule 5)
  const escalatedRequests = query(`
    SELECT 
      lar.id AS request_id,
      lar.undertrial_id,
      lar.notes,
      lar.request_date,
      u.first_name,
      u.last_name,
      u.prisoner_number,
      c.id AS case_id
    FROM legal_aid_requests lar
    JOIN undertrials u ON lar.undertrial_id = u.id
    LEFT JOIN cases c ON c.undertrial_id = u.id
    WHERE lar.request_type = 'lawyer_visit' AND lar.status = 'pending' AND lar.notes LIKE '%Chatbot Escalation%'
  `);

  for (const req of escalatedRequests) {
    actionItems.push({
      id: `rule5-${req.request_id}`,
      case_id: req.case_id,
      undertrial_id: req.undertrial_id,
      prisoner_name: `${req.first_name} ${req.last_name}`,
      prisoner_number: req.prisoner_number,
      title: 'Chatbot Q&A Escalation Flag',
      description: `Prisoner submitted an out-of-scope inquiry on ${req.request_date}. Needs lawyer follow-up: "${req.notes}"`,
      severity: 'medium',
      responsible_role: 'dlsa_officer',
      created_at: req.request_date
    });
  }

  return actionItems;
}

module.exports = {
  evaluateRules
};

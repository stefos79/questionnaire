/**
 * NN Hellas — Integrations
 * integrations.js — EmailJS & Google Sheets
 *
 * Exposes window.NN_INTEGRATIONS = { saveToSheets, sendEmails }.
 * Caller (ui.js) passes advisor_name/email/phone inside the data object.
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  // SERVICE CONFIG
  // ════════════════════════════════════════════════════════════════
  const SVC = {
    ej_key:    '3qFxGixe2gHChiZ0T',
    ej_svc:    'service_nfxu98b',
    ej_client: 'template_ky8g7hp',
    ej_agent:  'template_cp85icg',
    sheets_url:'https://script.google.com/macros/s/AKfycbxeyXOn3_iVydydbu1XDgSH8xd8srECLZSMJ4YycYEVb-4j8HCqtzGnyhYXvIY1H3lwiA/exec',
  };

  let _emailSent = false;

  // ════════════════════════════════════════════════════════════════
  // Q&A SUMMARY — μορφοποιημένη λίστα ερωτήσεων-απαντήσεων + scores
  // ════════════════════════════════════════════════════════════════
  function buildQASummary(data) {
    const MAP = {
      marital: {
        single:'Άγαμος/η', married:'Έγγαμος/η',
        divorced:'Διαζευγμένος/η', widowed:'Χήρος/α', single_parent:'Μονογονέας',
      },
      job: {
        employee:'Ιδ. Υπάλληλος', civil_servant:'Δημ. Υπάλληλος',
        freelancer:'Ελεύθ. Επαγγ.', retired:'Συνταξιούχος', other:'Άλλο',
      },
      satisfaction: { very:'Πολύ', somewhat:'Αρκετά', little:'Λίγο', none:'Καθόλου' },
      scope:        { self:'Μόνο εγώ', family:'Όλη η οικογένεια' },
      hospital: {
        local_pub:'Τοπικό Δημόσιο', city_pub:'Δημ. Πόλης',
        local_priv:'Τοπικό Ιδ.', big_priv:'Μεγάλο Ιδ.', abroad:'Εξωτερικό',
      },
      ded:     { none:'Χωρίς', annual:'Ετήσιο', per_incident:'Ανά Περ/τικό' },
      ci:      { none:'Καμία', em7:'ExtraMed 7', em31:'ExtraMed 31' },
      cap:     { '50k':'€50.000', '100k':'€100.000', '150k':'€150.000', '200k':'€200.000' },
      pension: { small:'Χαμηλή', medium:'Μεσαία', high:'Υψηλή', none:'Καμία' },
      savings: { yes:'Ήδη υπάρχει', soon:'Σύντομα', family:'Οικογ. πλάνο', no:'Όχι' },
      yn:      { yes:'Ναι', no:'Όχι' },
    };
    const d = data;
    const v = (m, k) => (MAP[m] && MAP[m][k]) || k || '—';
    const kidsAges = Array.isArray(d.kids_ages) ? d.kids_ages.join(', ') : (d.kids_ages || '');
    const needs    = Array.isArray(d.uncovered_needs) ? d.uncovered_needs.join(', ') : (d.uncovered_needs || '—');
    const ded      = v('ded', d.deductible_type) +
                     (d.deductible_amount && d.deductible_amount !== '0' ? ` / €${d.deductible_amount}` : '');
    const target   = (d.target_amount && d.target_amount !== 'none')
      ? `€${Number(d.target_amount).toLocaleString('el-GR')} σε ${d.target_years || '?'} χρόνια`
      : '—';
    return [
      `Ηλικία: ${d.age}`,
      `Οικογ. κατάσταση: ${v('marital', d.marital_status)}${d.spouse_age ? ' / Σύζ. ' + d.spouse_age + ' ετών' : ''}`,
      `Παιδιά: ${d.children || 0}${kidsAges ? ' (' + kidsAges + ' ετών)' : ''}`,
      `Επάγγελμα: ${v('job', d.occupation)}`,
      `Ικανοπ. ταμείου: ${v('satisfaction', d.fund_satisfaction)}`,
      `Νοσοκ. ήπιο: ${v('hospital', d.hospital_mild)}`,
      `Νοσοκ. σοβαρό: ${v('hospital', d.hospital_severe)}`,
      `Εκπιπτόμενο: ${ded}`,
      `Κάλυψη: ${v('scope', d.coverage_scope)}`,
      `Κρίσιμες ασθ.: ${v('ci', d.ci_pref)}`,
      `Επίδομα νοσηλ.: ${v('yn', d.hospital_allowance)}`,
      `Ανησυχία εισοδ.: ${v('yn', d.income_concern)}`,
      `Ανάγκες ζωής: ${needs}`,
      `Κεφάλαιο ζωής: ${v('cap', d.life_capital)}`,
      `Εκτίμ. σύνταξης: ${v('pension', d.pension_estimate)}`,
      `Αποταμίευση: ${v('savings', d.savings_plan)}`,
      `Στόχος αποταμ.: ${target}`,
      `Budget: €${d.monthly_budget}/μήνα`,
      `── Scores ──`,
      `Υγεία: ${d.health_score} | Ζωή: ${d.life_score} | Σύνταξη: ${d.retirement_score} | ${d.urgency}`,
    ].join('\n');
  }

  // ════════════════════════════════════════════════════════════════
  // GOOGLE SHEETS
  // ════════════════════════════════════════════════════════════════
  function saveToSheets(data) {
    if (!SVC.sheets_url || SVC.sheets_url.startsWith('REPLACE')) return;
    try {
      const p = new URLSearchParams({
        date:               new Date().toLocaleString('el-GR'),
        name:               data.client_name        || '',
        email:              data.client_email       || '',
        phone:              data.client_phone       || '',
        age:                data.age                || '',
        marital_status:     data.marital_status     || '',
        spouse_age:         data.spouse_age         || '',
        children:           data.children           || '',
        kids_ages:          (data.kids_ages         || []).join(', '),
        occupation:         data.occupation         || '',
        fund_satisfaction:  data.fund_satisfaction  || '',
        hospital_mild:      data.hospital_mild      || '',
        hospital_severe:    data.hospital_severe    || '',
        deductible_type:    data.deductible_type    || '',
        deductible_amount:  data.deductible_amount  || '',
        ci_pref:            data.ci_pref            || '',
        hospital_allowance: data.hospital_allowance || '',
        income_concern:     data.income_concern     || '',
        uncovered_needs:    (data.uncovered_needs   || []).join(', '),
        life_capital:       data.life_capital       || '',
        pension_estimate:   data.pension_estimate   || '',
        savings_plan:       data.savings_plan       || '',
        target_amount:      data.target_amount      || '',
        target_years:       data.target_years       || '',
        monthly_budget:     data.monthly_budget     || '',
        health_score:       data.health_score       || '',
        life_score:         data.life_score         || '',
        retirement_score:   data.retirement_score   || '',
        urgency:            data.urgency            || '',
        qa_summary:         buildQASummary(data),
        proposal:           (data.proposal_text     || '').slice(0, 800),
      });
      // POST με URLSearchParams body — αποφεύγει το URL length limit
      // που σπάει σε mobile networks (Greek qa_summary URL-encoded > 2KB).
      // Apps Script doPost(e) διαβάζει το ίδιο e.parameter όπως και doGet.
      fetch(SVC.sheets_url, {
        method: 'POST',
        mode:   'no-cors',
        body:   p,  // application/x-www-form-urlencoded αυτόματα
      }).catch(() => {});
    } catch (e) {}
  }

  // ════════════════════════════════════════════════════════════════
  // EMAILJS
  // ════════════════════════════════════════════════════════════════
  function sendEmails(data) {
    if (_emailSent) return;
    _emailSent = true;
    const statusEl = document.getElementById('email-status');
    const params = {
      client_name:      data.client_name      || 'Πελάτης',
      client_email:     data.client_email     || '',
      client_phone:     data.client_phone     || '',
      client_age:       data.age              || '',
      family_status:    data.marital_status   || '',
      health_score:     data.health_score     || 0,
      life_score:       data.life_score       || 0,
      retirement_score: data.retirement_score || 0,
      urgency_level:    data.urgency          || '',
      needs_hierarchy:  data.needs_hierarchy  || '',
      monthly_budget:   data.monthly_budget   || '',
      deductible_pref:  data.deductible_type  || '',
      deductible_amount:data.deductible_amount|| '',
      needs_hierarchy_short: data.needs_hierarchy_short || '',
      client_profile:   data.client_profile   || '',
      podium_html:      data.podium_html      || '',
      proposal_text:    data.proposal_text    || '',
      date:             new Date().toLocaleDateString('el-GR'),
      advisor_name:     data.advisor_name     || '',
      advisor_email:    data.advisor_email    || '',
      advisor_phone:    data.advisor_phone    || '',
    };
    // eslint-disable-next-line no-undef
    emailjs.send(SVC.ej_svc, SVC.ej_client, { ...params, to_email: params.client_email })
      .then(() => { if (statusEl) statusEl.textContent = '✅ Το email στάλθηκε επιτυχώς!'; })
      .catch(() => { if (statusEl) statusEl.textContent = '⚠️ Τα αποτελέσματα αποθηκεύτηκαν. Επικοινωνήστε μαζί μου.'; });
    // eslint-disable-next-line no-undef
    emailjs.send(SVC.ej_svc, SVC.ej_agent, { ...params, to_email: params.advisor_email })
      .catch(() => {});
  }

  // ════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    try { emailjs.init(SVC.ej_key); } catch (e) {} // eslint-disable-line no-undef
  });

  function reset() { _emailSent = false; }

  // ════════════════════════════════════════════════════════════════
  // RATING — αξιολόγηση ερωτηματολογίου από τον πελάτη
  // Στέλνεται στο Apps Script με action=rating → γράφει σε ξεχωριστό sheet
  // ════════════════════════════════════════════════════════════════
  function saveRating(data) {
    if (!SVC.sheets_url || SVC.sheets_url.startsWith('REPLACE')) return;
    try {
      const p = new URLSearchParams({
        action:  'rating',
        date:    data.date    || new Date().toLocaleString('el-GR'),
        rating:  String(data.rating || ''),
        comment: data.comment || '',
        name:    data.client_name  || '',
        email:   data.client_email || '',
      });
      fetch(SVC.sheets_url + '?' + p.toString(), {
        method: 'GET',
        mode:   'no-cors',
      }).catch(() => {});
    } catch (e) {}
  }

  // ════════════════════════════════════════════════════════════════
  // EXPORTS
  // ════════════════════════════════════════════════════════════════
  window.NN_INTEGRATIONS = { saveToSheets, sendEmails, saveRating, reset };

})();

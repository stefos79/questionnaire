/**
 * NN Hellas — Ασφαλιστικό Ερωτηματολόγιο
 * ui.js — Διεπαφή Χρήστη (Επίπεδο 1)
 *
 * Χειρίζεται: navigation, form state, adapter snake↔camel,
 * rendering αποτελεσμάτων, integrations (EmailJS / Sheets).
 * Όλη η λογική ασφαλιστικής πρότασης βρίσκεται στο engine.js.
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════════
  // CONFIG
  // ════════════════════════════════════════════════════════════════
  const BRAND = {
    name:    'NN Hellas',
    advisor: 'Χρήστος Κόλτσης',
    email:   'koltsis2002@gmail.com',
    phone:   '6989118348',
  };

  // ════════════════════════════════════════════════════════════════
  // DISPLAY MAPS
  // ════════════════════════════════════════════════════════════════
  const CAT_LABELS = {
    health:            '🏥 Υγεία',
    primaryCare:       '🩺 Εξωνοσ.',
    criticalIllness:   '⚕️ Κρίσιμες',
    hospitalAllowance: '🏨 Επίδομα',
    life:              '💛 Ζωή',
    savings:           '💰 Αποταμίευση',
  };

  // ════════════════════════════════════════════════════════════════
  // STATE
  // ════════════════════════════════════════════════════════════════
  let currentStep = 0;
  const TOTAL_STEPS = 6;
  let answers = { age: 35, monthly_budget: 100 };
  let _submitted = false;

  // ════════════════════════════════════════════════════════════════
  // ADAPTER — μετατρέπει τα snake_case HTML answers στο canonical
  //           camelCase schema που περιμένει το engine.js
  // ════════════════════════════════════════════════════════════════
  function toCanonical(a) {
    const maritalMap = {
      single:        'single',
      married:       'married',
      divorced:      'single',      // treated as single for engine
      widowed:       'widowed',     // fix: χήρος/α → score 9 (υψηλή ανάγκη Ζωής)
      single_parent: 'singleParent',
    };
    const occupationMap = {
      employee:     'privateEmployee',
      civil_servant:'publicEmployee',
      freelancer:   'freelancer',
      retired:      'retired',
      other:        'other',
    };
    const hospitalMap = {
      local_pub:  'localPub',
      city_pub:   'cityPub',
      local_priv: 'localPriv',
      big_priv:   'bigPriv',
      abroad:     'abroad',
    };
    const deductibleMap = {
      none:         'none',
      annual:       'annual',
      per_incident: 'perIncident',
    };
    // HTML 'yes' = «έχω ήδη σχέδιο» → engine 'already'
    const savingsPlanMap = {
      yes:    'already',
      soon:   'soon',
      family: 'family',
      no:     'no',
    };

    return {
      age:                 Number(a.age) || 35,
      maritalStatus:       maritalMap[a.marital_status]   || 'single',
      spouseAge:           a.spouse_age ? Number(a.spouse_age) : undefined,
      children:            String(a.children  || '0'),
      childrenAges:        a.kids_ages || [],
      occupation:          occupationMap[a.occupation]    || 'other',
      fundSatisfaction:    a.fund_satisfaction            || 'little',
      hospitalMild:        hospitalMap[a.hospital_mild]   || 'localPub',
      hospitalSevere:      hospitalMap[a.hospital_severe] || 'localPub',
      desiredBenefits:     a.health_benefits              || [],
      deductibleType:      deductibleMap[a.deductible_type] || 'annual',
      deductibleAmount:    a.deductible_amount             || '',
      criticalIllnessPref: a.ci_pref                      || 'none',
      hospitalAllowancePref: a.hospital_allowance         || 'no',
      incomeConcern:       a.income_concern               || 'no',
      uncoveredNeeds:      a.uncovered_needs              || [],
      lifeCapital:         a.life_capital                 || '50k',
      pensionEstimate:     a.pension_estimate             || 'small',
      savingsPlan:         savingsPlanMap[a.savings_plan] || 'no',
      monthlyBudget:       Number(a.monthly_budget)       || 100,
      coverageScope:       a.coverage_scope               || 'family',
    };
  }

  // ════════════════════════════════════════════════════════════════
  // NAVIGATION
  // ════════════════════════════════════════════════════════════════
  function showStep(n) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('s' + n).classList.add('active');
    currentStep = n;
    if (n === 2) updateCoverageScope();
    const pct = n === 0 ? 0 : Math.round((n / TOTAL_STEPS) * 100);
    document.getElementById('progress-fill').style.width = pct + '%';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function nextStep() {
    const errs = validateStep(currentStep);
    if (errs.length) { showErr(currentStep, errs[0]); return; }
    hideErr(currentStep);
    collectAnswers();
    if (currentStep < TOTAL_STEPS) showStep(currentStep + 1);
  }

  function prevStep() {
    hideErr(currentStep);
    if (currentStep > 0) showStep(currentStep - 1);
  }

  function submitForm() {
    if (_submitted) return;
    const errs = validateStep(5);
    if (errs.length) { showErr(5, errs[0]); return; }
    _submitted = true;
    const btn = document.querySelector('#s5 .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Φόρτωση…'; }
    hideErr(5);
    collectAnswers();
    showStep(6);
    renderResults();
  }

  function revealContact(type, card) {
    const reveal = document.getElementById('reveal-' + type);
    if (!reveal) return;
    const isRevealed = reveal.style.display === 'block';
    reveal.style.display = isRevealed ? 'none' : 'block';
    card.classList.toggle('revealed', !isRevealed);
    if (!isRevealed) {
      const link = reveal.querySelector('a');
      if (link && window.innerWidth <= 600) setTimeout(() => link.click(), 300);
    }
  }

  function showErr(step, msg) {
    const el = document.getElementById('err' + step);
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }
  function hideErr(step) {
    const el = document.getElementById('err' + step);
    if (el) el.style.display = 'none';
  }

  // ════════════════════════════════════════════════════════════════
  // OPTION SELECTION HELPERS
  // ════════════════════════════════════════════════════════════════
  function selOpt(el, field, val) {
    const parent = el.closest('.opts') || el.parentNode;
    parent.querySelectorAll('.opt').forEach(o => o.classList.remove('sel'));
    el.classList.add('sel');
    answers[field] = val;
  }

  function togMulti(e, el, field, val) {
    e.preventDefault();
    el.classList.toggle('sel');
    if (!answers[field]) answers[field] = [];
    if (el.classList.contains('sel')) {
      if (!answers[field].includes(val)) answers[field].push(val);
    } else {
      answers[field] = answers[field].filter(v => v !== val);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // DYNAMIC UI
  // ════════════════════════════════════════════════════════════════
  function toggleDeductibleAmount(type) {
    const annualBlock = document.getElementById('deductible-amount-annual');
    const piBlock     = document.getElementById('deductible-amount-perincident');
    if (annualBlock) annualBlock.style.display = (type === 'annual') ? 'block' : 'none';
    if (piBlock)     piBlock.style.display     = (type === 'per_incident') ? 'block' : 'none';

    if (type === 'none') {
      // «Όχι εκπιπτόμενο» → άμεση αντιστοίχιση με CROSS PLUS
      // (από πρώτο € καλύπτει η εταιρία)
      answers.deductible_amount = '0';
      document.querySelectorAll('input[name="deductible_amount"]').forEach(r => { r.checked = false; });
      document.querySelectorAll('#opts-ded-amt-annual .opt, #opts-ded-amt-perinc .opt').forEach(o => o.classList.remove('sel'));
    } else {
      // Αλλαγή τύπου → καθαρισμός προηγούμενης επιλογής ποσού
      answers.deductible_amount = '';
      document.querySelectorAll('input[name="deductible_amount"]').forEach(r => { r.checked = false; });
      document.querySelectorAll('#opts-ded-amt-annual .opt, #opts-ded-amt-perinc .opt').forEach(o => o.classList.remove('sel'));
    }
  }

  function updateCoverageScope() {
    const block = document.getElementById('coverage-scope-block');
    if (!block) return;
    const hasSpouse = answers.marital_status === 'married';
    const hasKids   = parseInt(answers.children || '0') > 0;
    const needScope = hasSpouse || hasKids;
    block.style.display = needScope ? 'block' : 'none';

    if (!needScope) {
      answers.coverage_scope = 'self';
      document.querySelectorAll('input[name="coverage_scope"]').forEach(r => { r.checked = false; });
      document.querySelectorAll('#opts-coverage-scope .opt').forEach(o => o.classList.remove('sel'));
    }
  }

  function updateKidsAges(count) {
    const section = document.getElementById('kids-section');
    const grid    = document.getElementById('kids-grid');
    if (count === 0) { section.style.display = 'none'; answers.kids_ages = []; return; }
    section.style.display = 'block';
    grid.innerHTML = '';
    answers.kids_ages = new Array(Math.min(count, 4)).fill(0);
    for (let i = 0; i < Math.min(count, 4); i++) {
      const inp = document.createElement('input');
      inp.type = 'number'; inp.className = 'form-input kid-age';
      inp.placeholder = 'Ηλικία ' + (i + 1) + 'ου παιδιού';
      inp.min = 0; inp.max = 25;
      const idx = i;
      inp.addEventListener('input', () => { answers.kids_ages[idx] = parseInt(inp.value) || 0; });
      grid.appendChild(inp);
    }
  }

  // ════════════════════════════════════════════════════════════════
  // COLLECT ANSWERS
  // ════════════════════════════════════════════════════════════════
  function collectAnswers() {
    answers.age           = parseInt(document.getElementById('age-input').value) || null;
    answers.monthly_budget = parseInt(document.getElementById('budget-slider').value) || 100;
    answers.target_years  = parseInt(document.getElementById('target-years-slider').value) || 15;
    answers.client_name   = (document.getElementById('client-name')?.value || '').trim();
    answers.client_email  = (document.getElementById('client-email')?.value || '').trim();
    answers.client_phone  = (document.getElementById('client-phone')?.value || '').trim();

    const spouseInp = document.getElementById('spouse-age');
    if (spouseInp && spouseInp.value) answers.spouse_age = parseInt(spouseInp.value) || null;

    ['marital_status','hospital_mild','hospital_severe','fund_satisfaction',
     'deductible_type','deductible_amount','coverage_scope','income_concern','life_capital',
     'pension_estimate','savings_plan','occupation','children','ci_pref','hospital_allowance',
     'target_amount'
    ].forEach(name => {
      const el = document.querySelector('input[name="' + name + '"]:checked');
      if (el) answers[name] = el.value;
    });

    answers.health_benefits = Array.from(
      document.querySelectorAll('input[name="health_benefits"]:checked')
    ).map(cb => cb.value);

    answers.uncovered_needs = Array.from(
      document.querySelectorAll('input[name="uncovered_needs"]:checked')
    ).map(cb => cb.value);
  }

  // ════════════════════════════════════════════════════════════════
  // VALIDATION
  // ════════════════════════════════════════════════════════════════
  function validateStep(step) {
    const a = answers;
    if (step === 1) {
      const ageEl = document.getElementById('age-input');
      const ageVal = ageEl ? parseInt(ageEl.value) : NaN;
      if (!ageEl || !ageEl.value || isNaN(ageVal)) return ['Παρακαλώ συμπληρώστε την ηλικία σας για να συνεχίσετε'];
      if (ageVal < 18 || ageVal > 70) return ['Η ηλικία πρέπει να είναι μεταξύ 18 και 70 ετών'];
      if (!a.marital_status) return ['Επιλέξτε οικογενειακή κατάσταση'];
      if (a.marital_status === 'married') {
        const sa = document.getElementById('spouse-age')?.value;
        if (!sa || parseInt(sa) < 18) return ['Εισάγετε έγκυρη ηλικία συζύγου'];
      }
      if (a.children === undefined) return ['Επιλέξτε αριθμό παιδιών'];
      if (a.children && a.children !== '0') {
        const filled = Array.from(document.querySelectorAll('.kid-age'))
          .every(inp => inp.value && parseInt(inp.value) >= 0);
        if (!filled) return ['Συμπληρώστε τις ηλικίες όλων των παιδιών'];
      }
      if (!a.occupation) return ['Επιλέξτε επάγγελμα'];
      return [];
    }
    if (step === 2) {
      if (!a.fund_satisfaction)  return ['Αξιολογήστε την ικανοποίησή σας από το ταμείο'];
      if (!a.hospital_mild)      return ['Επιλέξτε νοσοκομείο για ήπιο θέμα υγείας'];
      if (!a.hospital_severe)    return ['Επιλέξτε νοσοκομείο για σοβαρό θέμα υγείας'];
      if (!a.deductible_type)    return ['Επιλέξτε τύπο εκπιπτόμενου'];
      if ((a.deductible_type === 'annual' || a.deductible_type === 'per_incident') && !a.deductible_amount) {
        return ['Επιλέξτε το ύψος του εκπιπτόμενου ποσού'];
      }
      const scopeBlock = document.getElementById('coverage-scope-block');
      if (scopeBlock && scopeBlock.style.display !== 'none' && !a.coverage_scope) {
        return ['Επιλέξτε ποια μέλη θέλετε να συμπεριλάβετε στην πρόταση'];
      }
      if (!a.ci_pref)            return ['Επιλέξτε προτίμηση για Κρίσιμες Ασθένειες'];
      if (!a.hospital_allowance) return ['Επιλέξτε αν επιθυμείτε ημερήσιο επίδομα νοσηλείας'];
      return [];
    }
    if (step === 3) {
      if (!a.income_concern) return ['Απαντήστε στην ερώτηση εισοδήματος'];
      if (!a.life_capital)   return ['Επιλέξτε επιθυμητό κεφάλαιο ζωής'];
      return [];
    }
    if (step === 4) {
      if (!a.pension_estimate) return ['Εκτιμήστε την κρατική σύνταξή σας'];
      if (!a.savings_plan)     return ['Επιλέξτε σχέδιο αποταμίευσης'];
      if (!a.target_amount)    return ['Επιλέξτε στόχο αποταμίευσης (ή «δεν με ενδιαφέρει»)'];
      return [];
    }
    if (step === 5) {
      const name  = document.getElementById('client-name')?.value?.trim();
      const email = document.getElementById('client-email')?.value?.trim();
      const phone = document.getElementById('client-phone')?.value?.trim();
      if (!name)                           return ['Εισάγετε το ονοματεπώνυμό σας'];
      if (!email || !email.includes('@'))  return ['Εισάγετε έγκυρη διεύθυνση email'];
      if (phone && phone.length < 10)      return ['Αν θέλετε να δηλώσετε τηλέφωνο, εισάγετε τουλάχιστον 10 ψηφία (ή αφήστε το κενό)'];
      return [];
    }
    return [];
  }

  // ════════════════════════════════════════════════════════════════
  // SAVINGS SCENARIOS (αποταμίευση — ανεξάρτητο από engine)
  // Πηγή αποδόσεων: NN-E-422/07.2025
  // ════════════════════════════════════════════════════════════════
  function calcSavingsScenarios(targetAmount, years, offerMonthly) {
    if (!targetAmount || !years || targetAmount <= 0 || years <= 0) return null;
    const returns = [
      { label:'Συντηρητικό',  annual:0.0270, color:'#4a9eda',
        desc:'Χαμηλότερο ρίσκο, μεγαλύτερη σταθερότητα στις αποδόσεις' },
      { label:'Ισορροπημένο', annual:0.0640, color:'#C9A84C',
        desc:'Ισορροπία ασφάλειας και απόδοσης μεσοπρόθεσμα' },
      { label:'Δυναμικό',     annual:0.1020, color:'#F47920',
        desc:'Υψηλότερο ρίσκο με μεγαλύτερη δυνητική απόδοση' },
    ];
    const months = years * 12;
    const pmt = Math.max(0, offerMonthly || 0);
    return returns.map(s => {
      const r = s.annual / 12;
      const factor = (Math.pow(1 + r, months) - 1) / r;   // annuity FV factor
      const fv = Math.round(pmt * factor);                // τι χτίζει η προσφορά
      const requiredMonthly = Math.round(targetAmount / factor);
      const gap = Math.max(0, targetAmount - fv);         // κενό κεφαλαίου
      const extraMonthly = Math.max(0, requiredMonthly - pmt); // επιπλέον €/μήνα
      return { ...s, fv, gap, extraMonthly, requiredMonthly, reachesTarget: gap <= 0 };
    });
  }

  // ════════════════════════════════════════════════════════════════
  // BENEFITS TEXT
  // ════════════════════════════════════════════════════════════════
  function generateBenefitsText(a, scores, lines, totalMonthly) {
    const parts = [];
    const avg = (scores.health + scores.life + scores.retirement) / 3;
    const urg    = avg >= 70 ? 'ΚΡΙΣΙΜΗ' : avg >= 50 ? 'ΥΨΗΛΗ' : avg >= 30 ? 'ΜΕΤΡΙΑ' : 'ΧΑΜΗΛΗ';
    const urgGr  = { ΚΡΙΣΙΜΗ:'κρίσιμης', ΥΨΗΛΗ:'υψηλής', ΜΕΤΡΙΑ:'μέτριας', ΧΑΜΗΛΗ:'βασικής' }[urg];

    const kids = parseInt(a.children) || 0;
    const familyCtx = a.marital_status === 'married'
      ? `Ως έγγαμος/η${kids > 0 ? ` με ${kids >= 3 ? '3+' : kids} παιδί${kids === 1 ? '' : 'ά'}` : ''}`
      : a.marital_status === 'single_parent' ? 'Ως μονογονέας' : '';

    if (familyCtx) parts.push(
      `${familyCtx}, η ασφάλιση εξασφαλίζει την οικονομική ευστάθεια της οικογένειάς σας σε κάθε απρόβλεπτο.`
    );

    const topNeeds = [];
    if (scores.health >= 30)     topNeeds.push('νοσοκομειακή/ιατρική κάλυψη');
    if (scores.life >= 40)       topNeeds.push('προστασία εισοδήματος');
    if (scores.retirement >= 40) topNeeds.push('συνταξιοδοτική ασφάλεια');
    if (topNeeds.length) parts.push(
      `Η ανάλυση αναδεικνύει ανάγκη ${urgGr} προτεραιότητας για: ${topNeeds.join(' · ')}.`
    );

    if (lines.length > 0) {
      const prodNames = lines.map(l => l.label).join(' + ');
      parts.push(
        `Το προτεινόμενο πακέτο (${prodNames}) σας καλύπτει για μόλις €${totalMonthly}/μήνα — ισοδύναμο με €${(totalMonthly / 30).toFixed(1)} ημερησίως.`
      );
    }

    if (a.income_concern === 'yes') parts.push(
      'Σε περίπτωση απώλειας εισοδήματος, η οικογένειά σας διατηρεί την οικονομική της ισορροπία χάρη στην ασφαλιστική προστασία.'
    );
    if (scores.retirement >= 45) parts.push(
      'Η ιδιωτική αποταμίευση αποτελεί σήμερα αναγκαίο συμπλήρωμα της κρατικής σύνταξης για αξιοπρεπή διαβίωση.'
    );
    return parts.join(' ');
  }

  // ════════════════════════════════════════════════════════════════
  // RANKED NEEDS — επιστρέφει τις 3 κατηγορίες ταξινομημένες κατά score ↓
  // ════════════════════════════════════════════════════════════════
  function rankNeeds(h, l, r) {
    const cats = [
      { key:'health',     name:'Ασφάλεια Υγείας',      short:'Υγεία',   score:h, color:'#F47920' },
      { key:'life',       name:'Ασφάλεια Ζωής',        short:'Ζωή',     score:l, color:'#C9A84C' },
      { key:'retirement', name:'Συνταξιοδοτικό Πλάνο', short:'Σύνταξη', score:r, color:'#4a9eda' },
    ];
    return cats.sort((a, b) => b.score - a.score);
  }

  // ════════════════════════════════════════════════════════════════
  // PODIUM HTML — βάθρο νικητών (1η/2η/3η θέση) χωρίς αριθμούς/ποσοστά
  // Χρησιμοποιείται και στη σελίδα αποτελεσμάτων και στο email πελάτη
  // ════════════════════════════════════════════════════════════════
  function buildPodiumHTML(h, l, r) {
    const ranked = rankNeeds(h, l, r);
    // Διάταξη βάθρου: 2η αριστερά, 1η μέση, 3η δεξιά
    const layout = [
      { rank: 2, height: 110, color: '#9aa5b1', medal: '🥈' },
      { rank: 1, height: 150, color: '#F47920', medal: '🥇' },
      { rank: 3, height: 80,  color: '#b08758', medal: '🥉' },
    ];
    const pillars = layout.map(pos => {
      const cat = ranked[pos.rank - 1];
      return `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:0">
          <div style="font-size:28px;margin-bottom:4px">${pos.medal}</div>
          <div style="font-size:13px;font-weight:700;color:#1a2238;margin-bottom:4px;text-align:center;line-height:1.2">${cat.short}</div>
          <div style="width:90%;max-width:120px;height:${pos.height}px;background:linear-gradient(180deg,${pos.color},${pos.color}cc);border-radius:8px 8px 0 0;display:flex;align-items:flex-start;justify-content:center;padding-top:8px;color:#fff;font-weight:800;font-size:18px">${pos.rank}η</div>
        </div>`;
    }).join('');
    return `
      <div class="podium-section" style="background:#f8f9fc;border-radius:12px;padding:24px 20px;margin:24px 0;border:1px solid #e0e6ed">
        <h3 style="text-align:center;margin:0 0 8px;font-size:16px;color:#1a2238;font-weight:700">Ιεράρχηση Ασφαλιστικών Αναγκών σας</h3>
        <p style="text-align:center;margin:0 0 18px;font-size:12px;color:#666">με βάση τις απαντήσεις σας</p>
        <div style="display:flex;align-items:flex-end;justify-content:center;gap:8px;max-width:420px;margin:0 auto;border-bottom:2px solid #cbd2da;padding-bottom:0">
          ${pillars}
        </div>
      </div>`;
  }

  // ════════════════════════════════════════════════════════════════
  // PODIUM HTML για EMAIL — table-based (συμβατό με Gmail/Outlook)
  // Ίδια εμφάνιση με το podium της σελίδας, χωρίς flexbox.
  // ════════════════════════════════════════════════════════════════
  function buildPodiumEmailHTML(h, l, r) {
    const ranked = rankNeeds(h, l, r);
    const layout = [
      { rank: 2, height: 110, color: '#9aa5b1', medal: '🥈' },
      { rank: 1, height: 150, color: '#F47920', medal: '🥇' },
      { rank: 3, height: 80,  color: '#b08758', medal: '🥉' },
    ];
    const cells = layout.map(pos => {
      const cat = ranked[pos.rank - 1];
      return `
            <td width="33%" valign="bottom" align="center" style="padding:0 4px">
              <div style="font-size:26px;line-height:1;margin-bottom:4px">${pos.medal}</div>
              <div style="font-size:13px;font-weight:bold;color:#1a2238;margin-bottom:4px;text-align:center">${cat.short}</div>
              <div style="width:96px;height:${pos.height}px;background:${pos.color};border-radius:8px 8px 0 0;color:#ffffff;font-weight:bold;font-size:18px;text-align:center;line-height:34px;margin:0 auto">${pos.rank}η</div>
            </td>`;
    }).join('');
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fc;border:1px solid #e0e6ed;border-radius:12px;margin:8px 0">
        <tr><td style="padding:20px 16px">
          <div style="text-align:center;font-size:16px;color:#1a2238;font-weight:bold;margin-bottom:4px">Ιεράρχηση Ασφαλιστικών Αναγκών σας</div>
          <div style="text-align:center;font-size:12px;color:#666666;margin-bottom:16px">με βάση τις απαντήσεις σας</div>
          <table role="presentation" align="center" width="420" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-bottom:2px solid #cbd2da">
            <tr>${cells}</tr>
          </table>
        </td></tr>
      </table>`;
  }

  // ════════════════════════════════════════════════════════════════
  // NEEDS HIERARCHY TEXT — ενιαίο κείμενο παραγράφου για το email πελάτη
  // ════════════════════════════════════════════════════════════════
  function buildNeedsHierarchyText(h, l, r) {
    const ranked = rankNeeds(h, l, r);
    const topScore = ranked[0].score;

    // Αν όλες είναι πολύ χαμηλές, μήνυμα ηρεμίας
    if (topScore < 45) {
      return 'Με βάση τις απαντήσεις που μου δώσατε, αυτή τη στιγμή δεν προκύπτει κάποια ιδιαίτερα '
           + 'επείγουσα ασφαλιστική ανάγκη — κάτι που είναι θετικό. Παρ’ όλα αυτά, οι ανάγκες του '
           + 'καθενός μας αλλάζουν με τον χρόνο, καθώς αλλάζουν η οικογενειακή και η επαγγελματική '
           + 'μας κατάσταση. Θα χαρώ να τα δούμε μαζί, ώστε να είστε προετοιμασμένος/η για ό,τι '
           + 'φέρει το μέλλον, με ηρεμία και σιγουριά.';
    }

    // Φιλικό, κατανοητό κείμενο προτεραιοτήτων με βάση τις απαντήσεις
    const order = ranked.map((c, i) => `${i + 1}) ${c.name}`).join(', ');
    const top    = ranked[0].name;
    const second = ranked[1].name;
    const third  = ranked[2].name;
    return `Σας ευχαριστώ για τον χρόνο σας. Αφού μελέτησα προσεκτικά τις απαντήσεις σας, κατέγραψα `
         + `τις ασφαλιστικές σας ανάγκες και τις ταξινόμησα ανάλογα με το πόσο σημαντική είναι η `
         + `καθεμία για εσάς αυτή τη στιγμή. Έτσι, η σειρά προτεραιότητας διαμορφώνεται ως εξής: `
         + `${order}. `
         + `Στην κορυφή βρίσκεται «${top}», που σημαίνει ότι εκεί αξίζει να εστιάσουμε κατά `
         + `προτεραιότητα. Ακολουθούν «${second}» και «${third}», τα οποία επίσης αξίζει να `
         + `λάβουμε υπόψη ώστε η προστασία σας να είναι όσο το δυνατόν πιο ολοκληρωμένη. `
         + `Η πρόταση κάλυψης που ακολουθεί ξεκινά ακριβώς από την πιο σημαντική σας ανάγκη και `
         + `είναι προσαρμοσμένη τόσο στις προτεραιότητές σας όσο και στον προϋπολογισμό σας.`;
  }

  // ════════════════════════════════════════════════════════════════
  // NEEDS HIERARCHY SHORT — μικρή σύνοψη για email συμβούλου
  // ════════════════════════════════════════════════════════════════
  function buildNeedsHierarchyShort(h, l, r) {
    const ranked = rankNeeds(h, l, r);
    const order = ranked.map((c, i) => `${i + 1}η ${c.name}`).join(' · ');
    return `Με βάση τις επιλογές του πελάτη, η ιεράρχηση των αναγκών του είναι: ${order}.`;
  }

  // ════════════════════════════════════════════════════════════════
  // CLIENT PROFILE — πλήρες, αναγνώσιμο προφίλ απαντήσεων (email συμβούλου)
  // ════════════════════════════════════════════════════════════════
  function buildClientProfileText(a, scores) {
    const L = {
      marital:  { single:'Άγαμος/η', married:'Έγγαμος/η', divorced:'Διαζευγμένος/η', widowed:'Χήρος/α', single_parent:'Μονογονέας' },
      occ:      { employee:'Μισθωτός/ή ιδ. τομέα', civil_servant:'Δημόσιος υπάλληλος', freelancer:'Ελ. επαγγελματίας', retired:'Συνταξιούχος', other:'Άλλο' },
      fund:     { none:'Καθόλου', little:'Λίγο', enough:'Αρκετά', fully:'Απόλυτα' },
      dedType:  { none:'Χωρίς εκπιπτόμενο', annual:'Ετήσιο', per_incident:'Ανά νοσηλεία' },
      scope:    { self:'Μόνο ο ίδιος', family:'Οικογένεια' },
      ci:       { em31:'Ναι — 31 ασθένειες', em7:'Ναι — 7 ασθένειες', none:'Όχι / αυτόματα' },
      yn:       { yes:'Ναι', no:'Όχι' },
      lifeCap:  { '50k':'€50.000', '100k':'€100.000', '150k':'€150.000', '200k':'€200.000+' },
      pension:  { none:'Καμία', small:'Μικρή', adequate:'Ικανοποιητική', big:'Μεγάλη' },
      savings:  { yes:'Έχει ήδη πρόγραμμα', soon:'Σκέφτεται να ξεκινήσει', family:'Οικογενειακό πρόγραμμα', no:'Δεν αποταμιεύει' },
      hosp:     { local_pub:'Τοπικό δημόσιο', city_pub:'Δημόσιο Αθ./Θεσ.', local_priv:'Τοπικό ιδιωτικό', big_priv:'Μεγάλο ιδιωτικό', abroad:'Εξωτερικό' },
      benefits: { diagnostics:'Διαγνωστικές', visits:'Επισκέψεις γιατρών', hospital:'Νοσηλεία', checkup:'Check-up', abroad:'Πρόσβαση στο εξωτερικό' },
      uncov:    { expenses:'Πάγια έξοδα', education:'Σπουδές παιδιών', loans:'Δάνεια', taxes:'Φορολογικές υποχρεώσεις' },
    };
    const g = (map, v) => (v != null && map[v]) ? map[v] : (v != null && v !== '' ? String(v) : '—');
    const lines = [];
    lines.push(`Ηλικία: ${a.age || '—'}`);
    lines.push(`Οικογ. κατάσταση: ${g(L.marital, a.marital_status)}`);
    if (a.spouse_age) lines.push(`Ηλικία συζύγου: ${a.spouse_age}`);
    lines.push(`Παιδιά: ${a.children || '0'}${(a.kids_ages && a.kids_ages.length) ? ' (ηλικίες: ' + a.kids_ages.join(', ') + ')' : ''}`);
    lines.push(`Επάγγελμα: ${g(L.occ, a.occupation)}`);
    lines.push(`Ικανοποίηση από δημόσιο ταμείο: ${g(L.fund, a.fund_satisfaction)}`);
    lines.push(`Νοσοκομείο για ήπιο θέμα: ${g(L.hosp, a.hospital_mild)}`);
    lines.push(`Νοσοκομείο για σοβαρό θέμα: ${g(L.hosp, a.hospital_severe)}`);
    if (a.health_benefits && a.health_benefits.length)
      lines.push(`Επιθυμητές παροχές: ${a.health_benefits.map(x => g(L.benefits, x)).join(', ')}`);
    lines.push(`Τύπος εκπιπτόμενου: ${g(L.dedType, a.deductible_type)}${a.deductible_amount ? ' (€' + a.deductible_amount + ')' : ''}`);
    lines.push(`Εύρος κάλυψης: ${g(L.scope, a.coverage_scope)}`);
    lines.push(`Ενδιαφέρον για κρίσιμες ασθένειες: ${g(L.ci, a.ci_pref)}`);
    lines.push(`Ενδιαφέρον για επίδομα νοσηλείας: ${g(L.yn, a.hospital_allowance)}`);
    lines.push(`Ανησυχία για απώλεια εισοδήματος: ${g(L.yn, a.income_concern)}`);
    if (a.uncovered_needs && a.uncovered_needs.length)
      lines.push(`Ακάλυπτες ανάγκες σε απώλεια: ${a.uncovered_needs.map(x => g(L.uncov, x)).join(', ')}`);
    lines.push(`Επιθυμητό κεφάλαιο Ζωής: ${g(L.lifeCap, a.life_capital)}`);
    lines.push(`Εκτίμηση μελλοντικής σύνταξης: ${g(L.pension, a.pension_estimate)}`);
    lines.push(`Αποταμιευτικό προφίλ: ${g(L.savings, a.savings_plan)}`);
    if (a.target_amount && a.target_amount !== 'none')
      lines.push(`Στόχος αποταμίευσης: €${parseInt(a.target_amount).toLocaleString('el-GR')} σε ${a.target_years || 15} χρόνια`);
    lines.push(`Μηνιαίος προϋπολογισμός: €${a.monthly_budget}/μήνα`);
    if (scores)
      lines.push(`\nScores αναγκών → Υγεία: ${Math.round(scores.health)}/100 · Ζωή: ${Math.round(scores.life)}/100 · Σύνταξη: ${Math.round(scores.retirement)}/100`);
    return lines.join('\n');
  }

  // ════════════════════════════════════════════════════════════════
  // RESULTS RENDERING
  // ════════════════════════════════════════════════════════════════
  function renderResults() {
    const s6 = document.getElementById('s6');
    if (!window.NN_ENGINE) {
      s6.innerHTML = '<div class="error-msg" style="display:block;margin-top:32px">⚠️ Σφάλμα φόρτωσης μηχανής. Ανανεώστε τη σελίδα.</div>';
      return;
    }

    collectAnswers();
    const a        = answers;
    const canonical = toCanonical(a);
    const proposal  = window.NN_ENGINE.buildProposal(canonical);
    const scores    = proposal.scores;

    const h = scores.health, l = scores.life, r = scores.retirement;
    const avg     = (h + l + r) / 3;
    const urg     = avg >= 70 ? 'ΚΡΙΣΙΜΗ' : avg >= 50 ? 'ΥΨΗΛΗ' : avg >= 30 ? 'ΜΕΤΡΙΑ' : 'ΧΑΜΗΛΗ';

    const totalMonthly = Math.ceil(proposal.totals.monthly);
    const totalAnnual  = proposal.totals.annual;

    // Ταξινόμηση proposal.lines σύμφωνα με την ιεράρχηση αναγκών
    const rankedNeeds = rankNeeds(h, l, r);
    const categoryOrder = {};
    rankedNeeds.forEach((c, idx) => {
      // Όλες οι health-related γραμμές μπαίνουν με την προτεραιότητα της Υγείας
      if (c.key === 'health') {
        categoryOrder.health = idx;
        categoryOrder.criticalIllness = idx + 0.1;
        categoryOrder.hospitalAllowance = idx + 0.2;
        categoryOrder.primaryCare = idx + 0.3;
      } else if (c.key === 'life') {
        categoryOrder.life = idx;
      } else if (c.key === 'retirement') {
        categoryOrder.savings = idx;
      }
    });
    proposal.lines.sort((a, b) => {
      const oa = categoryOrder[a.category] ?? 99;
      const ob = categoryOrder[b.category] ?? 99;
      return oa - ob;
    });

    // ── Proposal card lines ──────────────────────────────────────
    const linesHTML = proposal.lines.map(line => {
      const catLabel = CAT_LABELS[line.category] || line.category;
      const monthly  = Math.round(line.price.monthly);
      const capStr   = line.capital
        ? `<span style="color:var(--text-muted);font-weight:400;font-size:11px"> · Κεφ. €${Math.round(line.capital / 1000)}k</span>`
        : '';
      // Family member indicator (Εσείς / Σύζυγος / Παιδί N)
      const memberStr = (line.memberType && line.memberType !== 'client')
        ? `<span style="color:var(--primary);font-weight:600;font-size:11px"> · ${line.memberLabel}${line.memberAge ? ' (' + line.memberAge + ' ετών)' : ''}</span>`
        : '';
      // Discount badge
      const discStr = (line.price.discountPct && line.price.discountPct > 0)
        ? `<span style="color:#4caf50;font-weight:600;font-size:11px"> · -${Math.round(line.price.discountPct * 100)}%</span>`
        : '';
      return `
        <div class="prod-row">
          <span class="prod-cat">${catLabel}</span>
          <span class="prod-name">${line.label}${capStr}${memberStr}${discStr}</span>
          <span class="prod-price">€${monthly}/μήνα</span>
        </div>`;
    }).join('');

    const emptyCard = `
      <div class="prod-row">
        <span style="color:var(--text-muted);font-size:13px;padding:4px 0">
          Βάσει των απαντήσεών σας δεν προκύπτει τρέχουσα ανάγκη ασφαλιστικής κάλυψης.
          Επικοινωνήστε μαζί μου για αξιολόγηση.
        </span>
      </div>`;

    // Notes from engine
    const savingsNote   = proposal.notes.find(n => n.category === 'savings');
    const budgetWarning = proposal.warnings.find(w => w.type === 'budgetExceeded');

    const scenHTML = `
      <div class="scenario-card rec">
        <div class="rec-badge">✦ Εξατομικευμένη Πρόταση</div>
        <div class="scen-header" style="margin-top:8px">
          <div class="scen-letter">Α</div>
          <div>
            <div class="scen-title">Προτεινόμενη Κάλυψη</div>
            <div class="scen-sub">Βέλτιστη ισορροπία κάλυψης &amp; κόστους</div>
          </div>
        </div>
        <div class="products">
          ${proposal.lines.length > 0 ? linesHTML : emptyCard}
        </div>
        ${proposal.lines.length > 0 ? `
        <div class="scen-total">
          <div class="total-annual">€${totalAnnual.toLocaleString('el-GR')}/έτος</div>
          <div class="total-monthly">€${totalMonthly}<span>/μήνα</span></div>
        </div>` : ''}
        ${savingsNote   ? `<div class="ret-note">📌 ${savingsNote.message}</div>` : ''}
        ${budgetWarning ? `<div class="ret-note" style="border-left-color:var(--danger);color:var(--danger)">${budgetWarning.message}</div>` : ''}
      </div>`;

    // ── Savings section (αν δήλωσε στόχο) ───────────────────────
    const targetAmt = (a.target_amount && a.target_amount !== 'none') ? parseInt(a.target_amount) : 0;
    const targetYrs = parseInt(a.target_years) || 15;
    const savingsLine = proposal.lines.find(l => l.category === 'savings');
    const offerSavingsMonthly = savingsLine ? savingsLine.price.monthly : 0;
    const hasOfferSavings = offerSavingsMonthly > 0;
    const savScenarios = calcSavingsScenarios(targetAmt, targetYrs, offerSavingsMonthly);
    let savingsHTML = '';
    if (savScenarios && hasOfferSavings) {
      // ΠΛΑΙΣΙΟ 1 — τι κεφάλαιο χτίζει η προσφορά + στόχος/χρόνια από κάτω
      const frame1 = `
      <div class="savings-section">
        <div class="savings-title">🎯 Σενάρια Αποταμίευσης</div>
        <div class="savings-sub">Το προτεινόμενο αποταμιευτικό ποσό της προσφοράς (<strong>€${offerSavingsMonthly.toLocaleString('el-GR')}/μήνα</strong>) είναι αυτό που <strong>υπολείπεται αφού καλυφθούν οι ανάγκες Υγείας και Ζωής</strong>. Δείτε τι κεφάλαιο μπορείτε να χτίσετε σε <strong>${targetYrs} χρόνια</strong>, με 3 διαφορετικές επενδυτικές στρατηγικές.</div>
        <div class="savings-grid">
          ${savScenarios.map(s => `
            <div class="savings-card" style="--scen-color:${s.color}">
              <div class="savings-label">${s.label}</div>
              <div class="savings-pmt">€${s.fv.toLocaleString('el-GR')}</div>
              <div class="savings-rate">προβλεπόμενο κεφάλαιο · απόδοση ${(s.annual * 100).toFixed(2)}% ετησίως</div>
              <div class="savings-desc">${s.desc}</div>
            </div>`).join('')}
        </div>
        <div class="savings-target">
          Στόχος σας: <strong>€${targetAmt.toLocaleString('el-GR')}</strong> σε <strong>${targetYrs} χρόνια</strong>
        </div>
      </div>`;
      // ΠΛΑΙΣΙΟ 2 — πόσα χρήματα χρειάζονται ακόμα για τον στόχο
      const frame2 = `
      <div class="savings-section">
        <div class="savings-title">📊 Πόσα χρειάζονται ακόμα για τον στόχο σας</div>
        <div class="savings-sub">Επιπλέον μηνιαία αποταμίευση για να φτάσετε τα <strong>€${targetAmt.toLocaleString('el-GR')}</strong> σε <strong>${targetYrs} χρόνια</strong>, ανά στρατηγική.</div>
        <div class="savings-grid">
          ${savScenarios.map(s => `
            <div class="savings-card" style="--scen-color:${s.color}">
              <div class="savings-label">${s.label}</div>
              ${s.reachesTarget
                ? `<div class="savings-pmt" style="color:#3ec46d">✅</div>
                   <div class="savings-ok">Καλύπτει τον στόχο σας</div>`
                : `<div class="savings-pmt">+€${s.extraMonthly.toLocaleString('el-GR')}<span>/μήνα</span></div>
                   <div class="savings-rate">σύνολο €${s.requiredMonthly.toLocaleString('el-GR')}/μήνα</div>
                   <div class="savings-desc">Υπολείπονται <strong>€${s.gap.toLocaleString('el-GR')}</strong> κεφάλαιο από τον στόχο.</div>`}
            </div>`).join('')}
        </div>
      </div>`;
      savingsHTML = frame1 + frame2;
    } else if (savScenarios) {
      // Χωρίς διαθέσιμο ποσό προσφοράς — απαιτούμενο μηνιαίο ποσό για τον στόχο
      savingsHTML = `
      <div class="savings-section">
        <div class="savings-title">🎯 Σενάρια Αποταμίευσης</div>
        <div class="savings-sub">Με βάση τον στόχο σας, δείτε το μηνιαίο ποσό που χρειάζεται για να τον πετύχετε σε <strong>${targetYrs} χρόνια</strong>, με 3 διαφορετικές επενδυτικές στρατηγικές.</div>
        <div class="savings-grid">
          ${savScenarios.map(s => `
            <div class="savings-card" style="--scen-color:${s.color}">
              <div class="savings-label">${s.label}</div>
              <div class="savings-pmt">€${s.requiredMonthly.toLocaleString('el-GR')}<span>/μήνα</span></div>
              <div class="savings-rate">για τον στόχο σας · απόδοση ${(s.annual * 100).toFixed(2)}% ετησίως</div>
              <div class="savings-desc">${s.desc}</div>
            </div>`).join('')}
        </div>
        <div class="savings-target">
          Στόχος σας: <strong>€${targetAmt.toLocaleString('el-GR')}</strong> σε <strong>${targetYrs} χρόνια</strong>
        </div>
      </div>`;
    }

    // ── Build proposalText for email/sheets ──────────────────────
    const familyNote = proposal.notes.find(n => n.category === 'familyDiscount');
    const proposalText =
      proposal.lines.map(l => {
        const member = (l.memberType && l.memberType !== 'client') ? ` [${l.memberLabel}]` : '';
        const disc   = (l.price.discountPct && l.price.discountPct > 0)
          ? ` (-${Math.round(l.price.discountPct * 100)}%)` : '';
        const note   = (l.category === 'savings')
          ? ' (το ποσό που υπολείπεται αφού καλυφθούν Υγεία & Ζωή)' : '';
        return `• ${l.label}${l.capital ? ' ' + Math.round(l.capital / 1000) + 'k' : ''}${member}${disc}: €${l.price.monthly}/μήνα${note}`;
      }).join('\n') +
      `\nΣύνολο: €${totalMonthly}/μήνα` +
      (savScenarios ? (hasOfferSavings
        ? '\n\n🎯 Σενάρια Αποταμίευσης'
          + '\nΜε €' + offerSavingsMonthly.toLocaleString('el-GR') + '/μήνα, σε ' + targetYrs + ' χρόνια χτίζετε:\n'
          + savScenarios.map(s => `• ${s.label} (${(s.annual*100).toFixed(2)}%): €${s.fv.toLocaleString('el-GR')}`).join('\n')
          + '\n\nΠόσα χρειάζονται ακόμα για στόχο €' + targetAmt.toLocaleString('el-GR') + ':\n'
          + savScenarios.map(s => `• ${s.label}: ` + (s.reachesTarget
              ? '✅ καλύπτει τον στόχο'
              : `+€${s.extraMonthly.toLocaleString('el-GR')}/μήνα (υπολείπονται €${s.gap.toLocaleString('el-GR')})`)).join('\n')
        : '\n\n🎯 Σενάρια Αποταμίευσης — απαιτούμενο μηνιαίο ποσό για στόχο €' + targetAmt.toLocaleString('el-GR')
          + ' σε ' + targetYrs + ' χρόνια:\n'
          + savScenarios.map(s => `• ${s.label} (${(s.annual*100).toFixed(2)}%): €${s.requiredMonthly.toLocaleString('el-GR')}/μήνα`).join('\n'))
        : '') +
      (familyNote   ? '\n👨‍👩‍👧 ' + familyNote.message : '') +
      (savingsNote   ? '\n📌 ' + savingsNote.message : '') +
      (budgetWarning ? '\n⚠️ ' + budgetWarning.message : '');

    // ── Render ───────────────────────────────────────────────────
    s6.innerHTML = `
      <div class="step-label">Τα Αποτελέσματά σας</div>
      <h2 class="screen-title">Η Ανάλυσή σας${a.client_name ? ', ' + a.client_name.split(' ')[0] : ''}</h2>
      <p class="screen-sub">Βάσει των απαντήσεών σας δημιουργήθηκε εξατομικευμένη πρόταση κάλυψης.</p>

      ${buildPodiumHTML(h, l, r)}

      <div class="section-label">Προτεινόμενη Κάλυψη</div>
      <div class="scenarios">${scenHTML}</div>

      ${savingsHTML}

      <div class="contact-cta-section">
        <div class="contact-cta-title">📞 Επικοινωνήστε μαζί μου</div>
        <div class="contact-cta-row">
          <div class="contact-card" onclick="revealContact('phone',this)">
            <div class="contact-card-icon">📱</div>
            <div class="contact-card-label">Τηλεφωνική Επικοινωνία</div>
            <div class="contact-reveal" id="reveal-phone"><a href="tel:${BRAND.phone}">${BRAND.phone}</a></div>
            <div class="contact-card-hint">Πατήστε για τον αριθμό</div>
          </div>
          <div class="contact-card" onclick="revealContact('email',this)">
            <div class="contact-card-icon">✉️</div>
            <div class="contact-card-label">Email</div>
            <div class="contact-reveal" id="reveal-email"><a href="mailto:${BRAND.email}">${BRAND.email}</a></div>
            <div class="contact-card-hint">Πατήστε για το email</div>
          </div>
        </div>
        <p style="text-align:center;margin-top:14px;font-size:11px;color:var(--text-muted)">${BRAND.advisor} — ${BRAND.name}</p>
      </div>

      <div id="email-status" class="email-status">📧 Αποστολή email…</div>

      <div class="indicative-banner">
        📌 <strong>Σημαντικό:</strong> Η παραπάνω πρόταση είναι <strong>ενδεικτική</strong> και βασίζεται στις απαντήσεις που δώσατε.<br/>
        Για την <strong>πραγματική προσφορά</strong> προσαρμοσμένη στις λεπτομέρειες σας, παρακαλώ επικοινωνήστε μαζί μου.
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
        <button class="btn btn-ghost" onclick="resetForm()">🔄 Νέα Αξιολόγηση</button>
        <button class="btn btn-accent" onclick="window.print()">🖨️ Εκτύπωση</button>
      </div>`;

    // Integrations
    const resultData = {
      ...a,
      health_score:  h, life_score: l, retirement_score: r,
      urgency:       urg, proposal_text: proposalText,
      needs_hierarchy:       buildNeedsHierarchyText(h, l, r),
      needs_hierarchy_short: buildNeedsHierarchyShort(h, l, r),
      client_profile:        buildClientProfileText(a, scores),
      podium_html:           buildPodiumEmailHTML(h, l, r),
      advisor_name:  BRAND.advisor,
      advisor_email: BRAND.email,
      advisor_phone: BRAND.phone,
    };
    window.NN_INTEGRATIONS?.saveToSheets(resultData);
    window.NN_INTEGRATIONS?.sendEmails(resultData);

    // Εμφάνιση rating modal 8 δευτερόλεπτα αφού φορτώσουν τα αποτελέσματα
    setTimeout(openRatingModal, 8000);
  }

  // ════════════════════════════════════════════════════════════════
  // RATING MODAL
  // ════════════════════════════════════════════════════════════════
  let _ratingValue = 0;
  let _ratingSent  = false;
  const RATING_LABELS = {
    1: 'Καθόλου ικανοποιητικό',
    2: 'Μέτριο',
    3: 'Καλό',
    4: 'Πολύ καλό',
    5: 'Εξαιρετικό!',
  };

  function openRatingModal() {
    if (_ratingSent) return;
    const modal = document.getElementById('rating-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    // Setup star click listeners (idempotent)
    const stars = modal.querySelectorAll('.rating-star');
    stars.forEach(star => {
      star.onclick = () => setRating(parseInt(star.dataset.value));
      star.onmouseenter = () => previewRating(parseInt(star.dataset.value));
    });
    document.getElementById('rating-stars').onmouseleave = () => previewRating(_ratingValue);
  }

  function setRating(val) {
    _ratingValue = val;
    previewRating(val);
    document.getElementById('rating-label').textContent = RATING_LABELS[val] || '';
    document.getElementById('rating-submit').disabled = false;
  }

  function previewRating(val) {
    document.querySelectorAll('.rating-star').forEach(s => {
      const v = parseInt(s.dataset.value);
      s.classList.toggle('active', v <= val);
    });
  }

  function closeRatingModal() {
    const modal = document.getElementById('rating-modal');
    if (modal) modal.style.display = 'none';
  }

  function submitRating() {
    if (_ratingSent || _ratingValue === 0) return;
    _ratingSent = true;
    const comment = (document.getElementById('rating-comment')?.value || '').trim();
    const payload = {
      rating: _ratingValue,
      comment: comment,
      client_name:  answers.client_name  || '',
      client_email: answers.client_email || '',
      date: new Date().toLocaleString('el-GR'),
    };
    window.NN_INTEGRATIONS?.saveRating(payload);

    // Δείξε το thank-you screen
    const thanks = document.getElementById('rating-thanks');
    if (thanks) thanks.style.display = 'flex';
    setTimeout(closeRatingModal, 2200);
  }

  // ════════════════════════════════════════════════════════════════
  // RESET
  // ════════════════════════════════════════════════════════════════
  function resetForm() {
    answers = { age: 35, monthly_budget: 100 };
    _submitted = false;
    _ratingValue = 0;
    _ratingSent  = false;
    const ratingModal = document.getElementById('rating-modal');
    if (ratingModal) ratingModal.style.display = 'none';
    const ratingThanks = document.getElementById('rating-thanks');
    if (ratingThanks) ratingThanks.style.display = 'none';
    document.querySelectorAll('.rating-star').forEach(s => s.classList.remove('active'));
    const ratingLabel = document.getElementById('rating-label');
    if (ratingLabel) ratingLabel.innerHTML = '&nbsp;';
    const ratingComment = document.getElementById('rating-comment');
    if (ratingComment) ratingComment.value = '';
    const ratingSubmit = document.getElementById('rating-submit');
    if (ratingSubmit) ratingSubmit.disabled = true;
    window.NN_INTEGRATIONS?.reset();
    document.querySelectorAll('.opt.sel').forEach(el => el.classList.remove('sel'));
    document.querySelectorAll('input[type=radio], input[type=checkbox]').forEach(inp => inp.checked = false);
    document.querySelectorAll('.form-input').forEach(inp => inp.value = '');
    const ageInputEl = document.getElementById('age-input');
    if (ageInputEl) ageInputEl.value = '';
    answers.age = null;
    document.getElementById('budget-slider').value = 100;
    document.getElementById('budget-display').textContent = '100';
    document.getElementById('annual-display').textContent = '1.200';
    document.getElementById('spouse-section').style.display = 'none';
    document.getElementById('kids-section').style.display = 'none';
    document.getElementById('kids-grid').innerHTML = '';
    const dedA = document.getElementById('deductible-amount-annual');
    const dedP = document.getElementById('deductible-amount-perincident');
    if (dedA) dedA.style.display = 'none';
    if (dedP) dedP.style.display = 'none';
    showStep(0);
  }

  // ════════════════════════════════════════════════════════════════
  // INIT
  // ════════════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    const ageInput = document.getElementById('age-input');
    if (ageInput) ageInput.addEventListener('input', () => {
      answers.age = parseInt(ageInput.value) || null;
    });

    const budgetSlider = document.getElementById('budget-slider');
    budgetSlider.addEventListener('input', () => {
      const v = parseInt(budgetSlider.value);
      document.getElementById('budget-display').textContent = v;
      document.getElementById('annual-display').textContent = (v * 12).toLocaleString('el-GR');
      answers.monthly_budget = v;
    });

    document.querySelectorAll('input[name="marital_status"]').forEach(r => {
      r.addEventListener('change', () => {
        document.getElementById('spouse-section').style.display =
          r.value === 'married' ? 'block' : 'none';
      });
    });

    const tyEl = document.getElementById('target-years-slider');
    if (tyEl) tyEl.addEventListener('input', () => {
      document.getElementById('target-years-display').textContent = tyEl.value;
      answers.target_years = parseInt(tyEl.value);
    });

    showStep(0);
  });

  // ════════════════════════════════════════════════════════════════
  // GLOBAL EXPORTS — needed for inline onclick handlers in HTML
  // ════════════════════════════════════════════════════════════════
  window.nextStep       = nextStep;
  window.prevStep       = prevStep;
  window.submitForm     = submitForm;
  window.revealContact  = revealContact;
  window.selOpt         = selOpt;
  window.togMulti       = togMulti;
  window.updateKidsAges = updateKidsAges;
  window.toggleDeductibleAmount = toggleDeductibleAmount;
  window.resetForm      = resetForm;
  window.openRatingModal  = openRatingModal;
  window.closeRatingModal = closeRatingModal;
  window.submitRating     = submitRating;

})();

/**
 * NN Hellas — Ασφαλιστικό Ερωτηματολόγιο
 * ════════════════════════════════════════════════════════════════════
 *  engine.js — ΜΗΧΑΝΗ ΚΑΝΟΝΩΝ (Επίπεδο 1)
 * ════════════════════════════════════════════════════════════════════
 *
 *  Όλη η επιχειρηματική λογική (scoring, επιλογή προϊόντων, τιμολόγηση,
 *  επικύρωση συμβατοτήτων, παραγωγή πρότασης) ζει εδώ.
 *
 *  Καμία «καρφωτή» τιμή/προϊόν/κανόνας — όλα διαβάζονται από `NN_DATA`
 *  (window.NN_DATA, ορίζεται στο data.js).
 *
 *  Δημόσιο API:
 *    NN_ENGINE.calcScores(answers)      → scores + flags
 *    NN_ENGINE.buildProposal(answers)   → ένα προτεινόμενο πακέτο
 *    NN_ENGINE.isCompatible(p, a)       → boolean
 *    NN_ENGINE.calcPrice(id, ctx)       → { net, gross, monthly, annual }
 *
 *  Δες επίσης: DATA_MAPPING.md
 * ════════════════════════════════════════════════════════════════════
 */
(function (root) {
  'use strict';

  const DATA = root.NN_DATA;
  if (!DATA) {
    throw new Error('engine.js: δεν βρέθηκε NN_DATA — βεβαιωθείτε ότι το data.js έχει φορτωθεί πρώτο.');
  }

  // ════════════════════════════════════════════════════════════════════
  // 0. ΒΟΗΘΗΤΙΚΑ
  // ════════════════════════════════════════════════════════════════════

  /** Ασφαλής ανάκτηση τιμής από αντικείμενο, με default. */
  function get(obj, key, fallback) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
    return fallback;
  }

  /** Στρογγυλοποίηση σε 2 δεκαδικά. */
  function round2(n) { return Math.round(n * 100) / 100; }

  /** Στρογγυλοποίηση σε ακέραιο ευρώ. */
  function roundEur(n) { return Math.round(n); }

  /**
   * Γραμμική παρεμβολή σε πίνακα ηλικίας:
   *   table: { 20: x, 25: y, 30: z, ... }
   *   age:   ζητούμενη ηλικία (αριθμός)
   *
   *  - Αν υπάρχει ακριβώς το age → επιστρέφει την τιμή.
   *  - Αν age < min(keys) → επιστρέφει την τιμή του min.
   *  - Αν age > max(keys) → επιστρέφει την τιμή του max.
   *  - Αλλιώς γραμμική: y = y1 + (y2 - y1) × (age - x1) / (x2 - x1)
   */
  function interpolateAge(table, age) {
    if (!table) return null;
    if (table[age] !== undefined) return table[age];

    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (keys.length === 0) return null;
    if (age <= keys[0])  return table[keys[0]];
    if (age >= keys[keys.length - 1]) return table[keys[keys.length - 1]];

    // Βρες τα δύο κλειδιά που περικλείουν την ηλικία
    let lower = keys[0], upper = keys[keys.length - 1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (keys[i] <= age && age <= keys[i + 1]) {
        lower = keys[i];
        upper = keys[i + 1];
        break;
      }
    }
    const y1 = table[lower];
    const y2 = table[upper];
    return y1 + (y2 - y1) * (age - lower) / (upper - lower);
  }

  // ════════════════════════════════════════════════════════════════════
  // 1. SCORING — υπολογισμός 3 score (Υγεία / Ζωή / Σύνταξη)
  // ════════════════════════════════════════════════════════════════════
  //
  // Επιστρέφει: { health, life, retirement,
  //              includeHealth, includeLife, includeSavingsNote,
  //              checkpoints: { health: [...], life: [...] } }
  //
  // Πηγή κανόνων: DATA.scoring (από nn_hellas_scoring.csv + checkpoints.csv)
  // ────────────────────────────────────────────────────────────────────
  function calcScores(answers) {
    const S = DATA.scoring;
    const a = answers || {};

    // --- Υγεία -----------------------------------------------------
    let health = 0;
    health += get(S.health.fundSatisfaction, a.fundSatisfaction, 0);
    health += get(S.health.hospitalMild,     a.hospitalMild,     0);
    health += get(S.health.hospitalSevere,   a.hospitalSevere,   0);
    // desiredBenefits αφαιρέθηκε από scoring (v3)

    // --- Ζωή ------------------------------------------------------
    let life = 0;
    life += get(S.life.maritalStatus, a.maritalStatus, 0);
    const childrenKey = String(a.children ?? 0);
    life += get(S.life.children, childrenKey, 0);
    life += get(S.life.incomeConcern, a.incomeConcern, 0);
    const uncov = Array.isArray(a.uncoveredNeeds) ? a.uncoveredNeeds : [];
    life += Math.min(
      uncov.length * S.life.uncoveredNeedPerItem,
      S.life.uncoveredNeedMax
    );
    life += get(S.life.lifeCapital, a.lifeCapital, 0);

    // --- Σύνταξη --------------------------------------------------
    let retirement = 0;
    retirement += get(S.retirement.pensionEstimate, a.pensionEstimate, 0);
    retirement += get(S.retirement.savingsPlan,     a.savingsPlan,     0);
    const age = Number(a.age) || 0;
    if (age > S.retirement.ageOverBonus.age) {
      retirement += S.retirement.ageOverBonus.bonus;
    }

    // --- Μέγιστα δυνατά scores (για ποσοστά) ----------------------
    // v3: max = 100 σε κάθε κατηγορία
    const maxHealth = 40 + 30 + 30;        // fund + mild + severe = 100
    const maxLife   = 9  + 13 + 32 + 16 + 28; // marital+children+income+uncov+capital = 98
    const maxRetire = 59 + 30 + 11;        // pension + savings + age bonus = 100

    // --- Checkpoints (auto-include) ------------------------------
    function fieldEqualsAny(field, values) {
      const v = a[field];
      if (Array.isArray(values)) return values.includes(String(v));
      return false;
    }
    function checkpointHit(checkpoint) {
      if (checkpoint.equalsAny) return fieldEqualsAny(checkpoint.field, checkpoint.equalsAny);
      if (checkpoint.notEquals !== undefined) {
        return String(a[checkpoint.field]) !== String(checkpoint.notEquals);
      }
      return false;
    }

    const cpHealth = (S.checkpoints.health || []).filter(checkpointHit);
    const cpLife   = (S.checkpoints.life   || []).filter(checkpointHit);

    // --- Inclusion flags ------------------------------------------
    const healthPct = maxHealth > 0 ? health / maxHealth : 0;
    const lifePct   = maxLife   > 0 ? life   / maxLife   : 0;

    const includeHealth = (healthPct >= S.thresholds.healthIncludePct) || cpHealth.length > 0;
    const includeLife   = (lifePct   >= S.thresholds.lifeIncludePct)   || cpLife.length   > 0;
    const includeSavingsNote = retirement >= S.thresholds.savingsNoteMin;

    return {
      health, life, retirement,
      healthPct: round2(healthPct * 100),
      lifePct:   round2(lifePct   * 100),
      includeHealth, includeLife, includeSavingsNote,
      checkpoints: { health: cpHealth, life: cpLife },
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // 2. ΣΥΜΒΑΤΟΤΗΤΑ
  // ════════════════════════════════════════════════════════════════════
  function isCompatible(programId, attachmentId) {
    const row = DATA.compatibilityMatrix[programId];
    if (!row) return false;
    return row[attachmentId] === true;
  }

  // ════════════════════════════════════════════════════════════════════
  // 3. ΤΙΜΟΛΟΓΗΣΗ — calcPrice(productId, ctx)
  // ════════════════════════════════════════════════════════════════════
  //
  // ctx: { age, capital?, isFirstYear? }
  //
  // Υποστηριζόμενα kinds:
  //   - 'ageTable'      → table[age], με γραμμική παρεμβολή σε missing
  //   - 'rateOnCapital' → (capital × rate(age) + surcharge) × (1 + guaranteeFund)
  //   - 'ratePerTenK'   → rate(age) × (capital / 10000)
  //   - 'flat'          → annual
  //
  // Επιστρέφει: { net, gross, monthly, annual, source } ή null αν αποτυχία.
  // ────────────────────────────────────────────────────────────────────
  function findProduct(productId) {
    if (DATA.prices.programs[productId])    return { spec: DATA.prices.programs[productId],    type: 'program' };
    if (DATA.prices.attachments[productId]) return { spec: DATA.prices.attachments[productId], type: 'attachment' };
    return null;
  }

  function calcPrice(productId, ctx) {
    const found = findProduct(productId);
    if (!found) return null;
    const spec = found.spec;
    const age  = Number((ctx && ctx.age) || 0);
    const cap  = Number((ctx && ctx.capital) || 0);

    let netAnnual = null;

    switch (spec.kind) {
      case 'ageTable': {
        if (!spec.table) return null;
        netAnnual = interpolateAge(spec.table, age);
        if (netAnnual == null) return null;
        break;
      }

      case 'rateOnCapital': {
        // Life family: (capital × rate + surcharge) × (1 + guaranteeFund)
        const rate = interpolateAge(spec.rates, age);
        if (rate == null || cap <= 0) return null;
        const surcharge = spec.surcharge || 0;
        const guarFund  = spec.guaranteeFund || 0;
        let base = cap * rate + surcharge;
        base = base * (1 + guarFund);
        if (ctx && ctx.isFirstYear && spec.contractFee) {
          base += spec.contractFee;
        }
        netAnnual = base;
        break;
      }

      case 'ratePerTenK': {
        // ExtraMed: rate × (capital / 10000)
        const rate = interpolateAge(spec.rates, age);
        if (rate == null || cap <= 0) return null;
        netAnnual = rate * (cap / 10000);
        break;
      }

      case 'flat': {
        if (spec.annual == null) return null;
        netAnnual = spec.annual;
        break;
      }

      default:
        return null;
    }

    const tax       = spec.tax || 0;
    const grossAnn  = netAnnual * (1 + tax);
    // Σημαντικό: για τα προϊόντα του νέου τιμοκαταλόγου 2026-06 (note: 'ΜΙΚΤΑ...')
    // οι τιμές είναι ΗΔΗ μικτές. Σε αυτή την περίπτωση το tax=0 ή στα notes φαίνεται.
    // Στο data.js έχουμε ορίσει tax=0.15 για όσα δεν περιλαμβάνουν φόρο.
    // Όμως για τα ALL PRODUCTS τιμολόγια (ΜΙΚΤΑ), το note σημαίνει «ήδη ΜΙΚΤΑ».
    // Αν note περιέχει 'ΜΙΚΤΑ', θεωρούμε netAnnual ως gross.
    let realGross = grossAnn;
    if (spec.note && /ΜΙΚΤΑ/i.test(spec.note)) {
      realGross = netAnnual; // ήδη ΜΙΚΤΟ
    }

    return {
      net:     round2(netAnnual),
      gross:   roundEur(realGross),
      annual:  roundEur(realGross),
      monthly: round2(realGross / 12),
      source:  spec.kind,
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // 4. ΕΠΙΛΟΓΗ ΠΡΟΪΟΝΤΩΝ
  // ════════════════════════════════════════════════════════════════════

  /** Επιλογή κύριου health program βάσει εκπιπτόμενου + budget.
   *  Νέα λογική (v3): αν ο πελάτης έχει επιλέξει συγκεκριμένο
   *  deductibleAmount → άμεση αντιστοίχιση με συγκεκριμένο πρόγραμμα
   *  (CROSS 1/2/3/4 ή HEALTH 500/1500 ή CROSS PLUS).
   *  Διαφορετικά: fallback στην παλιά λογική των tiers.
   */
  function selectHealthProgram(answers, monthlyBudget) {
    const age        = Number(answers.age) || 0;
    const deductible = answers.deductibleType;
    const amount     = answers.deductibleAmount;
    if (!deductible) return null;

    // ── ΝΕΟΣ ΤΡΟΠΟΣ: άμεση αντιστοίχιση από επιλεγμένο ποσό ────────
    if (amount && DATA.deductibleProgramMap && DATA.deductibleProgramMap[deductible]) {
      const direct = DATA.deductibleProgramMap[deductible][String(amount)];
      if (direct && DATA.programs[direct]) {
        const prog = DATA.programs[direct];
        // Έλεγχος μόνο για ηλικία· τιμά την επιλογή του πελάτη ως προς budget.
        if (!prog.maxAge || age <= prog.maxAge) {
          return direct;
        }
        // Αν ξεπερνά τη maxAge, αφήνουμε να πέσει στο fallback παρακάτω
        // (π.χ. για πελάτες >65 ή >70 ετών)
      }
    }

    // ── FALLBACK: παλιά λογική (όταν δεν υπάρχει συγκεκριμένο ποσό) ──
    const tier = DATA.healthTiers[deductible];
    if (!tier || tier.length === 0) return null;

    const candidates = tier.filter(progId => {
      const prog = DATA.programs[progId];
      if (!prog) return false;
      if (prog.maxAge && age > prog.maxAge) return false;
      return true;
    });

    if (candidates.length === 0) return null;

    const budgetCap = monthlyBudget * 0.70;

    for (const progId of candidates) {
      const p = calcPrice(progId, { age });
      if (!p) continue;
      if (p.monthly <= budgetCap) return progId;
    }
    // Αν κανένα δεν χωράει στο budget → φθηνότερο
    let cheapest = null;
    let cheapestPrice = Infinity;
    candidates.forEach(progId => {
      const p = calcPrice(progId, { age });
      if (p && p.monthly < cheapestPrice) {
        cheapestPrice = p.monthly;
        cheapest = progId;
      }
    });
    return cheapest;
  }

  /** Επιλογή critical illness rider ΜΟΝΟ βάσει της απάντησης P7 (όχι auto από score). */
  function selectCriticalIllness(answers, scores) {
    const pref = answers.criticalIllnessPref;
    if (pref === 'em31') return 'extramed31';
    if (pref === 'em7')  return 'extramed7';
    // pref === 'none' ή undefined → καμία αυτόματη πρόταση
    return null;
  }

  /** Επιλογή MediPlan βάσει P9 + remaining budget. */
  function selectHospitalAllowance(answers, remainingMonthlyBudget) {
    if (answers.hospitalAllowancePref !== 'yes') return null;
    const age = Number(answers.age) || 0;
    // Προτείνουμε ΠΑΝΤΑ το μεγαλύτερο επίδομα· αν δεν χωράει στο budget,
    // κατεβαίνουμε στο αμέσως φθηνότερο (2500 > 2000 > 1500 > 1000 > 500).
    const tiers = ['mediPlan2500','mediPlan2000','mediPlan1500','mediPlan1000','mediPlan500'];
    for (const tierId of tiers) {
      const p = calcPrice(tierId, { age });
      if (!p) continue;
      if (p.monthly <= remainingMonthlyBudget) return tierId;
    }
    return null;
  }

  /** Επιλογή Life product (life vs lifePlus) βάσει age + scores. */
  function selectLifeProduct(answers) {
    const age = Number(answers.age) || 0;
    // LifePlus έχει disability cover αλλά maxEntryAge=60
    // Αν ο πελάτης είναι ≤60 → lifePlus (καλύτερη κάλυψη)
    // Αν >60 → life (max είσοδος 65)
    const lifePlus = DATA.programs.lifePlus;
    if (lifePlus && age <= lifePlus.maxAge) return 'lifePlus';
    const life = DATA.programs.life;
    if (life && age <= life.maxAge) return 'life';
    return null;
  }

  // ════════════════════════════════════════════════════════════════════
  // 4b. ΥΠΟΛΟΓΙΣΜΟΣ FAMILY DISCOUNT
  // ════════════════════════════════════════════════════════════════════
  /** Επιστρέφει το ποσοστό έκπτωσης βάσει συνολικού αριθμού μελών. */
  function getFamilyDiscountPct(totalMembers, programId) {
    const fd = DATA.familyDiscounts;
    if (!fd || !fd.eligiblePrograms.includes(programId)) return 0;
    const table = fd.byTotalMembers || {};
    // Αν >= max key → χρησιμοποίησε το max
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (totalMembers <= 0) return 0;
    const maxKey = keys[keys.length - 1];
    const key = totalMembers >= maxKey ? maxKey : totalMembers;
    return table[key] || 0;
  }

  /** Εφαρμόζει έκπτωση σε ένα price object. */
  function applyDiscount(price, pct) {
    if (!price || pct <= 0) return price;
    const factor = 1 - pct;
    return {
      net:     round2(price.net     * factor),
      gross:   roundEur(price.gross   * factor),
      annual:  roundEur(price.annual  * factor),
      monthly: round2(price.monthly * factor),
      source:  price.source,
      discountPct: pct,
    };
  }

  // ════════════════════════════════════════════════════════════════════
  // 5. ΣΥΝΘΕΣΗ ΠΡΟΤΑΣΗΣ
  // ════════════════════════════════════════════════════════════════════
  // Σειρά: 1) ΒΑΣΙΚΟ health πελάτη  2) ΒΑΣΙΚΟ life πελάτη  3) Μέλη οικογένειας
  //         4) Riders (CI, MediPlan, PrimaryCare) - μόνο αν χωράει budget
  //         5) Αποταμίευση - μόνο αν χωράει budget
  function buildProposal(answers) {
    const age = Number(answers.age) || 0;
    const monthlyBudget = Number(answers.monthlyBudget) || 80;
    const scores = calcScores(answers);

    const proposal = {
      meta: {
        age, monthlyBudget,
        generatedAt: new Date().toISOString(),
      },
      scores,
      lines: [],            // λίστα γραμμών πρότασης
      notes: [],
      totals: { monthly: 0, annual: 0 },
      warnings: [],
    };

    // Helper: προσθέτει γραμμή στο proposal και ενημερώνει totals
    function pushLine(line) {
      proposal.lines.push(line);
      proposal.totals.monthly += line.price.monthly;
      proposal.totals.annual  += line.price.annual;
    }
    function remainingBudget() {
      return monthlyBudget - proposal.totals.monthly;
    }

    // ═══ STAGE 1: ΒΑΣΙΚΟ HEALTH ΠΕΛΑΤΗ ════════════════════════════
    let healthProgId = null;
    if (scores.includeHealth) {
      healthProgId = selectHealthProgram(answers, monthlyBudget);
      if (healthProgId) {
        const price = calcPrice(healthProgId, { age });
        if (price) {
          pushLine({
            category: 'health',
            kind:     'program',
            id:       healthProgId,
            label:    DATA.programs[healthProgId].label,
            memberType: 'client',
            memberLabel: 'Εσείς',
            price,
          });
        }
      }
    }

    // ═══ STAGE 2: ΒΑΣΙΚΟ LIFE ΠΕΛΑΤΗ ══════════════════════════════
    if (scores.includeLife) {
      const lifeId = selectLifeProduct(answers);
      if (lifeId) {
        const capMap = { '50k': 50000, '100k': 100000, '150k': 150000, '200k': 200000 };
        const lifeCap = capMap[answers.lifeCapital] || 50000;
        const lifePrice = calcPrice(lifeId, { age, capital: lifeCap, isFirstYear: true });
        if (lifePrice) {
          pushLine({
            category: 'life',
            kind:     'program',
            id:       lifeId,
            label:    DATA.programs[lifeId].label,
            memberType: 'client',
            memberLabel: 'Εσείς',
            price:    lifePrice,
            capital:  lifeCap,
          });
        }
      }
    }

    // ═══ STAGE 3: ΜΕΛΗ ΟΙΚΟΓΕΝΕΙΑΣ ════════════════════════════════
    // 3a: HEALTH 500/1500 (ανά περιστατικό) — με οικογενειακή έκπτωση
    // 3b: CROSS / CROSS PLUS (ετήσιο / χωρίς) — ίδιο πρόγραμμα, τιμή ανά ηλικία
    const fd = DATA.familyDiscounts;
    const familyEligible = healthProgId &&
                           fd && fd.eligiblePrograms.includes(healthProgId);

    if (familyEligible) {
      const spouseAge   = Number(answers.spouseAge) || 0;
      const childrenAges = Array.isArray(answers.childrenAges)
        ? answers.childrenAges.filter(a => a != null && Number(a) >= 0).map(Number)
        : [];
      const scope      = answers.coverageScope || 'family';
      const hasSpouse  = answers.maritalStatus === 'married' && spouseAge >= 18 && scope === 'family';
      const numKids    = scope === 'self' ? 0 : Math.min(childrenAges.length, fd.maxChildren);

      // Συνολικός αριθμός ασφαλισμένων = πελάτης + σύζυγος + παιδιά
      const totalMembers = 1 + (hasSpouse ? 1 : 0) + numKids;
      const discountPct  = getFamilyDiscountPct(totalMembers, healthProgId);

      // Εφαρμόζουμε αναδρομικά την έκπτωση στη γραμμή του ΠΕΛΑΤΗ
      if (discountPct > 0) {
        const clientLine = proposal.lines.find(
          l => l.category === 'health' && l.memberType === 'client'
        );
        if (clientLine) {
          const oldMonthly = clientLine.price.monthly;
          const oldAnnual  = clientLine.price.annual;
          clientLine.price = applyDiscount(clientLine.price, discountPct);
          proposal.totals.monthly += (clientLine.price.monthly - oldMonthly);
          proposal.totals.annual  += (clientLine.price.annual  - oldAnnual);
        }
      }

      // Σύζυγος
      if (hasSpouse) {
        const spousePrice = calcPrice(healthProgId, { age: spouseAge });
        if (spousePrice) {
          const discounted = applyDiscount(spousePrice, discountPct);
          pushLine({
            category: 'health',
            kind:     'program',
            id:       healthProgId,
            label:    DATA.programs[healthProgId].label,
            memberType: 'spouse',
            memberLabel: 'Σύζυγος',
            memberAge: spouseAge,
            price:    discounted,
          });
        }
      }

      // Παιδιά
      for (let i = 0; i < numKids; i++) {
        const kidAge = childrenAges[i];
        const kidPrice = calcPrice(healthProgId, { age: kidAge });
        if (kidPrice) {
          const discounted = applyDiscount(kidPrice, discountPct);
          pushLine({
            category: 'health',
            kind:     'program',
            id:       healthProgId,
            label:    DATA.programs[healthProgId].label,
            memberType: 'child',
            memberLabel: `Παιδί ${i + 1}`,
            memberAge: kidAge,
            price:    discounted,
          });
        }
      }

      // Σημείωση για την έκπτωση
      if (discountPct > 0) {
        proposal.notes.push({
          category: 'familyDiscount',
          message: `Εφαρμόστηκε έκπτωση ${Math.round(discountPct * 100)}% σε όλα τα μέλη `
                + `(${totalMembers} ασφαλισμένοι) σύμφωνα με την πολιτική οικογένειας NN Hellas.`,
        });
      }
    }

    // ═══ STAGE 3b: ΜΕΛΗ ΟΙΚΟΓΕΝΕΙΑΣ (CROSS / ετήσιο ή χωρίς εκπιπτόμενο) ═══
    // Για προγράμματα εκτός HEALTH 500/1500: ίδιο πρόγραμμα, τιμή ανά ηλικία
    if (healthProgId && !familyEligible) {
      const scope3b = answers.coverageScope || 'family';
      if (scope3b !== 'self') {
        const spouseAge3b = Number(answers.spouseAge) || 0;
        const childrenAges3b = Array.isArray(answers.childrenAges)
          ? answers.childrenAges.filter(a => a != null && Number(a) >= 0).map(Number)
          : [];
        const hasSpouse3b = answers.maritalStatus === 'married' && spouseAge3b >= 18 && scope3b === 'family';
        const numKids3b   = Math.min(childrenAges3b.length, 4);

        if (hasSpouse3b) {
          const spousePrice = calcPrice(healthProgId, { age: spouseAge3b });
          if (spousePrice) {
            pushLine({
              category: 'health', kind: 'program',
              id: healthProgId, label: DATA.programs[healthProgId].label,
              memberType: 'spouse', memberLabel: 'Σύζυγος',
              memberAge: spouseAge3b, price: spousePrice,
            });
          }
        }

        for (let i = 0; i < numKids3b; i++) {
          const kidAge = childrenAges3b[i];
          const kidPrice = calcPrice(healthProgId, { age: kidAge });
          if (kidPrice) {
            pushLine({
              category: 'health', kind: 'program',
              id: healthProgId, label: DATA.programs[healthProgId].label,
              memberType: 'child', memberLabel: `Παιδί ${i + 1}`,
              memberAge: kidAge, price: kidPrice,
            });
          }
        }
      }
    }

    // ═══ STAGE 4: RIDERS (μόνο αν χωράει στο budget) ══════════════
    if (healthProgId) {
      // 4.1 Critical Illness rider
      if (remainingBudget() > 0) {
        const ciId = selectCriticalIllness(answers, scores);
        if (ciId && isCompatible(healthProgId, ciId)) {
          const ciCapital = 30000;
          const ciPrice = calcPrice(ciId, { age, capital: ciCapital });
          if (ciPrice && ciPrice.monthly <= remainingBudget()) {
            pushLine({
              category: 'criticalIllness',
              kind:     'attachment',
              id:       ciId,
              label:    DATA.attachments[ciId].label,
              memberType: 'client',
              memberLabel: 'Εσείς',
              price:    ciPrice,
              capital:  ciCapital,
            });
          }
        }
      }

      // 4.2 Hospital Allowance (MediPlan)
      if (remainingBudget() > 0) {
        const haId = selectHospitalAllowance(answers, remainingBudget());
        if (haId && isCompatible(healthProgId, haId)) {
          const haPrice = calcPrice(haId, { age });
          if (haPrice && haPrice.monthly <= remainingBudget()) {
            pushLine({
              category: 'hospitalAllowance',
              kind:     'attachment',
              id:       haId,
              label:    DATA.attachments[haId].label,
              memberType: 'client',
              memberLabel: 'Εσείς',
              price:    haPrice,
            });
          }
        }
      }

      // 4.3 Primary Care (First Care) — αφαιρέθηκε εντελώς κατόπιν αιτήματος.
    }

    // ═══ STAGE 5: ΣΥΝΤΑΞΗ — μόνο αν χωράει στο budget ═════════════
    // Αν καλύφθηκαν οι ανάγκες Υγείας + Ζωής (ή δεν υπήρχαν) ΚΑΙ
    // υπάρχει υπολειπόμενο budget ΚΑΙ ο πελάτης έχει συνταξιοδοτική ανάγκη
    // → προτείνουμε αποταμιευτικό πρόγραμμα ως κανονική γραμμή πρότασης.
    const remainingForSavings = remainingBudget();
    const needsAddressed =
      (!scores.includeHealth || proposal.lines.some(l => l.category === 'health' || l.category === 'primaryCare')) &&
      (!scores.includeLife   || proposal.lines.some(l => l.category === 'life'));

    if (scores.includeSavingsNote) {
      // Ελάχιστο μηνιαίο όριο αποταμιευτικού: €50/μήνα (δεν υπάρχει ανώτατο)
      const SAVINGS_MIN_MONTHLY = 50;
      if (needsAddressed && remainingForSavings >= SAVINGS_MIN_MONTHLY) {
        // Υπάρχει χώρος στο budget — διαθέτουμε ολόκληρο το υπολειπόμενο
        const savingsMonthly = Math.floor(remainingForSavings);
        proposal.lines.push({
          category: 'savings',
          kind: 'savings',
          id: 'savings',
          label: 'Αποταμιευτικό Πρόγραμμα',
          price: {
            monthly: savingsMonthly,
            annual:  savingsMonthly * 12,
            net:     savingsMonthly,
            gross:   savingsMonthly,
            source:  'savings',
          },
        });
        proposal.totals.monthly += savingsMonthly;
        proposal.totals.annual  += savingsMonthly * 12;
      } else {
        // Δεν υπάρχει χώρος → μόνο σημείωση
        proposal.notes.push({
          category: 'savings',
          message: 'Το συνταξιοδοτικό σας προφίλ δείχνει σημαντική ανάγκη αποταμίευσης. '
                + 'Μετά την κάλυψη των αναγκών Υγείας και Ζωής δεν υπολείπεται επαρκές budget '
                + '(απαιτείται ελάχιστο €50/μήνα). Προτείνουμε ξεχωριστή συζήτηση για '
                + 'αποταμιευτικό πρόγραμμα προσαρμοσμένο στις δυνατότητές σας.',
        });
      }
    }

    // ─── BUDGET WARNING ──────────────────────────────────────────
    proposal.totals.monthly = round2(proposal.totals.monthly);
    proposal.totals.annual  = roundEur(proposal.totals.annual);

    if (proposal.totals.monthly > monthlyBudget * 1.05) { // 5% ανοχή
      proposal.warnings.push({
        type: 'budgetExceeded',
        message: `Η πρόταση (€${proposal.totals.monthly}/μήνα) ξεπερνά τον προϋπολογισμό σας (€${monthlyBudget}/μήνα).`,
        excess: round2(proposal.totals.monthly - monthlyBudget),
      });
    }

    return proposal;
  }

  // ════════════════════════════════════════════════════════════════════
  // EXPORT
  // ════════════════════════════════════════════════════════════════════
  const ENGINE = {
    calcScores,
    isCompatible,
    calcPrice,
    selectHealthProgram,
    selectCriticalIllness,
    selectHospitalAllowance,
    selectLifeProduct,
    buildProposal,
    // Internal helpers (εκτεθειμένα για testing)
    _interpolateAge: interpolateAge,
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = ENGINE;
  }
  root.NN_ENGINE = ENGINE;

})(typeof window !== 'undefined' ? window : globalThis);

/**
 * NN Hellas — PWA Single-Question Mode
 *
 * Ενεργοποιείται ΜΟΝΟ όταν το ερωτηματολόγιο τρέχει ως εγκατεστημένη
 * εφαρμογή (PWA standalone mode). Σε browser ο πελάτης βλέπει την
 * κανονική διάταξη.
 *
 * Λειτουργία:
 *  • Κάθε .q-block εμφανίζεται μόνο του (μία ερώτηση τη φορά).
 *  • Σε radio button αυτόματη μετάβαση μετά από 350ms.
 *  • Slider/Input/Checkboxes: ο χρήστης πατά "Επόμενο" χειροκίνητα.
 *  • Conditional q-blocks (spouse-section, kids-section, κλπ.) εμφανίζονται
 *    στη σειρά τους μόλις γίνουν visible από τη βασική app logic.
 *  • Στο τέλος της οθόνης καλείται η υπάρχουσα nextStep() — η οποία
 *    κάνει validation και προχωρά στην επόμενη οθόνη.
 */
(function () {
  'use strict';

  // ─── Detect PWA standalone mode ──────────────────────
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: fullscreen)').matches
        || window.matchMedia('(display-mode: minimal-ui)').matches
        || window.navigator.standalone === true;   // iOS Safari
  }

  if (!isStandalone()) {
    // Browser mode — δεν κάνουμε τίποτα. Ο πελάτης βλέπει την κανονική διάταξη.
    console.log('[PWA-Mode] Browser mode — using standard multi-question layout');
    return;
  }
  console.log('[PWA-Mode] Standalone mode — activating single-question UX');

  // Mark mode early so CSS can react ASAP
  document.documentElement.classList.add('pwa-mode');

  // ─── Config ──────────────────────────────────────────
  // Καθυστέρηση αυτόματης μετάβασης μετά από radio selection.
  // Δίνει χρόνο στον χρήστη να δει την επιλογή του, να μετανιώσει,
  // ή να την αλλάξει πριν προχωρήσει. Αν πατήσει «Επόμενο» ο ίδιος,
  // το auto-advance ακυρώνεται.
  const AUTO_ADVANCE_DELAY_MS = 2200;

  // ─── State ───────────────────────────────────────────
  const state = {
    qIndex:       0,
    screenId:     null,
    lastDirection:'forward',   // 'forward' | 'backward' — αποφασίζει αν το νέο screen θα ξεκινήσει από την 1η ή την τελευταία ερώτηση
    autoTimer:    null,        // setTimeout handle για auto-advance
  };

  function cancelAutoAdvance() {
    if (state.autoTimer) {
      clearTimeout(state.autoTimer);
      state.autoTimer = null;
      const hint = document.getElementById('pwa-auto-hint');
      if (hint) hint.classList.remove('visible');
    }
  }

  // ─── Helpers ─────────────────────────────────────────
  function getActiveScreen() {
    return document.querySelector('.screen.active');
  }

  // q-blocks που είναι ΕΦΑΡΜΟΣΤΕΑ (όχι μέσω inline display:none από conditional logic)
  function getApplicableQBlocks(screen) {
    return Array.from(screen.querySelectorAll('.q-block'))
      .filter(qb => qb.style.display !== 'none');
  }

  // ─── Validation: είναι απαντημένο το q-block; ──────
  function isQBlockAnswered(qb) {
    if (!qb) return true;

    // Αν το q-block είναι σημαδεμένο ως ΠΡΟΑΙΡΕΤΙΚΟ στην ετικέτα του,
    // πάντα περνά (π.χ. πεδίο τηλεφώνου στην s5).
    const label = qb.querySelector('.q-label');
    if (label && /προαιρετικ/i.test(label.textContent)) return true;

    // Radios → χρειάζεται τουλάχιστον ένα checked
    const radios = qb.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      return Array.from(radios).some(r => r.checked);
    }
    // Checkboxes (multi-select) → η ui.js χειρίζεται custom μέσω της κλάσης .sel
    // στο <label class="opt">, οπότε ελέγχουμε ΚΑΙ τα δύο σήματα.
    const checkboxes = qb.querySelectorAll('input[type="checkbox"]');
    if (checkboxes.length > 0) {
      const anyChecked  = Array.from(checkboxes).some(c => c.checked);
      const anySelLabel = qb.querySelector('.opt.sel') !== null;
      return anyChecked || anySelLabel;
    }
    // Text/Email/Tel/Number → όλα πρέπει να έχουν τιμή
    const textInputs = qb.querySelectorAll(
      'input[type="text"], input[type="email"], input[type="tel"], input[type="number"]'
    );
    if (textInputs.length > 0) {
      return Array.from(textInputs).every(inp => inp.value && inp.value.trim() !== '');
    }
    // Sliders ή q-block χωρίς inputs → πάντα ΟΚ
    return true;
  }

  function shakeCurrentBlock() {
    const screen = getActiveScreen();
    if (!screen) return;
    const current = screen.querySelector('.q-block.pwa-q-current');
    if (!current) return;

    // Add inline required hint if not already present
    if (!current.querySelector('.pwa-required-hint')) {
      const hint = document.createElement('div');
      hint.className = 'pwa-required-hint';
      hint.textContent = 'Παρακαλώ επιλέξτε μία απάντηση για να συνεχίσετε.';
      // Customize message based on input type
      const textInputs = current.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"]');
      const checkboxes = current.querySelectorAll('input[type="checkbox"]');
      if (textInputs.length > 0)      hint.textContent = 'Παρακαλώ συμπληρώστε το πεδίο για να συνεχίσετε.';
      else if (checkboxes.length > 0) hint.textContent = 'Παρακαλώ επιλέξτε τουλάχιστον μία επιλογή για να συνεχίσετε.';
      current.appendChild(hint);
    }

    current.classList.add('pwa-shake', 'pwa-show-required');

    // Remove shake animation after it finishes (allow re-trigger)
    setTimeout(() => current.classList.remove('pwa-shake'), 600);
  }

  function clearRequiredHint(qb) {
    if (!qb) return;
    qb.classList.remove('pwa-show-required', 'pwa-shake');
  }

  // Update Next button enabled/disabled based on current q-block answered state
  function updateNextButtonState() {
    const nextBtn = document.getElementById('pwa-btn-next');
    if (!nextBtn) return;
    const screen = getActiveScreen();
    if (!screen || !shouldUseSingleMode(screen)) {
      nextBtn.disabled = false;
      nextBtn.classList.remove('pwa-disabled');
      return;
    }
    const current = screen.querySelector('.q-block.pwa-q-current');
    const answered = isQBlockAnswered(current);
    nextBtn.disabled = !answered;
    nextBtn.classList.toggle('pwa-disabled', !answered);

    // Αν έχει απαντηθεί, καθαρίζουμε τυχόν error UI
    if (answered) clearRequiredHint(current);
  }

  function shouldUseSingleMode(screen) {
    if (!screen) return false;
    const id = screen.id;
    // s0 = welcome, s6 = results — έξω από single-question mode
    return id === 's1' || id === 's2' || id === 's3' || id === 's4' || id === 's5';
  }

  // ─── Render question at index ────────────────────────
  function showQuestion(idx) {
    const screen = getActiveScreen();
    if (!screen) return;

    if (!shouldUseSingleMode(screen)) {
      hidePwaNav();
      // Δείξε όλα τα q-blocks κανονικά
      screen.querySelectorAll('.q-block').forEach(qb => qb.classList.remove('pwa-q-hidden', 'pwa-q-current'));
      return;
    }

    const allBlocks  = Array.from(screen.querySelectorAll('.q-block'));
    const applicable = getApplicableQBlocks(screen);

    if (applicable.length === 0) {
      hidePwaNav();
      return;
    }

    if (idx < 0) idx = 0;

    if (idx >= applicable.length) {
      // Done with this screen — try to advance
      state.lastDirection = 'forward';
      // ΣΗΜΑΝΤΙΚΟ: Στην s5 (τελευταία οθόνη) το κουμπί καλεί submitForm()
      // και ΟΧΙ nextStep(). Πρέπει να καλέσουμε τη σωστή συνάρτηση.
      if (screen.id === 's5' && typeof window.submitForm === 'function') {
        window.submitForm();
      } else if (typeof window.nextStep === 'function') {
        window.nextStep();
      }
      return;
    }

    state.qIndex = idx;

    // Hide every q-block; show current
    allBlocks.forEach(qb => {
      qb.classList.add('pwa-q-hidden');
      qb.classList.remove('pwa-q-current');
    });
    const current = applicable[idx];
    current.classList.remove('pwa-q-hidden');
    current.classList.add('pwa-q-current');

    showPwaNav();
    updateMiniProgress(applicable.length, idx);
    updateNavButtons(idx, applicable.length);
    updateNextButtonState();  // disabled/enabled με βάση το αν είναι απαντημένη

    // Scroll to top of question with a slight delay (for animation)
    setTimeout(() => {
      try {
        const headerEl = screen.querySelector('.step-label') || current;
        headerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { window.scrollTo({ top: 0, behavior: 'smooth' }); }
    }, 50);
  }

  // ─── Navigation actions ──────────────────────────────
  function nextQ() {
    cancelAutoAdvance();   // ο χρήστης πάτησε χειροκίνητα — ακυρώνεται το auto
    const screen = getActiveScreen();
    if (!screen || !shouldUseSingleMode(screen)) return;

    // ═══ ΕΛΕΓΧΟΣ: η τρέχουσα ερώτηση πρέπει να έχει απάντηση ═══
    const currentBlock = screen.querySelector('.q-block.pwa-q-current');
    if (!isQBlockAnswered(currentBlock)) {
      shakeCurrentBlock();
      return;
    }

    // Re-evaluate applicable q-blocks (conditional may have changed)
    const applicable = getApplicableQBlocks(screen);
    let idx = currentBlock ? applicable.indexOf(currentBlock) : -1;
    if (idx === -1) idx = state.qIndex;
    showQuestion(idx + 1);
  }

  function prevQ() {
    cancelAutoAdvance();
    const screen = getActiveScreen();
    if (!screen) return;
    if (!shouldUseSingleMode(screen)) {
      // On welcome screen or results, prev does nothing special
      if (typeof window.prevStep === 'function') window.prevStep();
      return;
    }

    const applicable   = getApplicableQBlocks(screen);
    const currentBlock = screen.querySelector('.q-block.pwa-q-current');
    let idx = currentBlock ? applicable.indexOf(currentBlock) : state.qIndex;

    if (idx <= 0) {
      // First question — go back to previous screen
      state.lastDirection = 'backward';
      if (typeof window.prevStep === 'function') window.prevStep();
      return;
    }
    showQuestion(idx - 1);
  }

  // Expose for the nav buttons in HTML
  window.pwaNext = nextQ;
  window.pwaPrev = prevQ;

  // ─── Build PWA nav DOM ───────────────────────────────
  function ensureNav() {
    if (document.getElementById('pwa-nav')) return;

    // Floating bottom nav (με auto-advance progress bar)
    const nav = document.createElement('div');
    nav.className = 'pwa-nav';
    nav.id        = 'pwa-nav';
    nav.innerHTML = `
      <div class="pwa-auto-hint" id="pwa-auto-hint">
        <div class="pwa-auto-hint-bar"></div>
        <div class="pwa-auto-hint-text">Αυτόματη μετάβαση…</div>
      </div>
      <div class="pwa-nav-row">
        <button class="pwa-btn-prev" id="pwa-btn-prev" type="button">← Πίσω</button>
        <button class="pwa-btn-next" id="pwa-btn-next" type="button">Επόμενο →</button>
      </div>
    `;
    document.body.appendChild(nav);
    document.getElementById('pwa-btn-prev').addEventListener('click', prevQ);
    document.getElementById('pwa-btn-next').addEventListener('click', nextQ);

    // Mini progress dots (inserted at top of .app)
    const app = document.querySelector('.app');
    if (app) {
      const prog = document.createElement('div');
      prog.className = 'pwa-mini-progress';
      prog.id        = 'pwa-mini-progress';
      app.prepend(prog);
    }
  }

  function showPwaNav() {
    const nav  = document.getElementById('pwa-nav');
    const prog = document.getElementById('pwa-mini-progress');
    if (nav)  nav.style.display  = 'flex';
    if (prog) prog.style.display = 'flex';
  }

  function hidePwaNav() {
    const nav  = document.getElementById('pwa-nav');
    const prog = document.getElementById('pwa-mini-progress');
    if (nav)  nav.style.display  = 'none';
    if (prog) prog.style.display = 'none';
  }

  function updateMiniProgress(total, current) {
    const prog = document.getElementById('pwa-mini-progress');
    if (!prog) return;
    prog.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot' + (i < current ? ' done' : (i === current ? ' current' : ''));
      prog.appendChild(dot);
    }
  }

  function updateNavButtons(idx, total) {
    const nextBtn = document.getElementById('pwa-btn-next');
    if (nextBtn) {
      nextBtn.textContent = (idx === total - 1) ? 'Ολοκλήρωση Βήματος →' : 'Επόμενο →';
    }
    // Last screen, last question — show "submit" feel
    const screen = getActiveScreen();
    if (screen && screen.id === 's5' && idx === total - 1) {
      nextBtn.textContent = 'Δείτε τα Αποτελέσματα ✦';
    }
  }

  // ─── Auto-advance on radio selection (slow, last-resort) ──
  document.addEventListener('change', function (e) {
    if (!document.documentElement.classList.contains('pwa-mode')) return;
    const screen = getActiveScreen();
    if (!shouldUseSingleMode(screen)) return;

    // Σε ΚΑΘΕ αλλαγή, ενημέρωσε το next-button state
    updateNextButtonState();

    if (e.target && e.target.type === 'radio') {
      // Ακύρωσε προηγούμενο timer
      cancelAutoAdvance();

      const hint = document.getElementById('pwa-auto-hint');
      if (hint) hint.classList.add('visible');

      state.autoTimer = setTimeout(function () {
        state.autoTimer = null;
        if (hint) hint.classList.remove('visible');
        nextQ();
      }, AUTO_ADVANCE_DELAY_MS);
    }
  });

  // Listen σε text/email/tel/number inputs (για live activation του Next button)
  document.addEventListener('input', function (e) {
    if (!document.documentElement.classList.contains('pwa-mode')) return;
    const screen = getActiveScreen();
    if (!shouldUseSingleMode(screen)) return;
    if (e.target && ['text','email','tel','number'].includes(e.target.type)) {
      updateNextButtonState();
    }
  });

  // Listen σε clicks πάνω σε .opt (πιάνει checkboxes που χειρίζεται η togMulti)
  // Η togMulti κάνει preventDefault, οπότε το «change» event ΔΕΝ φιρράζει για checkboxes.
  // Πρέπει να ανανεώσουμε το button state μετά το click μόλις τρέξει η togMulti.
  document.addEventListener('click', function (e) {
    if (!document.documentElement.classList.contains('pwa-mode')) return;
    const screen = getActiveScreen();
    if (!shouldUseSingleMode(screen)) return;
    const opt = e.target.closest && e.target.closest('.opt');
    if (opt && opt.querySelector('input[type="checkbox"]')) {
      // Περίμενε ένα frame για να ολοκληρωθεί η togMulti που τοποθετεί το .sel class
      setTimeout(updateNextButtonState, 0);
    }
  }, true);

  // ─── Observe screen changes (.active toggle) ─────────
  function onScreenChange() {
    cancelAutoAdvance();   // καθάρισε τυχόν εκκρεμές timer από προηγούμενο screen
    const screen = getActiveScreen();
    if (!screen) return;
    if (state.screenId === screen.id) return;
    state.screenId = screen.id;

    if (shouldUseSingleMode(screen)) {
      if (state.lastDirection === 'backward') {
        // Coming from next screen via "Back" — show last applicable question
        const applicable = getApplicableQBlocks(screen);
        showQuestion(Math.max(0, applicable.length - 1));
      } else {
        showQuestion(0);
      }
      state.lastDirection = 'forward';
    } else {
      hidePwaNav();
      // Reset any leftover hidden classes on welcome/results
      screen.querySelectorAll('.q-block').forEach(qb => qb.classList.remove('pwa-q-hidden', 'pwa-q-current'));
    }
  }

  function startObserver() {
    const obs = new MutationObserver(() => onScreenChange());
    document.querySelectorAll('.screen').forEach(scr => {
      obs.observe(scr, { attributes: true, attributeFilter: ['class'] });
    });
  }

  // ─── Init ───────────────────────────────────────────
  function init() {
    document.body.classList.add('pwa-mode');
    ensureNav();
    startObserver();
    onScreenChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

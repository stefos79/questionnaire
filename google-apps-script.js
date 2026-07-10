/**
 * NN Hellas — Ασφαλιστικό Ερωτηματολόγιο
 * Google Apps Script Backend
 *
 * DEPLOY:
 * 1. Extensions → Apps Script → επικόλλησε αυτόν τον κώδικα
 * 2. Δημιούργησε HTML αρχείο με όνομα "Dashboard" (File → New → HTML file)
 *    και επικόλλησε το περιεχόμενο του dashboard-appscript.html
 * 3. Deploy → New deployment → Web App (Execute as: Me, Anyone)
 * 4. Αντίγραψε το /exec URL → βάλτε στο index.html → SVC.sheets_url
 * 5. Dashboard URL: https://script.google.com/.../exec?view=dashboard
 */

// ID του Google Spreadsheet στο οποίο γράφονται όλες οι υποβολές.
// Πάρε το από το URL: https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
const SPREADSHEET_ID = '1tjz5qgSxw8xuhNczpDCC6ThhhehTH5pIIjY7Uy-3i1M';

const SHEET_NAME    = 'Απαντήσεις';
const RATINGS_SHEET = 'Αξιολογήσεις';

/** Επιστρέφει πάντα το συγκεκριμένο spreadsheet by ID
 *  (αντί για getActiveSpreadsheet που εξαρτάται από container-binding). */
function getTargetSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

const RATINGS_HEADERS = [
  'Ημερομηνία', 'Ονοματεπώνυμο', 'Email', 'Βαθμολογία (1-5)', 'Σχόλιο',
];

const HEADERS = [
  'Ημερομηνία',
  'Ονοματεπώνυμο', 'Email', 'Τηλέφωνο',
  'Ηλικία', 'Οικογ. Κατάσταση', 'Ηλικία Συζύγου',
  'Παιδιά', 'Ηλικίες Παιδιών',
  'Επάγγελμα',
  'Ικανοποίηση Ταμείου',
  'Νοσοκ. Ήπιο Περιστατικό', 'Νοσοκ. Σοβαρό Περιστατικό',
  'Εκπιπτόμενο',
  'Κρίσιμες Ασθένειες (P7)', 'Επίδομα Νοσηλείας (P9)',
  'Ανησυχία Εισοδήματος', 'Ανάγκες Ζωής', 'Επιθυμητό Κεφάλαιο Ζωής',
  'Εκτίμηση Σύνταξης', 'Σχέδιο Αποταμίευσης',
  'Στόχος Αποταμ. (€)', 'Έτη Στόχου',
  'Budget (€/μήνα)',
  'Score Υγείας', 'Score Ζωής', 'Score Σύνταξης', 'Επείγον',
  'Σύνοψη Ερωτηματολογίου',
  'Πρόταση',
];

/* ============================================================
   doPost — form submit από τον browser (POST body = URLSearchParams)
   ============================================================ */
function doPost(e) {
  try {
    const p = e.parameter || {};
    // Δρομολόγηση βάσει action
    if (p.action === 'rating') return writeRating(p);
    return writeRow(p);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ============================================================
   writeRating — καταχώριση αξιολόγησης σε ξεχωριστό sheet
   ============================================================ */
function writeRating(p) {
  const ss = getTargetSpreadsheet();
  let sheet = ss.getSheetByName(RATINGS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(RATINGS_SHEET);
    sheet.appendRow(RATINGS_HEADERS);
    sheet.getRange(1, 1, 1, RATINGS_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#F47920')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140);  // Ημερομηνία
    sheet.setColumnWidth(2, 180);  // Όνομα
    sheet.setColumnWidth(3, 200);  // Email
    sheet.setColumnWidth(4, 120);  // Βαθμολογία
    sheet.setColumnWidth(5, 400);  // Σχόλιο
  }

  sheet.appendRow([
    p.date    || new Date().toLocaleString('el-GR'),
    p.name    || '',
    p.email   || '',
    p.rating  || '',
    p.comment || '',
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, row: sheet.getLastRow() }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   writeRow — κοινή λογική καταχώρισης (χρησιμοποιείται από doPost & doGet)
   ============================================================ */
function writeRow(p) {
  const ss  = getTargetSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    formatHeaders(sheet);
  } else {
    const existingCount = sheet.getRange(1, 1, 1, sheet.getLastColumn())
                               .getValues()[0].filter(String).length;
    if (existingCount !== HEADERS.length) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      formatHeaders(sheet);
    }
  }

  sheet.appendRow([
    p.date              || new Date().toLocaleString('el-GR'),
    p.name              || '',
    p.email             || '',
    p.phone             || '',
    p.age               || '',
    p.marital_status    || '',
    p.spouse_age        || '',
    p.children          || '',
    p.kids_ages         || '',
    p.occupation        || '',
    p.fund_satisfaction || '',
    p.hospital_mild     || '',
    p.hospital_severe   || '',
    p.deductible_type   || '',
    p.ci_pref           || '',
    p.hospital_allowance|| '',
    p.income_concern    || '',
    p.uncovered_needs   || '',
    p.life_capital      || '',
    p.pension_estimate  || '',
    p.savings_plan      || '',
    p.target_amount     || '',
    p.target_years      || '',
    p.monthly_budget    || '',
    p.health_score      || '',
    p.life_score        || '',
    p.retirement_score  || '',
    p.urgency           || '',
    p.qa_summary        || '',
    p.proposal          || '',
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, row: sheet.getLastRow() }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   doGet — dashboard view μόνο (form submit έγινε POST)
   ============================================================ */
function doGet(e) {
  try {
    const p = e.parameter || {};

    if (p.view === 'dashboard') {
      return HtmlService.createHtmlOutputFromFile('Dashboard')
        .setTitle('NN Hellas — Dashboard')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    if (p.action === 'rating') return writeRating(p);
    return writeRow(p);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ============================================================
   getData — καλείται από το Dashboard HTML μέσω google.script.run
   Επιστρέφει όλες τις γραμμές ως array of objects
   ============================================================ */
function getData() {
  try {
    const ss    = getTargetSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { ok: true, rows: [], count: 0 };

    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return { ok: true, rows: [], count: 0 };

    const headers = values[0].map(String);
    const rows = values.slice(1)
      .filter(r => r[0] !== '' && r[0] !== null && r[0] !== undefined)
      .map(r => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]) : ''; });
        return obj;
      })
      .reverse(); // νεότερες πρώτα

    return { ok: true, rows, count: rows.length };
  } catch (err) {
    return { ok: false, error: err.message, rows: [], count: 0 };
  }
}

/* ============================================================
   getRowCount — polling από το Dashboard για live updates
   Επιστρέφει τον αριθμό γραμμών δεδομένων (χωρίς header)
   ============================================================ */
function getRowCount() {
  try {
    const ss    = getTargetSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return { ok: true, count: 0 };
    const count = Math.max(0, sheet.getLastRow() - 1); // -1 για τον header
    return { ok: true, count };
  } catch (err) {
    return { ok: false, error: err.message, count: 0 };
  }
}

/* ============================================================
   formatHeaders
   ============================================================ */
function formatHeaders(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#F47920')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 140);
  sheet.setColumnWidth(HEADERS.length - 1, 280); // Σύνοψη Ερωτηματολογίου
  sheet.setColumnWidth(HEADERS.length, 300);     // Πρόταση (τελευταία στήλη)
}

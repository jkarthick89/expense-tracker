// ════════════════════════════════════════════════════════════
//  SplitMate — Google Apps Script Backend  v2.0
//  Deploy as: Web App → Execute as: Me → Access: Anyone
//  Paste the deployed URL into SCRIPT_URL in index.html
// ════════════════════════════════════════════════════════════

// ── CONFIG — must match values in index.html ──
const SHEET_ID       = 'YOUR_GOOGLE_SHEET_ID';             // ← Paste your Google Sheet ID
const CLIENT_ID      = 'YOUR_GOOGLE_OAUTH_CLIENT_ID';      // ← Paste your OAuth 2.0 Client ID
// Admin emails — hardcoded for security (admin status must not be changeable via the sheet)
const ADMIN_EMAILS = [
  'your-admin@gmail.com'                                   // ← Replace with your admin email
];

// ── READ ALLOWED EMAILS FROM MEMBERS SHEET ──
// Allowlist is managed via the Members tab (column B = email).
// Admin emails are always allowed regardless of the sheet.
function getAllowedEmails(ss) {
  const allowed = ADMIN_EMAILS.map(function(e) { return e.toLowerCase(); });
  try {
    const sheet = ss.getSheetByName('Members');
    if (sheet && sheet.getLastRow() > 1) {
      sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues().forEach(function(r) {
        if (r[0]) allowed.push(String(r[0]).toLowerCase());
      });
    }
  } catch(e) { /* sheet may not exist yet on first run */ }
  return allowed;
}

// ── ENTRY POINT ──
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    // Public action — no auth required (only checks existence, reveals no data)
    if (body.action === 'checkEmail') {
      const ss = SpreadsheetApp.openById(SHEET_ID);
      return jsonOut(checkEmail(ss, body.email));
    }

    // 1. Verify the Google ID token — prevents forged requests
    const email = verifyIdToken(body.idToken, body.nonce);
    if (!email) {
      return jsonOut({ error: 'Invalid or expired ID token. Please sign in again.' });
    }

    // 2. Check allowlist — read live from Members sheet
    const ss = SpreadsheetApp.openById(SHEET_ID);
    if (!getAllowedEmails(ss).includes(email.toLowerCase())) {
      return jsonOut({ error: 'Not authorized: ' + email + '. Ask the admin to add you as a member.' });
    }

    // 3. Dispatch
    const isAdmin = ADMIN_EMAILS.map(function(x) { return x.toLowerCase(); }).includes(email.toLowerCase());

    // Admin-only actions
    if (['initSheet','saveMembers','saveTrips','persistActiveTrip','saveAppSetting'].includes(body.action)) {
      if (!isAdmin) return jsonOut({ error: 'Admin only.' });
      switch (body.action) {
        case 'initSheet':         return jsonOut(initSheet(ss));
        case 'saveMembers':       return jsonOut(saveMembers(ss, body.members));
        case 'saveTrips':         return jsonOut(saveTrips(ss, body.trips));
        case 'persistActiveTrip': return jsonOut(persistActiveTrip(ss, body.tripValue));
        case 'saveAppSetting':    return jsonOut(saveAppSetting(ss, body.key, body.value));
      }
    }

    // All-member actions
    switch (body.action) {
      case 'getAll':          return jsonOut(getAll(ss, email));
      case 'addExpense':      return jsonOut(addExpense(ss, body.expense, email));
      case 'updateExpense':   return jsonOut(updateExpense(ss, body.expense, email));
      case 'deleteExpense':   return jsonOut(deleteExpense(ss, body.id));
      case 'addSettlement':   return jsonOut(addSettlement(ss, body.settlement));
      case 'saveUserSetting': return jsonOut(saveUserSetting(ss, email, body.key, body.value));
      default:                return jsonOut({ error: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

// Health check — lets the frontend confirm the URL is correct
function doGet(e) {
  return jsonOut({ status: 'ok', version: '1.0' });
}

// ── ID TOKEN VERIFICATION ──
// Calls Google's tokeninfo endpoint to cryptographically verify the token.
// Results are cached for 5 minutes using CacheService to avoid a round-trip
// to Google on every request — this is the primary cause of slow load times.
function verifyIdToken(idToken, expectedNonce) {
  if (!idToken) return null;
  try {
    // Use a short hash of the token as the cache key (tokens can be >2 KB)
    var cacheKey = 'sm_tok_' + Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      idToken
    ).map(function(b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2,'0'); }).join('');

    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) {
      // Cache hit — parse stored email and re-validate nonce from token payload
      var parts = idToken.split('.');
      if (parts.length === 3) {
        try {
          var payload = JSON.parse(Utilities.newBlob(
            Utilities.base64DecodeWebSafe(parts[1] + '==')
          ).getDataAsString());
          if (expectedNonce && payload.nonce !== expectedNonce) return null;
        } catch(e) { /* fall through — nonce check skipped */ }
      }
      return cached; // cached email
    }

    var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
    var res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;

    var data = JSON.parse(res.getContentText());

    // Must be issued for our app
    if (data.aud !== CLIENT_ID) return null;

    // Email must be verified by Google
    if (!data.email_verified || data.email_verified === 'false') return null;

    // Nonce must match (prevents replay attacks)
    if (expectedNonce && data.nonce !== expectedNonce) return null;

    // Cache the verified email for 5 minutes (token expires in 1 hour)
    cache.put(cacheKey, data.email, 300);

    return data.email; // confirmed email
  } catch (err) {
    return null;
  }
}

// ── READ ALL DATA ──
function getAll(ss, email) {
  const result = {};

  // Expenses
  const expSheet = ss.getSheetByName('Expenses');
  const expValues = expSheet ? expSheet.getDataRange().getValues() : [[]];
  result.expenses = expValues.slice(1).map(function(r) {
    return {
      id: r[0] || '', date: r[1] || '', name: r[2] || '',
      category: r[3] || '', amount: parseFloat(r[4]) || 0,
      currency: r[5] || 'INR', paidBy: r[6] || '',
      trip: r[7] || 'General', splitType: r[8] || 'equal',
      splits: tryParse(r[9]), notes: r[10] || '', addedBy: r[11] || ''
    };
  }).filter(function(e) { return e.id; });

  // Members (name + email in columns A, B)
  const memSheet  = ss.getSheetByName('Members');
  const memValues = memSheet ? memSheet.getDataRange().getValues() : [[]];
  result.members  = memValues.slice(1).map(function(r) {
    return { name: r[0] || '', email: r[1] || '' };
  }).filter(function(m) { return m.name; });

  // Trips
  const tripSheet  = ss.getSheetByName('Trips');
  const tripValues = tripSheet ? tripSheet.getDataRange().getValues() : [[]];
  result.trips     = tripValues.slice(1).map(function(r) { return r[0]; }).filter(Boolean);

  // Settlements
  const setSheet  = ss.getSheetByName('Settlements');
  const setValues = setSheet ? setSheet.getDataRange().getValues() : [[]];
  result.settlements = setValues.slice(1).map(function(r) {
    return {
      id: r[0] || '', date: r[1] || '', from: r[2] || '', to: r[3] || '',
      amount: parseFloat(r[4]) || 0,
      full: r[5] === 'true' || r[5] === true,
      note: r[6] || ''
    };
  }).filter(function(s) { return s.id; });

  // Settings (activeTrip)
  const stgSheet  = ss.getSheetByName('Settings');
  const stgValues = stgSheet ? stgSheet.getDataRange().getValues() : [[]];
  const atRow     = stgValues.slice(1).find(function(r) { return r[0] === 'activeTrip'; });
  result.activeTrip = atRow ? atRow[1] : 'all';

  // Email notification app-level setting
  // Google Sheets auto-converts string "false" → boolean false, so use String() to normalise
  var notifRow = stgValues.slice(1).find(function(r) { return r[0] === 'emailNotif'; });
  result.emailNotif = notifRow ? String(notifRow[1]).toLowerCase() !== 'false' : true;

  // Per-user theme preference
  var themeKey = 'theme:' + (email || '');
  var themeRow = stgValues.slice(1).find(function(r) { return r[0] === themeKey; });
  result.theme = themeRow ? String(themeRow[1]).toLowerCase() : null;

  return result;
}

// ── ADMIN: SAVE APP-LEVEL SETTING ──
function saveAppSetting(ss, key, value) {
  var ALLOWED_KEYS = ['emailNotif'];
  if (!ALLOWED_KEYS.includes(key)) return { error: 'Unknown setting key: ' + key };
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) return { error: 'Settings sheet not found' };
  var values = sheet.getDataRange().getValues();
  var idx = values.findIndex(function(r, i) { return i > 0 && r[0] === key; });
  if (idx >= 0) {
    sheet.getRange(idx + 1, 2).setValue(String(value));
  } else {
    sheet.appendRow([key, String(value)]);
  }
  return { success: true };
}

// ── ALL-MEMBER: SAVE PER-USER SETTING ──
function saveUserSetting(ss, email, key, value) {
  var ALLOWED_KEYS = ['theme'];
  if (!ALLOWED_KEYS.includes(key)) return { error: 'Unknown setting key: ' + key };
  var ALLOWED_VALUES = { theme: ['dark', 'light'] };
  if (ALLOWED_VALUES[key] && !ALLOWED_VALUES[key].includes(String(value))) return { error: 'Invalid value for ' + key };
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) return { error: 'Settings sheet not found' };
  var compoundKey = key + ':' + email;
  var values = sheet.getDataRange().getValues();
  var idx = values.findIndex(function(r, i) { return i > 0 && r[0] === compoundKey; });
  if (idx >= 0) {
    sheet.getRange(idx + 1, 2).setValue(String(value));
  } else {
    sheet.appendRow([compoundKey, String(value)]);
  }
  return { success: true };
}

// ── WRITE EXPENSE ──
function addExpense(ss, expense, addedBy) {
  const sheet = ss.getSheetByName('Expenses');
  if (!sheet) return { error: 'Expenses sheet not found' };

  // Basic input validation
  if (!expense.id || !expense.date || !expense.name) {
    return { error: 'Invalid expense data' };
  }
  if (isNaN(parseFloat(expense.amount)) || parseFloat(expense.amount) <= 0) {
    return { error: 'Invalid amount' };
  }

  sheet.appendRow([
    expense.id, expense.date, String(expense.name).substring(0, 200),
    expense.category, parseFloat(expense.amount).toFixed(2),
    expense.currency, expense.paidBy, expense.trip,
    expense.splitType, JSON.stringify(expense.splits),
    String(expense.notes || '').substring(0, 500),
    addedBy, new Date().toISOString()
  ]);
  return { success: true };
}

// ── UPDATE EXPENSE ──
function updateExpense(ss, expense, updatedBy) {
  const sheet = ss.getSheetByName('Expenses');
  if (!sheet) return { error: 'Expenses sheet not found' };

  const col = sheet.getRange('A:A').getValues();
  const idx = col.findIndex(function(r, i) { return i > 0 && r[0] === expense.id; });
  if (idx < 0) return { error: 'Expense not found' };

  sheet.getRange(idx + 1, 1, 1, 13).setValues([[
    expense.id, expense.date, String(expense.name).substring(0, 200),
    expense.category, parseFloat(expense.amount).toFixed(2),
    expense.currency, expense.paidBy, expense.trip,
    expense.splitType, JSON.stringify(expense.splits),
    String(expense.notes || '').substring(0, 500),
    updatedBy, new Date().toISOString()
  ]]);
  return { success: true };
}

// ── DELETE EXPENSE ──
function deleteExpense(ss, id) {
  const sheet = ss.getSheetByName('Expenses');
  if (!sheet) return { error: 'Expenses sheet not found' };

  const col = sheet.getRange('A:A').getValues();
  const idx = col.findIndex(function(r, i) { return i > 0 && r[0] === id; });
  if (idx < 0) return { error: 'Expense not found' };

  sheet.deleteRow(idx + 1);
  return { success: true };
}

// ── ADD SETTLEMENT ──
function addSettlement(ss, s) {
  const sheet = ss.getSheetByName('Settlements');
  if (!sheet) return { error: 'Settlements sheet not found' };

  sheet.appendRow([
    s.id, s.date, s.from, s.to,
    parseFloat(s.amount).toFixed(2), s.full, s.note || '',
    new Date().toISOString()
  ]);
  return { success: true };
}

// ── ADMIN: INIT SHEET ──
function initSheet(ss) {
  const needed = ['Expenses', 'Members', 'Trips', 'Settings', 'Settlements'];
  const existing = ss.getSheets().map(function(s) { return s.getName(); });
  needed.forEach(function(name) {
    if (!existing.includes(name)) ss.insertSheet(name);
  });
  // Write headers (safe to call repeatedly)
  ss.getSheetByName('Expenses').getRange('A1:M1').setValues([
    ['ID','Date','Name','Category','Amount','Currency','PaidBy','Trip','SplitType','Splits','Notes','AddedBy','Timestamp']
  ]);
  ss.getSheetByName('Settlements').getRange('A1:H1').setValues([
    ['ID','Date','From','To','Amount','Full','Note','Timestamp']
  ]);
  const stgSheet = ss.getSheetByName('Settings');
  if (stgSheet.getLastRow() < 1) {
    stgSheet.getRange('A1:B1').setValues([['Key','Value']]);
    stgSheet.appendRow(['activeTrip','all']);
  }
  return { success: true };
}

// ── ADMIN: SAVE MEMBERS ──
function saveMembers(ss, members) {
  if (!members || !Array.isArray(members)) return { error: 'Invalid members data' };
  const sheet = ss.getSheetByName('Members');
  if (!sheet) return { error: 'Members sheet not found' };
  sheet.clearContents();
  const rows = [['Name','Email']].concat(members.map(function(m) {
    return [String(m.name || '').substring(0, 100), String(m.email || '').substring(0, 200)];
  }));
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  return { success: true };
}

// ── ADMIN: SAVE TRIPS ──
function saveTrips(ss, trips) {
  if (!trips || !Array.isArray(trips)) return { error: 'Invalid trips data' };
  const sheet = ss.getSheetByName('Trips');
  if (!sheet) return { error: 'Trips sheet not found' };
  sheet.clearContents();
  const rows = [['Name','CreatedDate']].concat(trips.map(function(t) {
    return [String(t).substring(0, 100), new Date().toISOString()];
  }));
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  return { success: true };
}

// ── ADMIN: PERSIST ACTIVE TRIP ──
function persistActiveTrip(ss, tripValue) {
  const sheet = ss.getSheetByName('Settings');
  if (!sheet) return { error: 'Settings sheet not found' };
  const values = sheet.getDataRange().getValues();
  const idx = values.findIndex(function(r, i) { return i > 0 && r[0] === 'activeTrip'; });
  if (idx >= 0) {
    sheet.getRange(idx + 1, 2).setValue(tripValue);
  } else {
    sheet.appendRow(['activeTrip', tripValue]);
  }
  return { success: true };
}

// ── HELPERS ──
function tryParse(s) {
  try { return JSON.parse(s); } catch (e) { return {}; }
}

function jsonOut(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── PUBLIC: CHECK IF EMAIL HAS ACCESS ──
// Returns only {exists: true/false} — no member data exposed
function checkEmail(ss, email) {
  if (!email || typeof email !== 'string') return { exists: false };
  var normalised = email.toLowerCase().trim();
  if (!normalised) return { exists: false };
  // Check admin list
  if (ADMIN_EMAILS.map(function(e) { return e.toLowerCase(); }).includes(normalised)) {
    return { exists: true };
  }
  // Check Members sheet (column B = email)
  try {
    var sheet = ss.getSheetByName('Members');
    if (!sheet || sheet.getLastRow() < 2) return { exists: false };
    var emails = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues()
      .map(function(r) { return String(r[0]).toLowerCase().trim(); })
      .filter(Boolean);
    return { exists: emails.includes(normalised) };
  } catch(e) {
    return { exists: false };
  }
}

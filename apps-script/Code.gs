/**
 * JIKKO Pilotage — API du Google Sheet
 * ------------------------------------
 * À coller dans le Sheet : Extensions → Apps Script → remplacer tout le contenu par ce fichier.
 * Puis : exécuter setup() une fois, et Déployer → Nouveau déploiement → Application Web
 *        (Exécuter en tant que : moi · Accès : Tout le monde).
 *
 * Ce script ne se connecte à aucun service : il range les données de l'app dans le Sheet.
 * Les synchros Shopify, Klaviyo et Intelligems sont faites par Claude (tâche planifiée avec ses connecteurs),
 * qui écrit ici avec le code secret.
 *
 * Chaque collection de l'app = un onglet : id | updatedAt | data (JSON).
 */

var COLLECTIONS = ['scales','inits','abtests','actions','mails','sales','adspend','adimports','recurring','variable','settings','meta'];

/* ---------------- HTTP ---------------- */
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkSecret_(body.secret);
    out = route_(body);
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.ping) return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'jikko-pilotage' })).setMimeType(ContentService.MimeType.JSON);
  return doPost({ postData: { contents: JSON.stringify({ secret: p.secret, op: p.op || 'all' }) } });
}
function checkSecret_(s) {
  var secret = PropertiesService.getScriptProperties().getProperty('APP_SECRET');
  if (!secret) throw new Error('APP_SECRET manquant : exécute setup() dans Apps Script.');
  if (s !== secret) throw new Error('Code secret incorrect.');
}
function route_(b) {
  switch (b.op) {
    case 'all': return { collections: readAll_(), at: Date.now() };
    case 'set': write_(b.c, b.id, b.data, false); return {};
    case 'update': write_(b.c, b.id, b.data, true); return {};
    case 'delete': del_(b.c, b.id); return {};
    case 'add': var id = newId_(); write_(b.c, id, b.data, false); return { id: id };
    case 'batch': return batch_(b.writes || []);
    default: throw new Error('Opération inconnue : ' + b.op);
  }
}

/* ---------------- Stockage ---------------- */
function sheet_(name) {
  if (COLLECTIONS.indexOf(name) < 0) throw new Error('Collection inconnue : ' + name);
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, 3).setValues([['id', 'updatedAt', 'data (JSON)']]).setFontWeight('bold');
    sh.setFrozenRows(1); sh.setColumnWidth(3, 700);
  }
  return sh;
}
function rows_(sh) {
  var n = sh.getLastRow(); if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 3).getValues();
}
function readAll_() {
  var out = {};
  COLLECTIONS.forEach(function (c) {
    out[c] = rows_(sheet_(c)).filter(function (r) { return r[0] !== ''; }).map(function (r) {
      var d = {}; try { d = JSON.parse(r[2] || '{}'); } catch (e) {}
      return { id: String(r[0]), data: d };
    });
  });
  return out;
}
function findRow_(sh, id) {
  var n = sh.getLastRow(); if (n < 2) return -1;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}
function write_(c, id, data, merge) {
  if (!id) throw new Error('id manquant');
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet_(c), row = findRow_(sh, id), now = new Date();
    if (row > 0) {
      var cur = {};
      if (merge) { try { cur = JSON.parse(sh.getRange(row, 3).getValue() || '{}'); } catch (e) {} }
      var next = merge ? Object.assign(cur, data || {}) : (data || {});
      sh.getRange(row, 2, 1, 2).setValues([[now, JSON.stringify(next)]]);
    } else {
      sh.appendRow([String(id), now, JSON.stringify(data || {})]);
    }
  } finally { lock.releaseLock(); }
}
function del_(c, id) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { var sh = sheet_(c), row = findRow_(sh, id); if (row > 0) sh.deleteRow(row); }
  finally { lock.releaseLock(); }
}
function batch_(writes) {
  var ids = [];
  writes.forEach(function (w) {
    if (w.op === 'delete') del_(w.c, w.id);
    else if (w.op === 'add') { var id = newId_(); write_(w.c, id, w.data, false); ids.push(id); }
    else write_(w.c, w.id, w.data, w.op === 'update');
  });
  return { count: writes.length, ids: ids };
}
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 20); }

/* ---------------- Installation ---------------- */
function setup() {
  var P = PropertiesService.getScriptProperties();
  if (!P.getProperty('APP_SECRET')) P.setProperty('APP_SECRET', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  COLLECTIONS.forEach(sheet_);
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  Logger.log('Code secret de l\'app : ' + P.getProperty('APP_SECRET'));
}

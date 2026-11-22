/**
 * JIKKO Pilotage — API du Google Sheet
 * ------------------------------------
 * À coller dans le Sheet : Extensions → Apps Script → remplacer tout le contenu par ce fichier.
 * Puis : exécuter setup() une fois, et Déployer → Nouveau déploiement → Application Web
 *        (Exécuter en tant que : moi · Accès : Tout le monde).
 *
 * Réglages (Paramètres du projet → Propriétés du script) :
 *   APP_SECRET      code secret de l'app (créé automatiquement par setup())
 *   SHOPIFY_STORE   ex : fqfk1v-jb.myshopify.com
 *   SHOPIFY_TOKEN   jeton Admin API d'une app personnalisée Shopify (read_orders, read_products, read_inventory)
 *   KLAVIYO_KEY     clé API privée Klaviyo en lecture seule (campaigns:read, metrics:read)
 *
 * Chaque collection de l'app = un onglet : id | updatedAt | data (JSON).
 */

var COLLECTIONS = ['scales','inits','abtests','actions','mails','sales','adspend','adimports','recurring','variable','settings'];
var TZ = 'America/Los_Angeles';
var KLAVIYO_REVISION = '2024-10-15';
var METRIC_ORDER = 'YkK2Fb';   // Placed Order
var METRIC_SUB = 'TZHynh';     // Subscribed to List

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
    case 'syncShopify': return syncShopify_(b.from, b.to);
    case 'syncKlaviyo': return syncKlaviyo_();
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

/* ---------------- Shopify : ventes par jour ---------------- */
function syncShopify_(from, to) {
  var P = PropertiesService.getScriptProperties(), store = P.getProperty('SHOPIFY_STORE'), token = P.getProperty('SHOPIFY_TOKEN');
  if (!store || !token) throw new Error('SHOPIFY_STORE ou SHOPIFY_TOKEN manquant dans les propriétés du script.');
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  from = from || today; to = to || today;
  var q = 'created_at:>=' + from + 'T00:00:00-08:00 created_at:<=' + to + 'T23:59:59-08:00 -test:true';
  var days = {}, cursor = null, pages = 0;
  do {
    var gql = 'query($q:String!,$c:String){orders(first:100,after:$c,query:$q,sortKey:CREATED_AT){pageInfo{hasNextPage endCursor} nodes{createdAt test cancelledAt '
      + 'subtotalLineItemsQuantity '
      + 'totalDiscountsSet{shopMoney{amount}} subtotalPriceSet{shopMoney{amount}} totalShippingPriceSet{shopMoney{amount}} totalTaxSet{shopMoney{amount}} '
      + 'totalPriceSet{shopMoney{amount}} totalRefundedSet{shopMoney{amount}} '
      + 'lineItems(first:30){nodes{quantity originalUnitPriceSet{shopMoney{amount}} variant{inventoryItem{unitCost{amount}}}}}}}}';
    var res = shopifyGql_(store, token, gql, { q: q, c: cursor });
    var o = res.data.orders;
    o.nodes.forEach(function (n) {
      if (n.test) return;
      var d = Utilities.formatDate(new Date(n.createdAt), TZ, 'yyyy-MM-dd');
      var x = days[d] || (days[d] = { date: d, orders: 0, units: 0, gross: 0, discounts: 0, returns: 0, net: 0, shipping: 0, taxes: 0, total: 0, cogs: 0, cogsLines: 0, lines: 0 });
      var num = function (m) { return m && m.shopMoney ? parseFloat(m.shopMoney.amount) || 0 : 0; };
      var gross = 0, cogs = 0;
      n.lineItems.nodes.forEach(function (li) {
        gross += (parseFloat(li.originalUnitPriceSet.shopMoney.amount) || 0) * li.quantity;
        x.lines++;
        var uc = li.variant && li.variant.inventoryItem && li.variant.inventoryItem.unitCost;
        if (uc && uc.amount != null) { cogs += parseFloat(uc.amount) * li.quantity; x.cogsLines++; }
      });
      var disc = num(n.totalDiscountsSet), ref = num(n.totalRefundedSet);
      x.orders++; x.units += n.subtotalLineItemsQuantity || 0;
      x.gross += gross; x.discounts -= disc; x.returns -= ref;
      x.net += gross - disc - ref; x.shipping += num(n.totalShippingPriceSet); x.taxes += num(n.totalTaxSet); x.total += num(n.totalPriceSet) - ref;
      x.cogs += cogs;
    });
    cursor = o.pageInfo.hasNextPage ? o.pageInfo.endCursor : null; pages++;
  } while (cursor && pages < 60);
  var writes = Object.keys(days).map(function (d) {
    var x = days[d], r2 = function (v) { return Math.round(v * 100) / 100; };
    return { op: 'set', c: 'sales', id: d, data: { date: d, orders: x.orders, units: x.units, gross: r2(x.gross), discounts: r2(x.discounts), returns: r2(x.returns), net: r2(x.net), shipping: r2(x.shipping), taxes: r2(x.taxes), total: r2(x.total), cogs: x.cogsLines ? r2(x.cogs) : null, source: 'shopify-orders', syncedAt: Date.now() } };
  });
  batch_(writes);
  return { days: writes.length };
}
function shopifyGql_(store, token, query, variables) {
  var r = UrlFetchApp.fetch('https://' + store + '/admin/api/2025-01/graphql.json', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'X-Shopify-Access-Token': token },
    payload: JSON.stringify({ query: query, variables: variables })
  });
  var j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() >= 300 || j.errors) throw new Error('Shopify : ' + JSON.stringify(j.errors || r.getContentText()).slice(0, 300));
  return j;
}

/* ---------------- Klaviyo : campagnes + stats ---------------- */
function klaviyo_(path, method, payload) {
  var key = PropertiesService.getScriptProperties().getProperty('KLAVIYO_KEY');
  if (!key) throw new Error('KLAVIYO_KEY manquant dans les propriétés du script.');
  var r = UrlFetchApp.fetch(path.indexOf('http') === 0 ? path : 'https://a.klaviyo.com/api/' + path, {
    method: method || 'get', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Klaviyo-API-Key ' + key, revision: KLAVIYO_REVISION, accept: 'application/json' },
    payload: payload ? JSON.stringify(payload) : null
  });
  var j = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() >= 300) throw new Error('Klaviyo : ' + JSON.stringify(j.errors || j).slice(0, 300));
  return j;
}
function syncKlaviyo_() {
  var cutoff = Date.now() - 365 * 864e5, camps = [], url = 'campaigns?filter=' + encodeURIComponent("equals(messages.channel,'email')") + '&include=campaign-messages&sort=-created_at';
  for (var page = 0; url && page < 10; page++) {
    var j = klaviyo_(url), inc = {}, old = false;
    (j.included || []).forEach(function (m) { if (m.type === 'campaign-message') inc[m.id] = m; });
    (j.data || []).forEach(function (c) {
      var a = c.attributes || {}; if (Date.parse(a.created_at || 0) < cutoff) { old = true; return; }
      var st = String(a.status || '').toLowerCase();
      if (st === 'draft' || st === 'cancelled' || st === 'canceled') return;
      var ids = ((c.relationships || {})['campaign-messages'] || {}).data || [];
      var msgs = ids.map(function (r) { var m = inc[r.id] || {}; var md = (m.attributes || {}).definition || m.attributes || {};
        return { id: r.id, name: md.name || (m.attributes || {}).label || 'Envoi', status: st === 'scheduled' ? 'scheduled' : 'sent', sendTime: a.send_time || a.scheduled_at || null }; });
      if (msgs.length) camps.push({ id: c.id, name: a.name || 'Campagne', status: st === 'scheduled' ? 'scheduled' : 'sent', sentAt: a.send_time || a.scheduled_at || null, messages: msgs });
    });
    url = (!old && j.links && j.links.next) || null;
  }
  var sentIds = []; camps.forEach(function (c) { if (c.status === 'sent') c.messages.forEach(function (m) { sentIds.push(m.id); }); });
  var stats = {}, tf = { start: new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 19) + 'Z', end: new Date().toISOString().slice(0, 19) + 'Z' };
  var run = function (metric, withValue) {
    for (var i = 0; i < sentIds.length; i += 40) {
      var ch = sentIds.slice(i, i + 40);
      var attrs = { statistics: ['recipients', 'delivered', 'opens_unique', 'clicks_unique', 'conversion_uniques', 'unsubscribe_uniques', 'spam_complaints'],
        conversion_metric_id: metric, timeframe: tf, group_by: ['campaign_id', 'campaign_message_id'],
        filter: 'contains-any(campaign_message_id,["' + ch.join('","') + '"])' };
      if (withValue) attrs.value_statistics = ['conversion_value'];
      var j = klaviyo_('campaign-values-reports', 'post', { data: { type: 'campaign-values-report', attributes: attrs } });
      (((j.data || {}).attributes || {}).results || []).forEach(function (r) {
        var id = (r.groupings || {}).campaign_message_id, s = r.statistics || {}; if (!id) return;
        var o = stats[id] || (stats[id] = { recipients: 0, delivered: 0, opens: 0, clicks: 0, orders: 0, revenue: 0, signups: 0, unsubs: 0, spam: 0 });
        if (withValue) { o.recipients = s.recipients || 0; o.delivered = s.delivered || 0; o.opens = s.opens_unique || 0; o.clicks = s.clicks_unique || 0; o.orders = s.conversion_uniques || 0; o.revenue = s.conversion_value || 0; o.unsubs = s.unsubscribe_uniques || 0; o.spam = s.spam_complaints || 0; }
        else o.signups = s.conversion_uniques || 0;
      });
      Utilities.sleep(1200);
    }
  };
  run(METRIC_ORDER, true); run(METRIC_SUB, false);
  var existing = {}; readAll_().mails.forEach(function (m) { existing[m.id] = m.data; });
  var writes = camps.map(function (c) {
    var msgs = c.messages.map(function (m) { return Object.assign({}, m, { stats: stats[m.id] || null }); });
    var rec = { name: c.name, status: c.status, sentAt: c.sentAt, messages: msgs, syncedAt: Date.now() };
    return existing[c.id] ? { op: 'update', c: 'mails', id: c.id, data: rec } : { op: 'set', c: 'mails', id: c.id, data: Object.assign({ objective: null, note: '' }, rec) };
  });
  batch_(writes);
  return { campaigns: writes.length };
}

/* ---------------- Installation & synchro de nuit ---------------- */
function setup() {
  var P = PropertiesService.getScriptProperties();
  if (!P.getProperty('APP_SECRET')) P.setProperty('APP_SECRET', Utilities.getUuid().replace(/-/g, '').slice(0, 16));
  if (!P.getProperty('SHOPIFY_STORE')) P.setProperty('SHOPIFY_STORE', 'fqfk1v-jb.myshopify.com');
  COLLECTIONS.forEach(sheet_);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'nightlySync') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('nightlySync').timeBased().everyDays(1).atHour(5).inTimezone(TZ).create();
  Logger.log('Code secret de l\'app : ' + P.getProperty('APP_SECRET'));
}
function nightlySync() {
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var from = Utilities.formatDate(new Date(Date.now() - 3 * 864e5), TZ, 'yyyy-MM-dd');
  try { syncShopify_(from, today); } catch (e) { console.warn(e); }
  try { syncKlaviyo_(); } catch (e) { console.warn(e); }
}

/* JIKKO Pilotage · connexion au Google Sheet (remplace le stockage claude.ai) */
(function () {
  var URL_KEY = 'jk_api', SEC_KEY = 'jk_secret';
  var DEFAULT_URL = window.JK_DEFAULT_API || '';
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  window.JK_STANDALONE = true;
  var api = get(URL_KEY) || DEFAULT_URL, secret = get(SEC_KEY);
  var store = null, L = {}, pending = 0;

  function call(op, p) {
    pending++;
    return fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ secret: secret, op: op }, p || {})) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error(j.error || 'Erreur du Sheet'); return j; })
      .finally(function () { pending--; });
  }
  window.JK_call = call;
  function snap(n) { var arr = (store && store[n]) || []; return { docs: arr.map(function (x) { return { id: x.id, data: function () { return x.data; } }; }) }; }
  function fire(n) { (L[n] || []).forEach(function (cb) { try { cb(snap(n)); } catch (e) { console.warn(e); } }); }
  function load() {
    if (!api || !secret) return Promise.resolve();
    if (pending > 0) return Promise.resolve();
    return call('all').then(function (j) { store = j.collections || {}; Object.keys(L).forEach(fire); setTimeout(showSync, 50); })
      .catch(function (e) { console.warn(e); if (/secret|APP_SECRET/i.test(e.message)) showLogin(e.message); });
  }
  window.JK_refresh = load;
  window.JK_store = function (c, id) { var arr = (store && store[c]) || []; for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i].data; return null; };
  function ago(ts) { var m = Math.round((Date.now() - ts) / 60000); return m < 60 ? 'il y a ' + Math.max(1, m) + ' min' : m < 1440 ? 'il y a ' + Math.round(m / 60) + ' h' : 'le ' + new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
  function showSync() { var f = document.getElementById('foot'); var m = window.JK_store('meta', 'lastSync'), r = window.JK_store('meta', 'syncRequest'); if (!f) return;
    var t = m && m.at ? 'Dernière synchro par Claude ' + ago(m.at) + '.' : 'Pas encore de synchro par Claude.';
    if (r && r.at && (!m || !m.at || r.at > m.at)) t += ' Demande en attente (' + (r.source || 'tout') + ').';
    f.textContent = t; }
  window.JK_requestSync = function (source, extra) {
    var d = Object.assign({ source: source, at: Date.now() }, extra || {});
    return col('meta').doc('syncRequest').set(d).then(function () { showSync(); if (window.toast) window.toast('Demande envoyée : Claude synchronise au prochain passage'); else alert('Demande envoyée à Claude'); })
      .catch(function (e) { if (window.toast) window.toast(e.message || 'Demande impossible'); });
  };
  function local(n, id, d, merge) { store = store || {}; var arr = store[n] = store[n] || []; var ex = null; arr.forEach(function (x) { if (x.id === id) ex = x; }); if (ex) ex.data = merge ? Object.assign({}, ex.data, d) : d; else arr.push({ id: id, data: d }); fire(n); }
  function localDel(n, id) { if (!store || !store[n]) return; store[n] = store[n].filter(function (x) { return x.id !== id; }); fire(n); }
  function rid() { return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6); }
  function col(n) {
    return {
      onSnapshot: function (cb) { (L[n] = L[n] || []).push(cb); if (store) setTimeout(function () { cb(snap(n)); }, 0); return function () { L[n] = (L[n] || []).filter(function (x) { return x !== cb; }); }; },
      doc: function (id) { return {
        set: function (d) { local(n, id, d, false); return call('set', { c: n, id: id, data: d }); },
        update: function (d) { local(n, id, d, true); return call('update', { c: n, id: id, data: d }); },
        delete: function () { localDel(n, id); return call('delete', { c: n, id: id }); }
      }; },
      add: function (d) { var id = rid(); local(n, id, d, false); return call('set', { c: n, id: id, data: d }).then(function () { return { id: id }; }); }
    };
  }
  var db = { collection: col, doc: function (path) { var a = path.split('/'); return col(a[0]).doc(a[1]); } };
  var mcp = { callTool: function () { return Promise.reject({ code: 'server_not_connected', message: 'Non disponible dans l\'app autonome' }); } };
  window.claude = { use: function (name) { return new Promise(function (res) {
    if (!api || !secret) { res(null); return; }
    if (name === 'db') res(db); else if (name === 'user') res({ can: function () { return true; } });
    else if (name === 'mcp') res(mcp); else if (name === 'permissions') res({ state: function () { return Promise.resolve('granted'); } });
    else res(null);
  }); } };

  function showLogin(msg) {
    if (document.getElementById('jk-login')) return;
    var o = document.createElement('div'); o.id = 'jk-login';
    o.innerHTML = '<form class="jkl"><img src="logo.png" alt="JIKKO"><h2>Pilotage JIKKO</h2><p>Connecte l\'app à ton Google Sheet.</p>' +
      (msg ? '<p class="jkl-err">' + String(msg).replace(/[<>&]/g, '') + '</p>' : '') +
      '<label>Adresse du script Google<input id="jkl-url" type="url" placeholder="https://script.google.com/macros/s/…/exec" required></label>' +
      '<label>Code secret<input id="jkl-sec" type="password" autocomplete="current-password" required></label>' +
      '<button type="submit">Se connecter</button></form>';
    document.body.appendChild(o);
    document.getElementById('jkl-url').value = api || '';
    o.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var u = document.getElementById('jkl-url').value.trim(), s = document.getElementById('jkl-sec').value.trim();
      var btn = o.querySelector('button'); btn.disabled = true; btn.textContent = 'Vérification…';
      fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret: s, op: 'all' }) })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j.ok) throw new Error(j.error || 'Connexion refusée'); put(URL_KEY, u); put(SEC_KEY, s); location.reload(); })
        .catch(function (err) { btn.disabled = false; btn.textContent = 'Se connecter'; var p = o.querySelector('.jkl-err') || o.querySelector('form').insertBefore(document.createElement('p'), o.querySelector('label')); p.className = 'jkl-err'; p.textContent = err.message || 'Adresse ou code incorrect.'; });
    });
  }
  window.JK_logout = function () { try { localStorage.removeItem(SEC_KEY); } catch (e) {} location.reload(); };
  if (!api || !secret) { document.addEventListener('DOMContentLoaded', function () { showLogin(); }); } else load();
  setInterval(function () { if (document.visibilityState === 'visible') load(); }, 45000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') load(); });
})();

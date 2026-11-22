"""Construit index.html (app autonome) à partir de la page de l'outil claude.ai.
Usage : python3 build/build.py <chemin de la page source>
"""
import sys, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1]).read_text()

def rep(s, a, b):
    assert a in s, a[:90]
    return s.replace(a, b, 1)

body = src
title = re.search(r'<title>(.*?)</title>', body).group(1)
body = re.sub(r'<title>.*?</title>\n?', '', body, count=1)
body = body.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
links = re.findall(r'<link [^>]*>\n?', body.split('<style>')[0])
for l in links: body = body.replace(l, '', 1)
body = body.replace('/_blob/297b2553e9001b62dbbdc3becb60d35b', 'logo.png')

# --- Shopify : synchro via le script Google
body = rep(body, "  function shopSync(cb){\n    var fin=function(){ if(cb) cb(); };",
"""  function shopSync(cb){
    var fin=function(){ if(cb) cb(); };
    if(window.JK_STANDALONE){
      if(ro()){ fin(); return; }
      var R0=curRange(), t0=ymd(new Date());
      JK_requestSync('shopify',{from:R0[0],to:(R0[1]>t0?t0:R0[1])}).then(fin,fin);
      return;
    }""")
# --- Klaviyo
body = rep(body, "    if(!mcpReady){ toast('Connexion Klaviyo indisponible ici'); return; }",
"""    if(window.JK_STANDALONE){ JK_requestSync('klaviyo',{}); return; }
    if(!mcpReady){ toast('Connexion Klaviyo indisponible ici'); return; }""")
# --- toast accessible à l'adaptateur
body = rep(body, "  function toast(t){ var el=$('toast');", "  window.toast=function(t){ toast(t); };\n  function toast(t){ var el=$('toast');")
# --- résultats Intelligems : demande à Claude
body = rep(body, "  function igSync(id,quiet){\n", "  function igSync(id,quiet){\n    if(window.JK_STANDALONE){ if(!quiet) JK_requestSync('intelligems',{testId:id}); return Promise.resolve(); }\n")
# --- Intelligems : pas d'API dans l'app autonome
body = rep(body, "  function igLoad(force){\n", "  function igLoad(force){\n    if(window.JK_STANDALONE){ var st=(window.JK_store&&JK_store('meta','igList'))||null; if(st&&st.list){ ig.list=st.list; ig.state='ok'; } else ig.state='nomcp'; igRender(); return; }\n")
body = rep(body, "Elle marche quand l\\'outil est ouvert sur claude.ai avec le connecteur Intelligems.",
               "Claude synchronise les tests Intelligems reliés chaque matin. Pour en relier un, utilise le champ « Test Intelligems » de sa fiche.")
body = body.replace("Aperçu : la sauvegarde partagée s\\'active sur la page publiée.", "Connecte l\\'app à ton Google Sheet pour charger les données.")

head = f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title} Pilotage</title>
<meta name="theme-color" content="#e7e7ea">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="JIKKO">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">
{''.join(links)}<style>
:root{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);color-scheme:light}}
html,body{{margin:0}} body{{font:14px system-ui,sans-serif}} img{{max-width:100%}} [hidden]{{display:none!important}}
#jk-login{{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:rgba(231,231,234,.92);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}}
.jkl{{width:100%;max-width:380px;background:#fff;border-radius:24px;padding:28px 24px;box-shadow:0 30px 70px -20px rgba(20,20,30,.3);display:flex;flex-direction:column;gap:12px;font-family:Inter,system-ui,sans-serif}}
.jkl img{{width:90px;align-self:center}} .jkl h2{{margin:4px 0 0;text-align:center;font-family:'Instrument Sans',Inter,sans-serif;font-weight:500;font-size:22px}}
.jkl p{{margin:0;text-align:center;color:#5d5d64;font-size:14px}} .jkl .jkl-err{{color:#e2453c}}
.jkl label{{display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:#5d5d64}}
.jkl input{{border:1px solid rgba(19,19,22,.14);border-radius:12px;padding:12px;font-size:15px}}
.jkl button{{margin-top:6px;border:0;border-radius:999px;background:#131316;color:#fff;padding:13px;font-size:15px;font-weight:600}}
</style>
<script src="config.js"></script>
<script src="adapter.js"></script>
</head>
<body>
'''
out = head + body + '''
<script>if('serviceWorker' in navigator){ window.addEventListener('load',function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); }); }</script>
</body>
</html>
'''
(root / 'index.html').write_text(out)
print('index.html', len(out))

"""Serveur de test local : sert l'app et imite le script Google (/api) avec les données de migration/."""
import json, os, glob, http.server, pathlib, uuid
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = {}
for f in glob.glob(str(ROOT / 'migration' / '*' / '*.json')):
    c = pathlib.Path(f).parent.name
    DATA.setdefault(c, []).append({'id': pathlib.Path(f).stem, 'data': json.load(open(f))})
SECRET = 'test'

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(ROOT), **k)
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        out = {'ok': True}
        if body.get('secret') != SECRET: out = {'ok': False, 'error': 'Code secret incorrect.'}
        else:
            op = body.get('op'); c = body.get('c')
            if op == 'all': out['collections'] = DATA
            elif op in ('set', 'update'):
                arr = DATA.setdefault(c, []); ex = next((x for x in arr if x['id'] == body['id']), None)
                if ex: ex['data'] = {**ex['data'], **body['data']} if op == 'update' else body['data']
                else: arr.append({'id': body['id'], 'data': body['data']})
            elif op == 'delete': DATA[c] = [x for x in DATA.get(c, []) if x['id'] != body['id']]
        b = json.dumps(out).encode()
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def log_message(self, *a): pass

http.server.ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('PORT', 8765))), H).serve_forever()

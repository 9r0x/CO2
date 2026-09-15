/* Browser tests: serves the repo, drives headless Chrome over the DevTools protocol and runs
 * the scenarios in test/scenarios.js. Run: node test/browser.js
 * Chrome is taken from $CHROME, else from the first of a few usual locations that exists.
 * SHOTS=dir saves a screenshot wherever a scenario asks for one. */
'use strict';
var fs = require('fs');
var path = require('path');
var http = require('http');
var https = require('https');
var os = require('os');
var { spawn, spawnSync } = require('child_process');
var scenarios = require('./scenarios.js');

var ROOT = path.join(__dirname, '..');
var TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.md': 'text/plain' };
var CANDIDATES = [
  process.env.CHROME,
  path.join(os.homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'),
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* knobs.delay holds every response for that many ms; knobs.bump serves index.html and sw.js as if the
 * asset version were one higher, which is what a user sees right after a deploy. */
function handler(knobs, req, res) {
  var file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (file.endsWith('/')) { file += 'index.html'; }
  fs.readFile(file, function (err, data) {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    if (knobs.bump && /(index\.html|sw\.js)$/.test(file)) {
      data = Buffer.from(String(data).replace(/\?v=(\d+)/g, function (m, n) { return '?v=' + (+n + 1); })
        .replace(/breathtrainer-v(\d+)/, function (m, n) { return 'breathtrainer-v' + (+n + 1); }));
    }
    setTimeout(function () {
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    }, knobs.delay || 0);
  });
}

/* Serves the repo over http, or over https with the given cert; stop() also cuts live connections
 * so a page really is offline afterwards. */
function serve(tls) {
  var knobs = { delay: 0, bump: false };
  var handle = function (req, res) { handler(knobs, req, res); };
  var server = tls ? https.createServer(tls, handle) : http.createServer(handle);
  var sockets = new Set();
  server.on('connection', function (s) { sockets.add(s); s.on('close', function () { sockets.delete(s); }); });
  return new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', function () {
      resolve({
        server: server,
        port: server.address().port,
        base: (tls ? 'https' : 'http') + '://127.0.0.1:' + server.address().port,
        knobs: knobs,
        stop: function () { sockets.forEach(function (s) { s.destroy(); }); server.close(); }
      });
    });
  });
}

/* A throwaway certificate for the https server; null when openssl is not around. */
function makeCert(dir) {
  var key = path.join(dir, 'key.pem');
  var cert = path.join(dir, 'cert.pem');
  var r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' });
  if (r.status !== 0) { return null; }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

async function launch(profile) {
  var chrome = CANDIDATES.find(function (p) { return fs.existsSync(p); });
  if (!chrome) { throw new Error('no Chrome found; set CHROME=/path/to/chrome'); }
  var proc = spawn(chrome, [
    '--headless=new', '--remote-debugging-port=0', '--no-sandbox', '--disable-gpu', '--ignore-certificate-errors',
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--disable-dev-shm-usage',
    '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  var stderr = '';
  proc.stderr.on('data', function (d) { stderr += d; });
  var portFile = path.join(profile, 'DevToolsActivePort');   // Chrome writes the port it actually got
  for (var i = 0; i < 100; i++) {
    try {
      var port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10);
      await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
      return { proc: proc, port: port };
    } catch (e) { await sleep(100); }
  }
  proc.kill('SIGKILL');
  throw new Error('Chrome did not start\n' + stderr);
}

async function connect(port) {
  var target = await (await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })).json();
  var ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(function (res, rej) { ws.onopen = res; ws.onerror = rej; });
  var id = 0;
  var pending = new Map();
  var logs = [];
  ws.onclose = function () {
    pending.forEach(function (fn) { fn({ error: 'connection closed' }); });
    pending.clear();
  };
  ws.onmessage = function (m) {
    var msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method === 'Runtime.exceptionThrown') {
      var d = msg.params.exceptionDetails;
      logs.push('EXCEPTION: ' + ((d.exception && d.exception.description) || d.text));
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      logs.push('console.error: ' + msg.params.args.map(function (a) { return a.value || a.description; }).join(' '));
    } else if (msg.method === 'Network.loadingFailed' && (msg.params.type === 'Script' || msg.params.type === 'Stylesheet')) {
      logs.push('asset failed: ' + msg.params.type + ' ' + msg.params.errorText);
    }
  };
  function send(method, params) {
    return new Promise(function (res, rej) {
      var mid = ++id;
      pending.set(mid, function (msg) { msg.error ? rej(new Error(method + ': ' + JSON.stringify(msg.error))) : res(msg.result); });
      ws.send(JSON.stringify({ id: mid, method: method, params: params || {} }));
    });
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  return { send: send, logs: logs, close: function () { ws.close(); } };
}

function makePage(cdp, base) {
  var send = cdp.send;
  async function evaluate(expression) {
    var r = await send('Runtime.evaluate', { expression: expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error('eval failed: ' + ((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text) + '\n  in: ' + expression);
    }
    return r.result.value;
  }
  return {
    send: send,
    sleep: sleep,
    evaluate: evaluate,
    base: base,
    /* Loads the app with empty storage; extra is JS to run on a blank same-origin page first. */
    open: async function (extra, hash) {
      await send('Page.navigate', { url: base + '/sw.js' });
      await sleep(300);
      await evaluate('localStorage.clear(); ' + (extra || ''));
      await send('Page.navigate', { url: base + '/index.html' + (hash || '') });
      await sleep(900);
    },
    go: async function (url) {
      var r = await send('Page.navigate', { url: url });
      if (r.errorText) { throw new Error('navigation failed: ' + r.errorText); }
      await sleep(900);
    },
    click: function (sel) {
      return evaluate('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); if(!e) throw new Error("no "+' + JSON.stringify(sel) + '); e.click(); return true;})()');
    },
    text: function (sel) { return evaluate('document.querySelector(' + JSON.stringify(sel) + ').textContent'); },
    value: function (sel) { return evaluate('document.querySelector(' + JSON.stringify(sel) + ').value'); },
    hidden: function (sel) { return evaluate('document.querySelector(' + JSON.stringify(sel) + ').hidden'); },
    count: function (sel) { return evaluate('document.querySelectorAll(' + JSON.stringify(sel) + ').length'); },
    set: function (sel, value) {
      return evaluate('(function(){var e=document.querySelector(' + JSON.stringify(sel) + '); e.value=' + JSON.stringify(value) + '; e.dispatchEvent(new Event("change")); return true;})()');
    },
    mode: function (name) {
      return evaluate('[...document.querySelectorAll(".mode")].find(function(b){return b.textContent===' + JSON.parse(JSON.stringify(JSON.stringify(name))) + '}).click()');
    },
    /* A real key press through the input pipeline, so default actions and focus matter as in a browser. */
    key: async function (key) {
      var codes = { ' ': 'Space', Escape: 'Escape', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
      var code = codes[key] || ('Key' + key.toUpperCase());
      var vk = { ' ': 32, Escape: 27, ArrowLeft: 37, ArrowRight: 39 }[key] || key.toUpperCase().charCodeAt(0);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: key, code: code, windowsVirtualKeyCode: vk, text: key.length === 1 ? key : undefined });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: key, code: code, windowsVirtualKeyCode: vk });
      await sleep(250);
    },
    viewport: async function (w, h) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
      await sleep(200);
    },
    shot: async function (name) {
      if (!process.env.SHOTS) { return; }
      fs.mkdirSync(process.env.SHOTS, { recursive: true });
      var r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(process.env.SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
    }
  };
}

async function main() {
  var site = await serve();
  var profile = fs.mkdtempSync(path.join(os.tmpdir(), 'breath-trainer-test-'));
  var tls = makeCert(profile);
  var secure = tls ? await serve(tls) : null;
  var chrome = await launch(profile);
  var passed = 0;
  var failed = 0;
  function bail() { chrome.proc.kill('SIGKILL'); process.exit(1); }
  process.on('SIGTERM', bail);
  process.on('SIGINT', bail);
  try {
    var cdp = await connect(chrome.port);
    var page = makePage(cdp, site.base);
    page.secure = secure;
    page.startSecure = function () { return serve(tls); };   // a fresh https server for a scenario that stops it
    await page.viewport(390, 844);
    for (var i = 0; i < scenarios.length; i++) {
      var sc = scenarios[i];
      cdp.logs.length = 0;
      if (sc.https && !secure) { console.log('skip ' + sc.name + ' (no openssl for an https server)'); continue; }
      try {
        await Promise.race([sc.run(page), new Promise(function (res, rej) { setTimeout(function () { rej(new Error('timed out after 90 s')); }, 90000); })]);
        if (cdp.logs.length) { throw new Error('page errors:\n     ' + cdp.logs.join('\n     ')); }
        passed++;
        console.log('ok   ' + sc.name);
      } catch (e) {
        failed++;
        console.log('FAIL ' + sc.name + '\n     ' + (e && e.message));
      }
    }
    cdp.close();
  } finally {
    chrome.proc.kill('SIGKILL');
    site.stop();
    if (secure) { secure.stop(); }
    fs.rmSync(profile, { recursive: true, force: true });
  }
  console.log(passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : ''));
  process.exitCode = failed ? 1 : 0;
}

main().catch(function (e) { console.error(e); process.exit(1); });

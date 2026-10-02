// Run with Node 22+ and Microsoft Edge installed. No npm dependencies required.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'test-results');
fs.mkdirSync(artifacts, { recursive: true });
const profile = fs.mkdtempSync(path.join(artifacts, 'edge-'));
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
let edge, ws;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  edge = spawn(process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch {}
    await sleep(100);
  }
  assert.ok(port, 'Edge debugger started');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.id) {
      const task = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) task.reject(new Error(data.error.message)); else task.resolve(data.result);
    }
    if (data.method === 'Runtime.exceptionThrown') errors.push(data.params.exceptionDetails.text);
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function run(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  // Smoke tests never transmit writing samples or download optional AI models.
  await send('Network.setBlockedURLs', { urls: ['https://*', 'http://api.*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  for (let i = 0; i < 100; i++) { if (await run('!!window.Usability && !!window.quill && !!document.querySelector(".ql-editor[role]")')) break; await sleep(100); }
  assert.equal(await run('document.querySelector(".ql-editor").getAttribute("aria-label")'), 'Document content');
  await run(`window.quill.setContents({ops:[{insert:'alpha ',attributes:{background:'#00ff00'}},{insert:'alpha beta\\n'}]}, 'user'); document.getElementById('doc-title').value='Smoke draft'; document.getElementById('doc-title').dispatchEvent(new Event('input'));`);
  assert.equal(await run('AutoSave.isDirty()'), true);
  await sleep(1200);
  assert.equal(await run('JSON.parse(localStorage.docpdf_draft).title'), 'Smoke draft');
  await run(`window.beforeFind = JSON.stringify(quill.getContents()); FindReplace.open(); document.getElementById('find-input').value='alpha'; document.getElementById('find-input').dispatchEvent(new Event('input'));`);
  assert.equal(await run('document.getElementById("match-counter").textContent'), '1 / 2');
  assert.equal(await run('JSON.stringify(quill.getContents()) === window.beforeFind'), true);
  await run(`document.getElementById('replace-input').value='longer'; document.getElementById('replace-all-btn').click();`);
  assert.equal(await run('quill.getText()'), 'longer longer beta\n');
  await run('quill.history.undo()');
  assert.equal(await run('JSON.stringify(quill.getContents()) === window.beforeFind'), true);
  await run('FindReplace.close(); AutoSave.flush()');
  await send('Page.reload');
  await sleep(700);
  assert.equal(await run('quill.getText()'), 'alpha alpha beta\n');
  assert.equal(await run('document.getElementById("doc-title").value'), 'Smoke draft');
  await run(`window.originalSetItem=Storage.prototype.setItem; Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}; quill.insertText(0,'x','user'); AutoSave.save();`);
  assert.equal(await run('AutoSave.isDirty()'), true);
  assert.equal(await run('document.getElementById("indicator-text").textContent'), 'Not saved — export a copy');
  await run('Storage.prototype.setItem=window.originalSetItem; AutoSave.flush()');
  await run(`quill.setContents({ops:[{insert:{image:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}},{insert:'\\n'}]},'user'); AutoSave.flush()`);
  await send('Page.reload');
  await sleep(600);
  assert.equal(await run('quill.getContents().ops[0].insert.image.src.startsWith("data:")'), true);
  await run(`quill.insertText(1,'alpha','user'); FindReplace.open(); document.getElementById('find-input').value='alpha'; document.getElementById('find-input').dispatchEvent(new Event('input')); document.getElementById('replace-input').value='beta'; document.getElementById('replace-one-btn').click(); FindReplace.close();`);
  assert.equal(await run('quill.getText()'), 'beta\n');
  assert.equal(await run('typeof quill.getContents().ops[0].insert'), 'object');
  await run(`document.getElementById('new-doc-btn').click()`);
  await sleep(50);
  assert.equal(await run('document.activeElement.id'), 'modal-cancel');
  await run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  assert.equal(await run('document.getElementById("new-doc-modal").classList.contains("hidden")'), true);
  await run(`document.getElementById('help-btn').click()`);
  assert.equal(await run('document.getElementById("help-dialog").open'), true);
  await run(`document.getElementById('help-dialog').close()`);
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: artifacts });
  await run(`quill.setText('Export smoke test\\n','user'); document.getElementById('export-txt-item').click(); document.getElementById('export-html-item').click();`);
  await run('ExportPDF.export()');
  await sleep(500);
  assert.equal(await run('document.getElementById("page-canvas").style.getPropertyValue("--page-count")'), '1', 'Short document stays on one page after export');
  const downloads = fs.readdirSync(artifacts);
  for (const ext of ['.txt', '.html', '.pdf']) assert.ok(downloads.some(name => name.endsWith(ext)), `${ext} download`);
  await run(`window.printOpened=false; window.open = function(url){window.printOpened=url.startsWith('blob:'); return {};}; ExportPDF.print()`);
  assert.equal(await run('window.printOpened'), true);
  await send('Page.captureScreenshot').then(result => fs.writeFileSync(path.join(artifacts, 'desktop.png'), Buffer.from(result.data, 'base64')));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await run('StatsPanel.open()');
  assert.equal(await run('getComputedStyle(document.getElementById("stats-panel")).display'), 'flex');
  await run('StatsPanel.close()');
  await sleep(150);
  assert.equal(await run('document.getElementById("page-canvas").style.getPropertyValue("--page-count")'), '1', 'Resize does not create blank pages');
  assert.equal(await run(`['help-btn','new-doc-btn','export-pdf-btn','theme-toggle'].every(id => {const r=document.getElementById(id).getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth;})`), true);
  await send('Page.captureScreenshot').then(result => fs.writeFileSync(path.join(artifacts, 'mobile.png'), Buffer.from(result.data, 'base64')));
  await run(`quill.setText(('A paragraph for pagination.\\n').repeat(80), 'user')`);
  await sleep(150);
  assert.ok(await run('Number(document.getElementById("page-canvas").style.getPropertyValue("--page-count")) > 1'));
  await run(`quill.setText('Short again\\n','user')`);
  await sleep(150);
  assert.equal(await run('document.getElementById("page-canvas").style.getPropertyValue("--page-count")'), '1', 'Deleting content removes automatic pages');
  await run(`document.getElementById('new-doc-btn').click(); document.getElementById('modal-confirm').click()`);
  await send('Page.reload');
  await sleep(600);
  assert.equal(await run('quill.getText()'), '\n', 'New document does not resurrect the old draft');
  await run(`localStorage.removeItem('docpdf_draft'); localStorage.setItem('docpdf_content', JSON.stringify({ops:[{insert:'Legacy draft\\n'}]})); localStorage.setItem('docpdf_title', 'Legacy title')`);
  await send('Page.reload');
  await sleep(600);
  assert.equal(await run('quill.getText()'), 'Legacy draft\n');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(window, 'localStorage', {get(){throw new DOMException('Blocked','SecurityError')}})` });
  await send('Page.reload');
  await sleep(600);
  assert.equal(await run('document.querySelector(".ql-editor").getAttribute("aria-label")'), 'Document content', 'Editor boots when browser storage is blocked');
  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  console.log('PASS: editing, save/restore, storage failure, image drafts, search formatting, replacement/undo, dialogs, TXT/HTML/PDF downloads, print entry, mobile controls and analysis.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  ws?.close(); edge?.kill(); server.close();
});

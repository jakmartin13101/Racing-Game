// Desktop wrapper: serves the built game from an app:// origin so fetch() of the world data works,
// and opens a fullscreen-capable window with the browser frame-rate cap off.
const { app, BrowserWindow, protocol, net, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');

const root = path.join(__dirname, '..', 'dist');

// A small log for when the picture goes wrong (%APPDATA%\Gravel Riot\gravel-riot.log, rewritten each run): the
// graphics card in use, warnings and errors from the game's page, and any graphics process that dies.
let log = null;
const note = (...a) => { try { log?.write(`${new Date().toISOString()} ${a.join(' ')}\n`); } catch { /* no log */ } };
app.on('child-process-gone', (e, d) => note(`${d.type} process gone: ${d.reason}`));

app.whenReady().then(() => {
  try { log = fs.createWriteStream(path.join(app.getPath('userData'), 'gravel-riot.log'), { flags: 'w' }); } catch { log = null; }
  note(`Gravel Riot ${app.getVersion()}, Electron ${process.versions.electron}, Chrome ${process.versions.chrome}`);
  app.getGPUInfo('basic').then((i) => note('graphics cards', JSON.stringify(i.gpuDevice))).catch(() => {});
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(root, rel));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1600, height: 900, backgroundColor: '#0b0a09', title: 'Gravel Riot',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { backgroundThrottling: false },
  });
  win.loadURL('app://game/index.html?desktop');
  win.webContents.on('console-message', (e, level, message, line, source) => {
    // (newer Electron passes one event object instead)
    const lvl = typeof level === 'number' ? level : { warning: 2, error: 3 }[e.level] ?? 0;
    if (lvl >= 2) note(lvl === 3 ? 'error:' : 'warning:', message ?? e.message, `(${path.basename(String(source ?? e.sourceId ?? ''))}:${line ?? e.lineNumber})`);
  });
  win.webContents.on('render-process-gone', (e, d) => note(`page process gone: ${d.reason}`));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
});

app.on('window-all-closed', () => app.quit());

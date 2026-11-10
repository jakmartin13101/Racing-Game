// Desktop wrapper: serves the built game from an app:// origin so fetch() of the world data works,
// and opens a fullscreen-capable window with the browser frame-rate cap off.
const { app, BrowserWindow, protocol, net, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('force_high_performance_gpu');

const root = path.join(__dirname, '..', 'dist');

app.whenReady().then(() => {
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
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
});

app.on('window-all-closed', () => app.quit());

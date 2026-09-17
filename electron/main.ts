import fs from 'fs';
import net from 'net';
import { app, BrowserWindow, ipcMain, nativeImage, nativeTheme } from 'electron';
import path from 'path';
import { storage } from './storage';
import { codeRunner, RunOptions } from './runner';
import { terminalManager } from './terminal';
import { intellisenseService } from './intellisenseService';
import {
  EXTERNAL_LIBRARIES,
  getInstalledJavaVersions,
  getPythonPipPackage,
  resolveEnabledLibraries,
  ensureJavaLibraries,
  ensurePythonLibraries,
  getPipPackageVersion,
  buildJavaClasspath,
} from './externalLibraries';
import { resolvePythonBinary, getAugmentedEnv } from './pathResolver';
import { resolveVenvOrBase, ensureVenv } from './pythonEnv';

let mainWindow: BrowserWindow | null = null;

function isDevServerRunning(port = 5173, host = '127.0.0.1', timeoutMs = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function createWindow() {
  const iconPath = path.join(__dirname, '../public/icon.svg');
  const distIconPath = path.join(__dirname, '../dist/icon.svg');
  const targetSvg = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(distIconPath) ? distIconPath : null);
  const appIcon = targetSvg ? nativeImage.createFromPath(targetSvg) : undefined;

  const initialSettings = storage.getSettings();
  const initialTheme = initialSettings?.theme || 'dark';
  nativeTheme.themeSource = initialTheme;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'LLD Practice',
    icon: appIcon,
    show: false,
    backgroundColor: initialTheme === 'light' ? '#f8fafc' : '#18181b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Safety fallback to guarantee window visibility even if ready-to-show is delayed
  const showFallbackTimeout = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 1500);

  mainWindow.once('show', () => {
    clearTimeout(showFallbackTimeout);
  });

  const distIndexPath = path.join(__dirname, '../dist/index.html');

  mainWindow.webContents.on('did-fail-load', (_event, _errorCode, _errorDescription, validatedURL) => {
    if (validatedURL.includes('localhost:5173') && fs.existsSync(distIndexPath)) {
      mainWindow?.loadFile(distIndexPath);
    }
  });

  const devServerActive = !app.isPackaged && (await isDevServerRunning(5173));

  if (devServerActive) {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      if (fs.existsSync(distIndexPath)) {
        mainWindow?.loadFile(distIndexPath);
      }
    });
  } else if (fs.existsSync(distIndexPath)) {
    mainWindow.loadFile(distIndexPath);
  } else {
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#e2e8f0;background:#18181b;padding:24px;text-align:center;">' +
      '<h2>Build Not Found</h2>' +
      '<p>Neither the Vite dev server (http://localhost:5173) nor the production bundle (dist/index.html) was found.</p>' +
      '<p>Run <code>npm run dev</code> for development, or <code>npm run build</code> followed by <code>npm start</code>.</p>' +
      '</div>'
    )}`);
  }

  mainWindow.on('closed', () => {
    clearTimeout(showFallbackTimeout);
    mainWindow = null;
  });
}

// IPC Handlers for Storage
ipcMain.on('storage:get-settings-sync', (event) => {
  event.returnValue = storage.getSettings();
});

ipcMain.handle('storage:get-settings', async () => {
  return storage.getSettings();
});

ipcMain.handle('storage:save-settings', async (_event, settings) => {
  if (settings?.theme) {
    nativeTheme.themeSource = settings.theme;
  }
  return storage.saveSettings(settings);
});

ipcMain.handle('storage:get-sessions-list', async () => {
  return storage.getSessionsList();
});

ipcMain.handle('storage:get-session', async (_event, id: string) => {
  return storage.getSession(id);
});

ipcMain.handle('storage:save-session', async (_event, session) => {
  return storage.saveSession(session);
});

ipcMain.handle('storage:delete-session', async (_event, id: string) => {
  return storage.deleteSession(id);
});

// IPC Handler for Code Execution
ipcMain.handle('runner:execute', async (_event, options: RunOptions) => {
  return codeRunner.execute(options, (chunk, stream) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('runner:log-output', { chunk, stream });
    }
  });
});

// IPC Handlers for External Libraries (generic java jars / python pip packages)
ipcMain.handle('libs:list', async () => {
  return EXTERNAL_LIBRARIES;
});

ipcMain.handle('libs:installed', async () => {
  const settings = storage.getSettings();
  const out: Record<string, string> = { ...getInstalledJavaVersions() };
  const pyLibs = EXTERNAL_LIBRARIES.filter((l) => l.kind === 'python-pip');
  if (pyLibs.length > 0) {
    const pyBin = resolveVenvOrBase(resolvePythonBinary(settings.pythonPath));
    const env = getAugmentedEnv(settings, { ...process.env });
    for (const lib of pyLibs) {
      const pkg = getPythonPipPackage(lib);
      const ver = await getPipPackageVersion(pyBin, pkg, env);
      if (ver) out[lib.id] = ver;
    }
  }
  return out;
});

ipcMain.handle('libs:ensure', async (_event, args: { language?: 'java' | 'python'; sessionLibraries?: Record<string, boolean>; explicitIds?: string[]; force?: boolean }) => {
  const settings = storage.getSettings();
  const enabled = resolveEnabledLibraries({
    language: args?.language,
    settings,
    sessionLibraries: args?.sessionLibraries,
    explicitIds: args?.explicitIds,
  });
  const javaLibs = enabled.filter((l) => l.language === 'java');
  const { classpathEntries, warnings } = await ensureJavaLibraries(javaLibs, undefined, args?.force === true);
  const installedJava = getInstalledJavaVersions();
  const results: Array<{ id: string; ok: boolean; message?: string; version?: string }> = [];
  for (const lib of javaLibs) {
    const dest = classpathEntries.find((p) => p.endsWith(`${lib.id}.jar`));
    const ok = !!dest;
    const warn = warnings.find((w) => w.startsWith(`${lib.name}:`));
    results.push({
      id: lib.id,
      ok,
      message: ok ? undefined : warn || 'Jar not available.',
      version: installedJava[lib.id],
    });
  }
  const pyLibs = enabled.filter((l) => l.kind === 'python-pip');
  if (pyLibs.length > 0) {
    const basePy = resolvePythonBinary(settings.pythonPath);
    const pyBin = (settings.pythonPath || '').trim() === ''
      ? ((await ensureVenv(basePy, undefined)) || basePy)
      : basePy;
    const env = getAugmentedEnv(settings, { ...process.env });
    const pyResults = await ensurePythonLibraries(pyLibs, {
      pyBin,
      env,
      force: args?.force === true,
    });
    results.push(...pyResults);
  }
  return {
    enabled: enabled.map((l) => l.id),
    classpathEntries,
    runtimeCp: buildJavaClasspath('classes', classpathEntries),
    results,
  };
});

// IPC Handlers for STL IntelliSense
ipcMain.handle('intellisense:hover', async (_event, query) => {
  return intellisenseService.getHover(query);
});

ipcMain.handle('intellisense:completions', async (_event, query) => {
  return intellisenseService.getCompletions(query);
});

ipcMain.handle('intellisense:signature-help', async (_event, query) => {
  return intellisenseService.getSignatureHelp(query);
});

// IPC Handlers for Interactive Terminal & Workspace
ipcMain.handle('terminal:sync-files', async (_event, sessionId: string, files: any[]) => {
  return terminalManager.syncFilesToDisk(sessionId, files);
});

ipcMain.handle('terminal:read-files', async (_event, sessionId: string) => {
  return terminalManager.readFilesFromDisk(sessionId);
});

ipcMain.handle('terminal:get-cwd', async (_event, sessionId: string) => {
  return {
    cwd: terminalManager.getCwd(sessionId),
    relCwd: terminalManager.getRelCwd(sessionId),
  };
});

ipcMain.handle('terminal:execute', async (_event, sessionId: string, command: string) => {
  return terminalManager.executeCommand(
    sessionId,
    command,
    (chunk, stream) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:output', { sessionId, chunk, stream });
      }
    },
    (exitCode, cwd) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', {
          sessionId,
          exitCode,
          cwd,
          relCwd: terminalManager.getRelCwd(sessionId),
        });
      }
    }
  );
});

ipcMain.handle('terminal:input', async (_event, sessionId: string, input: string) => {
  return terminalManager.sendInput(sessionId, input);
});

ipcMain.handle('terminal:kill', async (_event, sessionId: string) => {
  return terminalManager.killProcess(sessionId);
});

ipcMain.handle('terminal:reset', async (_event, sessionId: string) => {
  return terminalManager.reset(sessionId);
});

// IPC Handler for Sending User Feedback via FormSubmit
ipcMain.handle('feedback:send', async (_event, payload: Record<string, any>) => {
  const endpoint = 'https://formsubmit.co/ajax/dcunha.cyprien@gmail.com';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: 'http://localhost:5173',
        Referer: 'http://localhost:5173/',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        success: false,
        message: data?.message || `HTTP ${res.status}: Failed to submit feedback`,
      };
    }

    const isSuccess = data?.success === true || data?.success === 'true';
    return {
      success: isSuccess,
      message: data?.message || (isSuccess ? 'Feedback sent successfully!' : 'Failed to send feedback.'),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network error: Failed to submit feedback',
    };
  }
});

app.whenReady().then(() => {
  createWindow();
  intellisenseService.prewarm();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  intellisenseService.shutdown();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  intellisenseService.shutdown();
});

/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const path = require("node:path");
const { getSafeExternalUrl } = require("./security.cjs");

const PRODUCTION_URL = "https://prophrase.in";
const isDevelopment = !app.isPackaged;

function resolveAppUrl() {
  const candidate = process.env.PROPHRASE_APP_URL || PRODUCTION_URL;

  try {
    const url = new URL(candidate);
    const isLocalDevelopment =
      isDevelopment &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if (url.protocol !== "https:" && !isLocalDevelopment) {
      throw new Error("Desktop app URLs must use HTTPS.");
    }

    return url;
  } catch (error) {
    console.error(`Invalid PROPHRASE_APP_URL: ${error.message}`);
    return new URL(PRODUCTION_URL);
  }
}

const appUrl = resolveAppUrl();
const protocol = "prophrase";
let mainWindow = null;
let pendingDeepLink = null;

function deepLinkFromArgv(argv) {
  return argv.find((value) => value.startsWith(`${protocol}://`)) ?? null;
}

function authFinishUrl(deepLink) {
  try {
    const source = new URL(deepLink);
    if (source.protocol !== `${protocol}:` || source.hostname !== "auth" || source.pathname !== "/callback") {
      return null;
    }

    const destination = new URL("/auth/finish", appUrl.origin);
    ["code", "error", "error_description"].forEach((key) => {
      const value = source.searchParams.get(key);
      if (value) destination.searchParams.set(key, value);
    });
    destination.searchParams.set("next", "/workspace");
    return destination.toString();
  } catch {
    return null;
  }
}

function handleDeepLink(deepLink) {
  const destination = authFinishUrl(deepLink);
  if (!destination) return;

  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingDeepLink = deepLink;
    return;
  }

  pendingDeepLink = null;
  mainWindow.show();
  mainWindow.focus();
  void mainWindow.loadURL(destination);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = deepLinkFromArgv(argv);
    if (deepLink) handleDeepLink(deepLink);
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

function isAppNavigation(target) {
  try {
    return new URL(target).origin === appUrl.origin;
  } catch {
    return false;
  }
}

function isAuthenticationNavigation(target) {
  try {
    const { hostname, protocol } = new URL(target);
    return (
      protocol === "https:" &&
      (hostname === "accounts.google.com" ||
        hostname.endsWith(".google.com") ||
        hostname.endsWith(".supabase.co"))
    );
  } catch {
    return false;
  }
}

function showLoadError(window) {
  const retryUrl = JSON.stringify(appUrl.toString());
  const html = `<!doctype html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
    <title>ProPhrase</title><style>
      body{margin:0;background:#f8f6f1;color:#25231f;font:16px system-ui;display:grid;place-items:center;min-height:100vh}
      main{text-align:center;max-width:420px;padding:32px}h1{font-size:28px;margin:0 0 12px}p{color:#68635b;line-height:1.5}
      button{margin-top:12px;border:0;border-radius:999px;background:#25231f;color:white;padding:12px 22px;font-weight:650;cursor:pointer}
    </style></head><body><main><h1>ProPhrase is offline</h1>
    <p>Check your internet connection, then try loading the workspace again.</p>
    <button onclick="location.href=${retryUrl}">Try again</button></main></body></html>`;
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: "#f8f6f1",
    title: "ProPhrase",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      devTools: isDevelopment,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.on("will-navigate", (event, target) => {
    if (isAppNavigation(target)) return;

    event.preventDefault();
    const externalUrl = getSafeExternalUrl(target);
    if (externalUrl) void shell.openExternal(externalUrl);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppNavigation(url)) {
      return { action: "allow" };
    }

    const externalUrl = getSafeExternalUrl(url);
    if (externalUrl) void shell.openExternal(externalUrl);
    return { action: "deny" };
  });
  window.webContents.on("did-fail-load", (_event, code, _description, url) => {
    if (code !== -3 && url === appUrl.toString()) showLoadError(window);
  });
  window.loadURL(appUrl.toString());

  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });

  return window;
}

app.whenReady().then(() => {
  app.setAsDefaultProtocolClient(protocol);
  ipcMain.handle("desktop:open-external-auth", async (_event, target) => {
    if (typeof target !== "string" || !isAuthenticationNavigation(target)) {
      throw new Error("The authentication URL was not trusted.");
    }
    await shell.openExternal(target);
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === "darwin"
      ? [{ label: app.name, submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] }]
      : []),
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
  ]));

  createWindow();
  const launchDeepLink = pendingDeepLink ?? deepLinkFromArgv(process.argv);
  if (launchDeepLink) handleDeepLink(launchDeepLink);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

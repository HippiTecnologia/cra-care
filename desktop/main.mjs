import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } from "electron";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { startSigningService } from "./signing-service.mjs";

const BRAND = "Hippi Assinador A1";
const DEFAULT_ORIGIN = "https://cra-care.vercel.app";

let mainWindow;
let tray;
let service;
let config = { certificatePath: "", allowedOrigin: DEFAULT_ORIGIN, startWithWindows: true };

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

async function loadConfig() {
  try {
    config = { ...config, ...JSON.parse(await readFile(configPath(), "utf8")) };
  } catch {
    // First run: defaults are intentionally used.
  }
}

async function saveConfig() {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
}

function hippiIcon() {
  const icon = nativeImage.createFromPath(path.join(app.getAppPath(), "public", "hippi-mark.png"));
  if (!icon.isEmpty()) return icon.resize({ width: 32, height: 32 });
  return nativeImage.createFromDataURL("data:image/svg+xml;base64," + Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' rx='16' fill='#0e274b'/><path fill='white' d='M15 12h12v15h10V12h12v40H37V39H27v13H15z'/></svg>").toString("base64"));
}

function showWindow() {
  mainWindow.show();
  mainWindow.focus();
}

function status() {
  return {
    certificatePath: config.certificatePath,
    allowedOrigin: config.allowedOrigin,
    startWithWindows: config.startWithWindows,
    active: Boolean(service),
    expiresAt: service ? new Date(service.expiresAt).toISOString() : null,
    endpoint: service?.endpoint ?? "http://127.0.0.1:43127",
    pairingToken: service?.pairingToken ?? null,
  };
}

function notifyStatus() {
  mainWindow?.webContents.send("status-changed", status());
  tray?.setToolTip(service ? `${BRAND} — pronto para assinar` : `${BRAND} — aguardando certificado`);
}

async function stopService() {
  if (!service) return;
  const activeService = service;
  service = undefined;
  await activeService.stop();
  notifyStatus();
}

async function activate({ password }) {
  if (!config.certificatePath) throw new Error("Escolha o certificado A1 antes de ativar.");
  if (!password) throw new Error("Informe a senha do certificado A1.");
  await stopService();
  service = await startSigningService({
    certificatePath: config.certificatePath,
    password,
    origins: [config.allowedOrigin, "http://localhost:3000", "http://127.0.0.1:3000"],
    onExpired: () => {
      service = undefined;
      notifyStatus();
    },
  });
  notifyStatus();
  return status();
}

function configureStartup(enabled) {
  config.startWithWindows = Boolean(enabled);
  app.setLoginItemSettings({ openAtLogin: config.startWithWindows, args: ["--background"] });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 690,
    minWidth: 760,
    minHeight: 600,
    show: !process.argv.includes("--background"),
    backgroundColor: "#f7f4f2",
    title: BRAND,
    icon: hippiIcon(),
    webPreferences: { preload: path.join(import.meta.dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  await mainWindow.loadFile(path.join(import.meta.dirname, "renderer.html"));
  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(hippiIcon());
  tray.setToolTip(`${BRAND} — aguardando certificado`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir Hippi Assinador A1", click: showWindow },
    { type: "separator" },
    { label: "Sair", click: async () => { app.isQuiting = true; await stopService(); app.quit(); } },
  ]));
  tray.on("double-click", showWindow);
}

app.whenReady().then(async () => {
  await loadConfig();
  configureStartup(config.startWithWindows);
  await createWindow();
  createTray();
  notifyStatus();
});

ipcMain.handle("get-status", () => status());
ipcMain.handle("choose-certificate", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Escolha seu certificado A1", properties: ["openFile"], filters: [{ name: "Certificado A1", extensions: ["p12", "pfx"] }] });
  if (!result.canceled && result.filePaths[0]) {
    config.certificatePath = result.filePaths[0];
    await saveConfig();
    notifyStatus();
  }
  return status();
});
ipcMain.handle("activate", async (_event, input) => activate(input));
ipcMain.handle("deactivate", async () => { await stopService(); return status(); });
ipcMain.handle("set-startup", async (_event, enabled) => { configureStartup(enabled); await saveConfig(); return status(); });
ipcMain.handle("open-cra-care", () => shell.openExternal(config.allowedOrigin));

app.on("window-all-closed", (event) => event.preventDefault());
app.on("before-quit", async () => { app.isQuiting = true; await stopService(); });

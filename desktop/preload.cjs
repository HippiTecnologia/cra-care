const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hippi", {
  getStatus: () => ipcRenderer.invoke("get-status"),
  chooseCertificate: () => ipcRenderer.invoke("choose-certificate"),
  activate: (password) => ipcRenderer.invoke("activate", { password }),
  deactivate: () => ipcRenderer.invoke("deactivate"),
  setStartup: (enabled) => ipcRenderer.invoke("set-startup", enabled),
  openCraCare: () => ipcRenderer.invoke("open-cra-care"),
  onStatusChanged: (callback) => ipcRenderer.on("status-changed", (_event, current) => callback(current)),
});

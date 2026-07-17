/* eslint-disable @typescript-eslint/no-require-imports */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("prophraseDesktop", Object.freeze({
  isDesktop: true,
  platform: process.platform,
  openExternalAuth: (url) => ipcRenderer.invoke("desktop:open-external-auth", url),
}));

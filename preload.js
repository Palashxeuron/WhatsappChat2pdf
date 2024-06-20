const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  selectZip: () => ipcRenderer.invoke('select-zip'),
  generatePdf: (zipPath) => ipcRenderer.invoke('generate-pdf', zipPath)
});

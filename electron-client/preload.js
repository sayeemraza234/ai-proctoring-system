const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    startAiEngine: (options) => ipcRenderer.send('start-ai-engine', options),
    onAiLog: (callback) => ipcRenderer.on('ai-log', (_event, value) => callback(value)),
    endInterview: () => ipcRenderer.send('end-interview'),
    getSessionArgs: () => ipcRenderer.invoke('get-session-args')
});

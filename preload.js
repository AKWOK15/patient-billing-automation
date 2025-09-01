const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectBillingFile: () => ipcRenderer.invoke('select-billing-file'),
  selectEmailFile: () => ipcRenderer.invoke('select-email-file'),
  selectOutputDirectory: () => ipcRenderer.invoke('select-output-directory'),
  analyzeBillingCSV: (filePath) => ipcRenderer.invoke('analyze-billing-csv', filePath),
  processFiles: (data) => ipcRenderer.invoke('process-files', data),
  saveEmailTemplate: (template) => ipcRenderer.invoke('save-email-template', template),
  loadEmailTemplate: () => ipcRenderer.invoke('load-email-template'),
  saveEmailSubject: (subject) => ipcRenderer.invoke('save-email-subject', subject),
  loadEmailSubject: () => ipcRenderer.invoke('load-email-subject'),
  getAuthorizationCode: (authUrl) => ipcRenderer.invoke('get-authorization-code', authUrl),
  submitAuthCode: (code) => ipcRenderer.invoke('submit-auth-code', code),
  checkGmailSetup: () => ipcRenderer.invoke('check-gmail-setup'),
  onProgress: (callback) => ipcRenderer.on('progress-update', (event, data) => callback(data))
});
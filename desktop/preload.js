const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getImages: (args) => ipcRenderer.invoke('get-images', args),
  getImageDetails: (imageHash) => ipcRenderer.invoke('get-image-details', imageHash),
  getImageFile: (imageHash) => ipcRenderer.invoke('get-image-file', imageHash),
  updateImageTags: (payload) => ipcRenderer.invoke('update-image-tags', payload),
  importWebImage: (url) => ipcRenderer.invoke('import-web-image', url),
  aiDescribeImage: (payload) => ipcRenderer.invoke('ai-describe-image', payload),
  aiTagImage: (payload) => ipcRenderer.invoke('ai-tag-image', payload),
  aiClassifyImage: (payload) => ipcRenderer.invoke('ai-classify-image', payload),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings)
});

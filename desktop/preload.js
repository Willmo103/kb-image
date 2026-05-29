const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getImages: (args) => ipcRenderer.invoke('get-images', args),
  getImageDetails: (imageHash) => ipcRenderer.invoke('get-image-details', imageHash),
  getImageFile: (imageHash) => ipcRenderer.invoke('get-image-file', imageHash),
  updateImageTags: (payload) => ipcRenderer.invoke('update-image-tags', payload),
  importWebImage: (url) => ipcRenderer.invoke('import-web-image', url)
});

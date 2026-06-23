const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cqpm', {
  auth: {
    login:          (creds)           => ipcRenderer.invoke('auth:login',          creds),
    verify:         (token)           => ipcRenderer.invoke('auth:verify',          token),
    changePassword: (data)            => ipcRenderer.invoke('auth:change-password', data),
    listUsers:      (token)           => ipcRenderer.invoke('auth:list-users',       token),
    createUser:     (token, userData) => ipcRenderer.invoke('auth:create-user',     { token, userData }),
    deleteUser:     (token, userId)   => ipcRenderer.invoke('auth:delete-user',     { token, userId }),
  },
  params: {
    list:   (token, dept)   => ipcRenderer.invoke('params:list',   { token, dept }),
    all:    (token)         => ipcRenderer.invoke('params:all',    { token }),
    create: (token, data)   => ipcRenderer.invoke('params:create', { token, data }),
    update: (token, id, fields) => ipcRenderer.invoke('params:update', { token, id, fields }),
    remove: (token, id)     => ipcRenderer.invoke('params:remove', { token, id }),
  },
  entries: {
    getRange: (token, dept, from, to) => ipcRenderer.invoke('entries:get-range', { token, dept, from, to }),
    save:     (token, entry)          => ipcRenderer.invoke('entries:save',      { token, entry }),
  },
  signoff: {
    range:   (token, dept, from, to) => ipcRenderer.invoke('signoff:range',   { token, dept, from, to }),
    get:     (token, dept, date)     => ipcRenderer.invoke('signoff:get',     { token, dept, date }),
    submit:  (token, dept, date)     => ipcRenderer.invoke('signoff:submit',  { token, dept, date }),
    pending: (token)                 => ipcRenderer.invoke('signoff:pending', { token }),
    approve: (token, dept, date)     => ipcRenderer.invoke('signoff:approve', { token, dept, date }),
    reopen:  (token, dept, date)     => ipcRenderer.invoke('signoff:reopen',  { token, dept, date }),
  },
  closure: {
    list:   (token, dept)        => ipcRenderer.invoke('closure:list',   { token, dept }),
    close:  (token, dept, month) => ipcRenderer.invoke('closure:close',  { token, dept, month }),
    reopen: (token, dept, month) => ipcRenderer.invoke('closure:reopen', { token, dept, month }),
  },
  report: {
    xlsx: (token, payload) => ipcRenderer.invoke('export:xlsx', { token, payload }),
  },
  win: {
    minimize:       () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close:          () => ipcRenderer.invoke('window:close'),
    isMaximized:    () => ipcRenderer.invoke('window:is-maximized'),
  },
});

const { request } = require('../../utils/api');

Page({
  data: { mode: 'login', phone: '', password: '', confirmPassword: '', staffName: '', gridName: '', operatorScope: '', accountGrid: '', gridOptions: [], selectedGrid: '全部网格', totalOrders: 0, rememberPassword: false, autoLogin: false, accountId: '', loggedIn: false, globalAddress: '', dateFrom: '', dateTo: '', exportKind: 'activated', orders: [] },
  onLoad() {
    const prefs = wx.getStorageSync('campus_operator_login_prefs') || {};
    const rememberPassword = Boolean(prefs.rememberPassword && prefs.password);
    const autoLogin = Boolean((prefs.autoLogin || prefs.directLogin) && rememberPassword);
    this.setData({ phone: rememberPassword ? String(prefs.phone || '') : '', password: rememberPassword ? String(prefs.password) : '', rememberPassword, autoLogin }, () => {
      if (autoLogin) this.login();
    });
  },
  setField(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  changeLoginOptions(event) {
    const values = event.detail.value || [];
    const autoLogin = values.indexOf('auto') >= 0;
    this.setData({ rememberPassword: autoLogin || values.indexOf('password') >= 0, autoLogin });
  },
  switchMode() { this.setData({ mode: this.data.mode === 'login' ? 'register' : 'login' }); },
  saveLoginPrefs() {
    const d = this.data;
    wx.setStorageSync('campus_operator_login_prefs', {
      phone: d.rememberPassword ? d.phone : '',
      password: d.rememberPassword ? d.password : '',
      rememberPassword: d.rememberPassword,
      autoLogin: d.autoLogin && d.rememberPassword
    });
  },
  async login() {
    const d = this.data;
    if (!/^1\d{10}$/.test(d.phone) || !d.password) return wx.showToast({ title: '请输入正确的手机号和密码', icon: 'none' });
    if (d.mode === 'register' && d.password !== d.confirmPassword) return wx.showToast({ title: '两次密码不一致', icon: 'none' });
    try {
      const result = await request(`/api/staff/${d.mode}`, 'POST', { role: 'operator', name: d.staffName, phone: d.phone, password: d.password, confirmPassword: d.confirmPassword });
      if (d.mode === 'register') return this.setData({ mode: 'login', password: '', confirmPassword: '' }, () => wx.showToast({ title: '注册成功，请登录', icon: 'success' }));
      this.saveLoginPrefs();
      this.setData({ accountId: result.accountId, operatorScope: result.operatorScope || 'branch', accountGrid: result.gridName || '', selectedGrid: '全部网格', loggedIn: true });
      this.loadOrders();
      this.loadOfflineSettings();
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  logout() { this.setData({ accountId: '', loggedIn: false, orders: [], totalOrders: 0, operatorScope: '', accountGrid: '', gridOptions: [], selectedGrid: '全部网格' }); },
  async loadOrders() { try { const requestedGrid = this.data.operatorScope === 'branch' && this.data.selectedGrid !== '全部网格' ? this.data.selectedGrid : ''; const result = await request('/api/operator/orders', 'POST', { accountId: this.data.accountId, gridName: requestedGrid }); const options = ['全部网格'].concat(result.gridOptions || []); this.setData({ orders: result.orders || [], totalOrders: Number(result.total) || 0, operatorScope: result.scope || this.data.operatorScope, accountGrid: result.accountGrid || this.data.accountGrid, gridOptions: options, selectedGrid: this.data.operatorScope === 'grid' ? (result.accountGrid || this.data.accountGrid) : (this.data.selectedGrid || '全部网格') }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
  changeExportKind(event) {
    const values = event.detail.value || [];
    const selected = values.length ? values[values.length - 1] : this.data.exportKind;
    this.setData({ exportKind: selected });
  },
  pickGrid(event) { const selectedGrid = this.data.gridOptions[Number(event.detail.value)] || '全部网格'; this.setData({ selectedGrid }, () => this.loadOrders()); },
  async loadOfflineSettings() { try { const result = await request('/api/operator/offline-settings', 'POST', { accountId: this.data.accountId }); this.setData({ globalAddress: (result.settings && result.settings.verificationAddress) || '' }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
  async saveGlobalAddress() { const address = this.data.globalAddress.trim(); if (!address) return wx.showToast({ title: '请输入统一线下办理地址', icon: 'none' }); try { const result = await request('/api/operator/offline-settings', 'PATCH', { accountId: this.data.accountId, verificationAddress: address, action: 'set' }); this.setData({ globalAddress: result.verificationAddress || address }); wx.showToast({ title: `地址已保存，补充分配 ${result.affectedOrders || 0} 个订单`, icon: 'success' }); this.loadOrders(); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
  async clearGlobalAddress() { try { await request('/api/operator/offline-settings', 'PATCH', { accountId: this.data.accountId, action: 'clear' }); this.setData({ globalAddress: '' }); wx.showToast({ title: '统一地址已清空', icon: 'success' }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } },
  async exportOrders() {
    const kind = this.data.exportKind;
    try {
      wx.showLoading({ title: '正在生成文件', mask: true });
      const requestedGrid = this.data.operatorScope === 'branch' && this.data.selectedGrid !== '全部网格' ? this.data.selectedGrid : '';
      const result = await request(kind === 'activated' ? '/api/operator/export-activated' : '/api/operator/export-number-pending', 'POST', { accountId: this.data.accountId, gridName: requestedGrid, from: this.data.dateFrom, to: this.data.dateTo });
      const filePath = `${wx.env.USER_DATA_PATH}/campus-export-${Date.now()}-${result.fileName}`;
      wx.getFileSystemManager().writeFile({ filePath, data: wx.base64ToArrayBuffer(result.base64), success: () => wx.openDocument({ filePath, fileType: result.fileName.endsWith('.xlsx') ? 'xlsx' : 'csv', showMenu: true, success: () => {}, fail: (error) => wx.showToast({ title: error.errMsg || '文件打开失败', icon: 'none' }) }), fail: (error) => wx.showToast({ title: error.errMsg || '文件保存失败，请关闭已打开的旧文件后重试', icon: 'none' }) });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } finally { wx.hideLoading(); }
  }
});

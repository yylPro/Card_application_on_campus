const { request } = require('../../utils/api');

Page({
  data: { mode: 'login', phone: '', password: '', confirmPassword: '', staffName: '', gridName: '', rememberPassword: false, autoLogin: false, accountId: '', loggedIn: false, scanFeatureCode: '', campusNumber: '', activationProofFile: '', activationProofPreview: '', messageText: '', results: [] },
  onLoad() {
    const prefs = wx.getStorageSync('campus_offline_login_prefs') || {};
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
    wx.setStorageSync('campus_offline_login_prefs', {
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
      const result = await request(`/api/staff/${d.mode}`, 'POST', { role: 'offline', name: d.staffName, gridName: d.gridName, phone: d.phone, password: d.password, confirmPassword: d.confirmPassword });
      if (d.mode === 'register') return this.setData({ mode: 'login', password: '', confirmPassword: '' }, () => wx.showToast({ title: '注册成功，请登录', icon: 'success' }));
      this.saveLoginPrefs();
      this.setData({ accountId: result.accountId, loggedIn: true });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  logout() { this.setData({ accountId: '', loggedIn: false, results: [], scanFeatureCode: '', campusNumber: '', activationProofFile: '', activationProofPreview: '' }); },
  scanFeatureCode() {
    wx.scanCode({ onlyFromCamera: true, scanType: ['qrCode'], success: (result) => {
      const value = String(result.result || '').trim().toUpperCase();
      const match = value.match(/CAMPUS-[A-Z0-9_-]{4,40}/);
      if (!match) return wx.showToast({ title: '二维码中没有有效特征码', icon: 'none' });
      this.setData({ scanFeatureCode: match[0] });
      wx.showToast({ title: '特征码已读取', icon: 'success' });
    }, fail: (error) => { if (error && error.errMsg && error.errMsg.indexOf('cancel') < 0) wx.showToast({ title: '扫码失败，请重试', icon: 'none' }); } });
  },
  chooseActivationProof() {
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: (chooseResult) => {
      const filePath = chooseResult.tempFilePaths[0];
      wx.showLoading({ title: '正在上传', mask: true });
      wx.cloud.uploadFile({ cloudPath: `activation-proof/${Date.now()}-${this.data.accountId}.jpg`, filePath }).then((uploadResult) => {
        this.setData({ activationProofFile: uploadResult.fileID, activationProofPreview: filePath });
      }).catch(() => wx.showToast({ title: '页面上传失败，请重试', icon: 'none' })).finally(() => wx.hideLoading());
    } });
  },
  clearActivationProof() { this.setData({ activationProofFile: '', activationProofPreview: '' }); },
  async verifyScanned() {
    const d = this.data;
    if (!d.scanFeatureCode && !d.campusNumber) return wx.showToast({ title: '请扫描特征码或输入校园号码', icon: 'none' });
    if (!d.campusNumber) return wx.showToast({ title: '请输入校园号码', icon: 'none' });
    if (!d.activationProofFile) return wx.showToast({ title: '请先提交套卡实名已激活页面', icon: 'none' });
    try {
      const result = await request('/api/offline/import-verification', 'POST', { accountId: d.accountId, messages: [{ featureCode: d.scanFeatureCode, campusNumber: d.campusNumber, activationProofFile: d.activationProofFile, result: 'verified' }] });
      this.setData({ results: (result.results || []).concat(this.data.results), scanFeatureCode: '', campusNumber: '', activationProofFile: '', activationProofPreview: '' });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  async importMessages() {
    if (!this.data.activationProofFile) return wx.showToast({ title: '请先提交套卡实名已激活页面', icon: 'none' });
    const messages = this.data.messageText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => { const [campusNumber, result] = line.split(/[,，\t]/).map((item) => item.trim()); return { campusNumber, activationProofFile: this.data.activationProofFile, result: result || 'verified' }; });
    if (!messages.length) return wx.showToast({ title: '请输入实名验证消息', icon: 'none' });
    try { const result = await request('/api/offline/import-verification', 'POST', { accountId: this.data.accountId, messages }); this.setData({ results: (result.results || []).concat(this.data.results), messageText: '' }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  async exportVerified() {
    try {
      wx.showLoading({ title: '正在生成文件', mask: true });
      const result = await request('/api/offline/export-verified', 'POST', { accountId: this.data.accountId });
      const filePath = `${wx.env.USER_DATA_PATH}/offline-export-${Date.now()}-${result.fileName}`;
      wx.getFileSystemManager().writeFile({
        filePath,
        data: wx.base64ToArrayBuffer(result.base64),
        success: () => wx.openDocument({
          filePath,
          fileType: result.fileName && result.fileName.endsWith('.xlsx') ? 'xlsx' : 'csv',
          showMenu: true,
          success: () => {},
          fail: (error) => wx.showToast({ title: error.errMsg || '文件打开失败', icon: 'none' })
        }),
        fail: (error) => wx.showToast({ title: error.errMsg || '文件保存失败，请关闭已打开的旧文件后重试', icon: 'none' })
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
});

const { request } = require('../../utils/api');

Page({
  data: { mode: 'login', phone: '', password: '', confirmPassword: '', staffName: '', rememberPassword: false, autoLogin: false, accountId: '', loggedIn: false, campusNumber: '', result: null, querying: false },
  onLoad() {
    const prefs = wx.getStorageSync('campus_merchant_login_prefs') || {};
    const rememberPassword = Boolean(prefs.rememberPassword && prefs.password);
    const autoLogin = Boolean((prefs.autoLogin || prefs.directLogin) && rememberPassword);
    this.setData({ phone: rememberPassword ? String(prefs.phone || '') : '', password: rememberPassword ? String(prefs.password) : '', rememberPassword, autoLogin }, () => { if (autoLogin) this.login(); });
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
    wx.setStorageSync('campus_merchant_login_prefs', { phone: d.rememberPassword ? d.phone : '', password: d.rememberPassword ? d.password : '', rememberPassword: d.rememberPassword, autoLogin: d.autoLogin && d.rememberPassword });
  },
  async login() {
    const d = this.data;
    if (!/^1\d{10}$/.test(d.phone) || !d.password) return wx.showToast({ title: '请输入正确的手机号和密码', icon: 'none' });
    if (d.mode === 'register' && (!d.staffName || d.password !== d.confirmPassword)) return wx.showToast({ title: d.staffName ? '两次密码不一致' : '请输入商家姓名', icon: 'none' });
    try {
      const result = await request(`/api/staff/${d.mode}`, 'POST', { role: 'merchant', name: d.staffName, phone: d.phone, password: d.password, confirmPassword: d.confirmPassword });
      if (d.mode === 'register') return this.setData({ mode: 'login', password: '', confirmPassword: '', staffName: '' }, () => wx.showToast({ title: '注册成功，请登录', icon: 'success' }));
      this.saveLoginPrefs();
      this.setData({ accountId: result.accountId, loggedIn: true });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  },
  logout() { this.setData({ accountId: '', loggedIn: false, result: null, campusNumber: '' }); },
  async queryOrder() {
    const campusNumber = String(this.data.campusNumber || '').trim();
    if (!campusNumber) return wx.showToast({ title: '请输入校园号码', icon: 'none' });
    this.setData({ querying: true });
    try { const result = await request('/api/merchant/query', 'POST', { accountId: this.data.accountId, campusNumber }); this.setData({ result }); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } finally { this.setData({ querying: false }); }
  },
  async confirmActivation() {
    const campusNumber = String(this.data.campusNumber || '').trim();
    if (!this.data.result || !this.data.result.canConfirm) return wx.showToast({ title: '该订单尚未核验，不能确认激活', icon: 'none' });
    try { const result = await request('/api/merchant/confirm-activation', 'POST', { accountId: this.data.accountId, campusNumber }); wx.showToast({ title: result.message || '确认激活成功', icon: 'success' }); this.queryOrder(); } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
  }
});

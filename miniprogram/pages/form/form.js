const { request } = require('../../utils/api');
const app = getApp();

function checkboxChecked(detail) {
  if (detail && typeof detail.checked === 'boolean') return detail.checked;
  const value = detail && detail.value;
  return value === true || value === 'true' || value === 'on' || value === '1' || (Array.isArray(value) && value.length > 0);
}

Page({
  data: {
    title: '校园账号预约', kind: 'order',
    name: '', studentNo: '', idCard: '', college: '', phone: '', address: '',
    serviceConsent: false, submitting: false
  },

  onLoad(query) {
    const kind = query.kind === 'ticket' ? 'ticket' : 'order';
    this.setData({ title: '校园账号预约', kind, college: app.globalData.college || '' });
    wx.setNavigationBarTitle({ title: '校园账号预约' });
  },

  setField(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  toggleService(event) { this.setData({ serviceConsent: checkboxChecked(event.detail) }); },

  async submit() {
    const d = this.data;
    if (d.submitting) return;
    if (!d.college) return wx.showToast({ title: '请先选择二级学院', icon: 'none' });
    if (!d.name || !d.idCard || !d.phone) return wx.showToast({ title: '请完整填写姓名、身份证号和现有联系电话', icon: 'none' });
    if (!/^1\d{10}$/.test(d.phone)) return wx.showToast({ title: '请输入正确的现有联系电话', icon: 'none' });
    if (!d.serviceConsent) return wx.showToast({ title: '请先同意信息收集和后续联系说明', icon: 'none' });
    this.setData({ submitting: true });
    try {
      const payload = {
        schoolCode: app.globalData.schoolCode, type: '校园账号预约', name: d.name, studentNo: d.studentNo,
        idCard: d.idCard, college: d.college, phone: d.phone, address: d.address,
        serviceConsent: d.serviceConsent
      };
      const result = await request(d.kind === 'ticket' ? '/api/tickets' : '/api/orders', 'POST', payload);
      wx.showModal({ title: '提交成功', content: `服务编号：${result.record.id}`, showCancel: false, success: () => wx.navigateBack() });
    } catch (error) {
      wx.showToast({ title: error.message || '提交失败', icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  }
});

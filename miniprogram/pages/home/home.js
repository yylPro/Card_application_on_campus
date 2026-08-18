const { request } = require('../../utils/api');
const app = getApp();

const labels = { pending: '待受理', contacting: '联系中', assigned: '已派单', scheduled: '已预约', processing: '处理中', completed: '已完成', cancelled: '已取消', not_applicable: '不适用', shipped: '已交付', delivered: '已送达', activated: '已完成', pending_manual: '待核验', pending_merchant: '待商家激活', verified: '已核验' };
function checkboxChecked(detail) {
  if (detail && typeof detail.checked === 'boolean') return detail.checked;
  const value = detail && detail.value;
  return value === true || value === 'true' || value === 'on' || value === '1' || (Array.isArray(value) && value.length > 0);
}

Page({
  data: {
    schoolName: '请先选择学校', schoolQuery: '', schools: [], colleges: [], college: '', searching: false, arrow: '›',
    heroTitle: '校园号码预约', heroCopy: '在线提交预约，线下实名核验后完成办理',
    schoolLabel: '选择学校', collegeLabel: '选择二级学院', searchPlaceholder: '请输入学校关键词', collegePlaceholder: '请先选择学校', serviceLabel: '校园号码预约', recordsLabel: '查询本机订单', noSchools: '未找到匹配的学校', searchingLabel: '正在加载学校列表…',
    name: '', studentNo: '', idCard: '', phone: '', address: '', serviceConsent: false, submitting: false,
    records: [], recordsMessage: '', recordsLoading: false
  },
  onLoad(query) {
    const code = query.schoolCode || (query.scene ? decodeURIComponent(query.scene) : '');
    if (code) app.globalData.schoolCode = code;
    this.ensureSchoolIndex().catch((error) => wx.showToast({ title: error.message || '学校列表加载失败', icon: 'none' }));
  },
  onShow() {
    if (!app.globalData.schoolCode) return;
    if (app.globalData.school && app.globalData.school.code === app.globalData.schoolCode) {
      const school = app.globalData.school;
      return this.setData({ schoolName: school.name, schoolQuery: school.name, colleges: school.colleges || [], college: app.globalData.college || '' });
    }
    request(`/api/schools/${encodeURIComponent(app.globalData.schoolCode)}`).then(({ school }) => {
      app.globalData.school = school;
      this.setData({ schoolName: school.name, schoolQuery: school.name, colleges: school.colleges || [], college: app.globalData.college || '' });
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
  },
  setField(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  toggleService(event) { this.setData({ serviceConsent: checkboxChecked(event.detail) }); },
  ensureSchoolIndex() {
    if (Array.isArray(app.globalData.schoolIndex)) { this.schoolIndex = app.globalData.schoolIndex; return Promise.resolve(this.schoolIndex); }
    if (this.schoolIndexPromise) return this.schoolIndexPromise;
    this.setData({ searching: true });
    this.schoolIndexPromise = request('/api/schools').then(({ schools }) => { this.schoolIndex = schools || []; app.globalData.schoolIndex = this.schoolIndex; this.setData({ searching: false }); return this.schoolIndex; }).catch((error) => { this.setData({ searching: false }); throw error; }).finally(() => { this.schoolIndexPromise = null; });
    return this.schoolIndexPromise;
  },
  renderSchoolResults(query) {
    const keyword = String(query || '').trim().toLowerCase();
    if (!keyword) return this.setData({ schools: [], searching: false });
    const source = this.schoolIndex || app.globalData.schoolIndex || [];
    const schools = source.filter((item) => String(item.name || '').toLowerCase().includes(keyword)).sort((left, right) => {
      const leftStarts = String(left.name || '').toLowerCase().startsWith(keyword) ? 0 : 1;
      const rightStarts = String(right.name || '').toLowerCase().startsWith(keyword) ? 0 : 1;
      return leftStarts - rightStarts;
    }).slice(0, 20);
    this.setData({ schools, searching: false });
  },
  searchSchools(event) {
    const query = String(event.detail.value || '').replace(/^\)+/, '').trim();
    this.setData({ schoolQuery: query, schools: [], searching: Boolean(query) });
    clearTimeout(this.schoolSearchTimer);
    if (!query) return this.setData({ searching: false });
    this.schoolSearchTimer = setTimeout(() => { this.ensureSchoolIndex().then(() => this.renderSchoolResults(query)).catch((error) => wx.showToast({ title: error.message || '学校列表加载失败', icon: 'none' })); }, 80);
  },
  chooseSchool(event) {
    const school = this.data.schools[Number(event.currentTarget.dataset.index)];
    if (!school) return;
    app.globalData.schoolCode = school.code;
    app.globalData.school = school;
    app.globalData.college = '';
    this.setData({ schoolName: school.name, schoolQuery: school.name, schools: [], colleges: school.colleges || [], college: '' });
  },
  pickCollege(event) {
    const college = this.data.colleges[Number(event.detail.value)] || '';
    app.globalData.college = college;
    this.setData({ college });
  },
  async submitOrder() {
    const d = this.data;
    if (d.submitting) return;
    if (!app.globalData.schoolCode) return wx.showToast({ title: '请先选择学校', icon: 'none' });
    if (!d.college) return wx.showToast({ title: '请先选择二级学院', icon: 'none' });
    if (!d.name || !d.idCard || !d.phone) return wx.showToast({ title: '请完整填写姓名、身份证号和现有联系电话', icon: 'none' });
    if (!/^1\d{10}$/.test(d.phone)) return wx.showToast({ title: '请输入正确的现有联系电话', icon: 'none' });
    if (!d.serviceConsent) return wx.showToast({ title: '请先同意信息收集和后续联系说明', icon: 'none' });
    this.setData({ submitting: true });
    try {
      const result = await request('/api/orders', 'POST', { schoolCode: app.globalData.schoolCode, type: '校园网账号预约', name: d.name, studentNo: d.studentNo, idCard: d.idCard, college: d.college, phone: d.phone, address: d.address, serviceConsent: d.serviceConsent });
      wx.showModal({ title: '提交成功', content: `服务编号：${result.record.id}`, showCancel: false, success: () => { this.setData({ name: '', studentNo: '', idCard: '', phone: '', address: '', serviceConsent: false }); } });
    } catch (error) { wx.showToast({ title: error.message || '提交失败', icon: 'none' }); } finally { this.setData({ submitting: false }); }
  },
  async lookupOwnRecords() {
    if (this.data.recordsLoading) return;
    this.setData({ recordsLoading: true, recordsMessage: '' });
    try {
      const result = await request('/api/student/records', 'POST', { schoolCode: '' });
      const records = (result.records || []).map((item) => ({ ...item, statusText: item.verificationStatus === 'verified' ? '已完成' : (labels[item.status] || item.status), deliveryText: labels[item.deliveryStatus] || item.deliveryStatus, activationText: labels[item.activationStatus] || item.activationStatus, showFeatureQr: false }));
      this.setData({ records, recordsMessage: records.length ? '' : '本机暂无订单记录。' });
    } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); } finally { this.setData({ recordsLoading: false }); }
  },
  toggleFeatureQr(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!this.data.records[index]) return;
    this.setData({ [`records[${index}].showFeatureQr`]: !this.data.records[index].showFeatureQr });
  }
});

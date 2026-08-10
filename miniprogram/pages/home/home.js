const { request } = require('../../utils/api');
const app = getApp();

Page({
  data: {
    schoolName: '统一服务入口',
    schoolQuery: '',
    schools: [],
    services: [
      { title: '新生选号预约', kind: 'order' },
      { title: '校园网账号预约', kind: 'order' },
      { title: '宽带故障报修', kind: 'ticket' },
      { title: '续费与业务咨询', kind: 'ticket' }
    ]
  },
  onLoad(query) {
    const code = query.schoolCode || (query.scene ? decodeURIComponent(query.scene) : '');
    if (code) app.globalData.schoolCode = code;
  },
  onShow() {
    if (!app.globalData.schoolCode) return;
    request(`/api/schools/${encodeURIComponent(app.globalData.schoolCode)}`).then(({ school }) => {
      app.globalData.school = school;
      this.setData({ schoolName: school.name, schoolQuery: school.name });
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
  },
  searchSchools(event) {
    const query = event.detail.value.trim();
    this.setData({ schoolQuery: query });
    if (query.length < 2) return this.setData({ schools: [] });
    request(`/api/schools?q=${encodeURIComponent(query)}`).then(({ schools }) => this.setData({ schools })).catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
  },
  chooseSchool(event) {
    const school = this.data.schools[Number(event.currentTarget.dataset.index)];
    if (!school) return;
    app.globalData.schoolCode = school.code;
    app.globalData.school = school;
    this.setData({ schoolName: school.name, schoolQuery: school.name, schools: [] });
  },
  openService(event) {
    if (!app.globalData.schoolCode) return wx.showToast({ title: '请先选择学校', icon: 'none' });
    const { title, kind } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/form/form?title=${encodeURIComponent(title)}&kind=${kind}` });
  },
  openRecords() { wx.navigateTo({ url: '/pages/records/records' }); }
});

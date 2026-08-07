const { request } = require('../../utils/api');
const app = getApp();
Page({
  data: { schoolName: '校园', services: [{ title: '新生选号预约', kind: 'order' }, { title: '校园网账号预约', kind: 'order' }, { title: '宽带故障报修', kind: 'ticket' }, { title: '续费与业务咨询', kind: 'ticket' }] },
  onLoad(query) {
    const code = query.schoolCode || (query.scene ? decodeURIComponent(query.scene) : '');
    if (code) app.globalData.schoolCode = code;
  },
  onShow() {
    request(`/api/schools/${encodeURIComponent(app.globalData.schoolCode)}`).then(({ school }) => {
      app.globalData.school = school;
      this.setData({ schoolName: school.name });
    }).catch((error) => wx.showToast({ title: error.message, icon: 'none' }));
  },
  openService(event) { const { title, kind } = event.currentTarget.dataset; wx.navigateTo({ url: `/pages/form/form?title=${encodeURIComponent(title)}&kind=${kind}` }); },
  openRecords() { wx.navigateTo({ url: '/pages/records/records' }); }
});

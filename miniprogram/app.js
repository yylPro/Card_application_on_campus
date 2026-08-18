App({
  globalData: { apiBase: '', cloudEnvId: 'cloud1-d2glyicddd63c1a4f', schoolCode: '', school: null, college: '', schoolIndex: null },
  onLaunch() {
    if (!wx.cloud) return console.error('当前基础库不支持云开发，请升级微信开发者工具');
    wx.cloud.init({ env: this.globalData.cloudEnvId, traceUser: true });
  }
});

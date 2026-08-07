const app = getApp();

function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${app.globalData.apiBase}${path}`,
      method,
      data,
      header: { 'content-type': 'application/json' },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
        else reject(new Error(response.data?.error || '服务暂不可用'));
      },
      fail() { reject(new Error('网络连接失败，请稍后重试')); }
    });
  });
}

module.exports = { request };

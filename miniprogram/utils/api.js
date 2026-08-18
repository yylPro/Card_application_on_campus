function request(path, method = 'GET', data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({ name: 'campusService', data: { action: 'proxy', path, method, data } })
      .then(({ result }) => {
        if (result && result.success) return resolve(result.data);
        reject(new Error((result && result.error) || '云函数请求失败'));
      })
      .catch((error) => reject(new Error(error && error.message ? error.message : '云函数连接失败，请确认已部署 campusService')));
  });
}
module.exports = { request };

function callCampus(type, data) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud || !wx.cloud.callFunction) {
      reject(new Error("当前基础库不支持云开发，请升级微信开发者工具"));
      return;
    }
    wx.cloud.callFunction({
      name: "quickstartFunctions",
      data: { type, ...(data || {}) },
      success(response) {
        const result = response.result || {};
        if (result.success === false) {
          reject(new Error(result.errMsg || "业务请求失败"));
          return;
        }
        resolve(result.data === undefined ? result : result.data);
      },
      fail(error) {
        reject(new Error(error.errMsg || "云服务连接失败，请检查云环境和云函数部署状态"));
      },
    });
  });
}

module.exports = { callCampus };

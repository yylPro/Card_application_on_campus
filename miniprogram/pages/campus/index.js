Page({
  data: {
    roles: [
      { title: "学生端", description: "选择号码，查看线下实名办理信息", path: "/pages/campus/student" },
      { title: "运营商端", description: "导入号码库存，分配地址，管理订单", path: "/pages/campus/operator" },
      { title: "线下实体端", description: "导入实名验证消息，激活对应号码", path: "/pages/campus/outlet" },
    ],
  },
  openRole(event) {
    const path = event.currentTarget.dataset.path;
    wx.navigateTo({ url: path });
  },
  openQuickStart() {
    wx.navigateTo({ url: "/pages/index/index" });
  },
});

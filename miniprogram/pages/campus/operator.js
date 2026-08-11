const { callCampus } = require("../../utils/campus");

Page({
  data: { staffKey: "", loggedIn: false, numberText: "", addressText: "", orders: [], loading: false },
  setField(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  async login() {
    if (!this.data.staffKey) return wx.showToast({ title: "请输入管理口令", icon: "none" });
    try { await callCampus("campusStaffLogin", { staffKey: this.data.staffKey, role: "operator" }); this.setData({ loggedIn: true }); this.loadOrders(); } catch (error) { wx.showToast({ title: error.message, icon: "none" }); }
  },
  parseNumbers() {
    return this.data.numberText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [operator, phone, planName, monthlyFee, outletAddress] = line.split(/[,，\t]/).map((item) => item.trim());
      return { operator, phone, planName, monthlyFee, outletAddress: outletAddress || this.data.addressText };
    });
  },
  async importNumbers() {
    const rows = this.parseNumbers();
    if (!rows.length) return wx.showToast({ title: "请输入要导入的号码", icon: "none" });
    try { const result = await callCampus("campusImportNumbers", { staffKey: this.data.staffKey, rows }); wx.showModal({ title: "导入完成", content: `成功 ${result.imported} 条，重复 ${result.skipped} 条${result.errors.length ? `，错误 ${result.errors.length} 条` : ""}`, showCancel: false }); this.setData({ numberText: "" }); } catch (error) { wx.showToast({ title: error.message, icon: "none" }); }
  },
  async loadOrders() {
    try { const result = await callCampus("campusListOrders", { staffKey: this.data.staffKey }); this.setData({ orders: result.orders || [] }); } catch (error) { wx.showToast({ title: error.message, icon: "none" }); }
  },
  setOrderAddress(event) {
    const index = Number(event.currentTarget.dataset.index);
    const orders = this.data.orders.slice();
    orders[index].draftAddress = event.detail.value;
    this.setData({ orders });
  },
  async assignAddress(event) {
    const order = this.data.orders[Number(event.currentTarget.dataset.index)];
    if (!order || !order.draftAddress) return wx.showToast({ title: "请输入线下办理地址", icon: "none" });
    try { await callCampus("campusAssignOutlet", { staffKey: this.data.staffKey, orderId: order.id, outletAddress: order.draftAddress }); wx.showToast({ title: "地址已更新", icon: "success" }); this.loadOrders(); } catch (error) { wx.showToast({ title: error.message, icon: "none" }); }
  },
});

const { callCampus } = require("../../utils/campus");

Page({
  data: { staffKey: "", loggedIn: false, messageText: "", results: [] },
  setField(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  async login() {
    if (!this.data.staffKey) return wx.showToast({ title: "请输入管理口令", icon: "none" });
    try { await callCampus("campusStaffLogin", { staffKey: this.data.staffKey }); this.setData({ loggedIn: true }); } catch (error) { wx.showToast({ title: error.message, icon: "none" }); }
  },
  parseMessages() {
    return this.data.messageText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [featureCode, idCard, result] = line.split(/[,，\t]/).map((item) => item.trim());
      return { featureCode, idCard, result: result || "verified" };
    });
  },
  async importMessages() {
    const messages = this.parseMessages();
    if (!messages.length) return wx.showToast({ title: "请输入实名验证消息", icon: "none" });
    try { const result = await callCampus("campusImportVerification", { staffKey: this.data.staffKey, messages }); this.setData({ results: result.results || [], messageText: "" }); } catch (error) { wx.showToast({ title: error.message, icon: "none" }); }
  },
});

const { callCampus } = require("../../utils/campus");

Page({
  data: { phone: "", password: "", confirmPassword: "", authMode: "login", staffSession: "", loggedIn: false, messageText: "", results: [] },
  setField(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  setMode(event) { this.setData({ authMode: event.currentTarget.dataset.mode }); },
  async login() {
    const data = this.data;
    if (!/^1\d{10}$/.test(data.phone) || !data.password) return wx.showToast({ title: "请输入正确的授权手机号和密码", icon: "none" });
    if (data.authMode === "register" && data.password !== data.confirmPassword) return wx.showToast({ title: "两次密码不一致", icon: "none" });
    try { const result = await callCampus(data.authMode === "register" ? "campusStaffRegister" : "campusStaffLogin", { phone: data.phone, password: data.password, confirmPassword: data.confirmPassword, role: "outlet" }); this.setData({ password: "", confirmPassword: "", staffSession: result.staffSession, loggedIn: true }); } catch (error) { wx.showToast({ title: error.message, icon: "none" }); }
  },
  logout() { this.setData({ phone: "", password: "", confirmPassword: "", staffSession: "", loggedIn: false, results: [] }); },
  parseMessages() {
    return this.data.messageText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [featureCode, idCard, result] = line.split(/[,，\t]/).map((item) => item.trim());
      return { featureCode, idCard, result: result || "verified" };
    });
  },
  async importMessages() {
    const messages = this.parseMessages();
    if (!messages.length) return wx.showToast({ title: "请输入实名验证消息", icon: "none" });
    try { const result = await callCampus("campusImportVerification", { staffSession: this.data.staffSession, messages }); this.setData({ results: result.results || [], messageText: "" }); } catch (error) { wx.showToast({ title: error.message, icon: "none" }); }
  },
});

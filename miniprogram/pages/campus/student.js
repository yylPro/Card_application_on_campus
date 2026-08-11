const { callCampus } = require("../../utils/campus");

Page({
  data: {
    operators: ["全部运营商", "中国移动", "中国联通", "中国电信"],
    operatorIndex: 0,
    offers: [],
    selectedOfferId: "",
    page: 1,
    totalPages: 1,
    name: "",
    studentNo: "",
    phone: "",
    orders: [],
    loading: false,
  },
  onShow() {
    this.loadOffers();
    this.loadOrders();
  },
  setField(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
  },
  pickOperator(event) {
    this.setData({ operatorIndex: Number(event.detail.value), page: 1, selectedOfferId: "" }, () => this.loadOffers());
  },
  selectOffer(event) {
    this.setData({ selectedOfferId: event.currentTarget.dataset.id });
  },
  async loadOffers() {
    const index = this.data.operatorIndex;
    try {
      const result = await callCampus("campusListOffers", {
        operator: index ? this.data.operators[index] : "",
        page: this.data.page,
        pageSize: 12,
      });
      this.setData({ offers: result.offers || [], totalPages: result.totalPages || 1 });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },
  async loadOrders() {
    try {
      const result = await callCampus("campusStudentOrders");
      this.setData({ orders: result.orders || [] });
    } catch (error) {
      // A first-time user has no records; cloud configuration errors are shown on submit.
    }
  },
  previousPage() {
    if (this.data.page <= 1) return;
    this.setData({ page: this.data.page - 1, selectedOfferId: "" }, () => this.loadOffers());
  },
  nextPage() {
    if (this.data.page >= this.data.totalPages) return;
    this.setData({ page: this.data.page + 1, selectedOfferId: "" }, () => this.loadOffers());
  },
  async reserve() {
    const data = this.data;
    if (!data.name || !data.phone || !data.selectedOfferId) {
      wx.showToast({ title: "请填写姓名、手机号并选择号码", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      const result = await callCampus("campusReserveNumber", {
        name: data.name,
        studentNo: data.studentNo,
        phone: data.phone,
        offerId: data.selectedOfferId,
      });
      wx.showModal({
        title: "选号成功",
        content: `特征码：${result.featureCode}\n办理地址：${result.outletAddress}`,
        showCancel: false,
      });
      this.setData({ name: "", studentNo: "", phone: "", selectedOfferId: "" });
      this.loadOffers();
      this.loadOrders();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
});

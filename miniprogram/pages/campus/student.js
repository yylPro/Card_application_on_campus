const { callCampus } = require("../../utils/campus");

Page({
  data: {
    operators: ["全部运营商", "中国移动", "中国联通", "中国电信"],
    operatorIndex: 0,
    offers: [],
    selectedOfferId: "",
    page: 1,
    totalPages: 1,
    schools: [],
    schoolKeyword: "",
    filteredSchools: [],
    schoolIndex: 0,
    collegeIndex: 0,
    schoolCode: "",
    schoolName: "",
    colleges: [],
    collegeKeyword: "",
    filteredColleges: [],
    college: "",
    name: "",
    studentNo: "",
    idCard: "",
    phone: "",
    shippingRecipient: "",
    shippingPhone: "",
    shippingAddress: "",
    idCardFrontPath: "",
    idCardBackPath: "",
    orders: [],
    loading: false,
  },
  onShow() {
    this.loadSchools();
    this.loadOffers();
    this.loadOrders();
  },
  setField(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
  },
  chooseIdCard(event) {
    const side = event.currentTarget.dataset.side;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        if (!file || !file.tempFilePath) return;
        this.setData({ [side === "front" ? "idCardFrontPath" : "idCardBackPath"]: file.tempFilePath });
      },
    });
  },
  async loadSchools() {
    try {
      const result = await callCampus("campusListSchools");
      const schools = result.schools || [];
      const first = schools[0];
      this.setData({
        schools,
        filteredSchools: schools,
        schoolIndex: 0,
        schoolCode: first ? first.code : "",
        schoolName: first ? first.name : "",
        colleges: first ? first.colleges : [],
        filteredColleges: first ? first.colleges : [],
        collegeIndex: 0,
        college: first && first.colleges && first.colleges[0] ? first.colleges[0] : "",
      });
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    }
  },
  applySchoolSelection(school, schoolIndex) {
    const colleges = school ? school.colleges || [] : [];
    this.setData({
      schoolIndex,
      schoolCode: school ? school.code : "",
      schoolName: school ? school.name : "",
      colleges,
      filteredColleges: colleges,
      collegeIndex: 0,
      college: colleges[0] || "",
      schoolKeyword: "",
      collegeKeyword: "",
    });
  },
  filterSchools(keyword) {
    const normalizedKeyword = keyword.trim();
    this.setData({
      filteredSchools: this.data.schools.filter((school) => !normalizedKeyword || school.name.includes(normalizedKeyword)),
    });
  },
  filterColleges(keyword) {
    const normalizedKeyword = keyword.trim();
    this.setData({
      filteredColleges: this.data.colleges.filter((college) => !normalizedKeyword || college.includes(normalizedKeyword)),
    });
  },
  searchSchools(event) {
    const schoolKeyword = event.detail.value;
    this.setData({ schoolKeyword });
    this.filterSchools(schoolKeyword);
  },
  searchColleges(event) {
    const collegeKeyword = event.detail.value;
    this.setData({ collegeKeyword });
    this.filterColleges(collegeKeyword);
  },
  selectSchoolFromSearch(event) {
    const schoolIndex = this.data.schools.findIndex((school) => school.code === event.currentTarget.dataset.code);
    if (schoolIndex >= 0) this.applySchoolSelection(this.data.schools[schoolIndex], schoolIndex);
  },
  selectCollegeFromSearch(event) {
    const college = event.currentTarget.dataset.college;
    const collegeIndex = this.data.colleges.indexOf(college);
    if (collegeIndex >= 0) {
      this.setData({ collegeIndex, college, collegeKeyword: "", filteredColleges: this.data.colleges });
    }
  },
  pickSchool(event) {
    const schoolIndex = Number(event.detail.value);
    const school = this.data.schools[schoolIndex];
    this.applySchoolSelection(school, schoolIndex);
  },
  pickCollege(event) {
    const collegeIndex = Number(event.detail.value);
    this.setData({
      collegeIndex,
      college: this.data.colleges[collegeIndex] || "",
      collegeKeyword: "",
      filteredColleges: this.data.colleges,
    });
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
    if (!data.schoolCode || !data.college || !data.name || !data.idCard || !data.phone || !data.shippingRecipient || !data.shippingPhone || !data.shippingAddress || !data.selectedOfferId || !data.idCardFrontPath || !data.idCardBackPath) {
      wx.showToast({ title: "请完整选择学校、学院，填写信息并上传身份证正反面", icon: "none" });
      return;
    }
    if (!/^\d{17}[0-9Xx]$/.test(data.idCard)) {
      wx.showToast({ title: "身份证号码格式不正确", icon: "none" });
      return;
    }
    if (!/^1\d{10}$/.test(data.phone) || !/^1\d{10}$/.test(data.shippingPhone)) {
      wx.showToast({ title: "联系电话格式不正确", icon: "none" });
      return;
    }
    this.setData({ loading: true });
    try {
      const [front, back] = await Promise.all([
        this.uploadIdCardImage(data.idCardFrontPath, "front"),
        this.uploadIdCardImage(data.idCardBackPath, "back"),
      ]);
      const result = await callCampus("campusReserveNumber", {
        name: data.name,
        studentNo: data.studentNo,
        schoolCode: data.schoolCode,
        college: data.college,
        idCard: data.idCard.toUpperCase(),
        phone: data.phone,
        shippingRecipient: data.shippingRecipient,
        shippingPhone: data.shippingPhone,
        shippingAddress: data.shippingAddress,
        idCardFrontFile: front,
        idCardBackFile: back,
        offerId: data.selectedOfferId,
      });
      wx.showModal({
        title: "选号成功",
        content: `特征码：${result.featureCode}\n办理地址：${result.outletAddress}`,
        showCancel: false,
      });
      this.setData({ name: "", studentNo: "", idCard: "", phone: "", shippingRecipient: "", shippingPhone: "", shippingAddress: "", idCardFrontPath: "", idCardBackPath: "", selectedOfferId: "" });
      this.loadOffers();
      this.loadOrders();
    } catch (error) {
      wx.showToast({ title: error.message, icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },
  uploadIdCardImage(filePath, side) {
    return new Promise((resolve, reject) => {
      wx.cloud.uploadFile({
        cloudPath: `campus-id-cards/${Date.now()}-${side}-${Math.random().toString(16).slice(2)}.jpg`,
        filePath,
        success: (result) => resolve(result.fileID),
        fail: (error) => reject(new Error(error.errMsg || "身份证图片上传失败")),
      });
    });
  },
});

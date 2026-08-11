const cloud = require("wx-server-sdk");
const crypto = require("crypto");
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
});

const db = cloud.database();
// 获取openid
const getOpenId = async () => {
  // 获取基础信息
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  };
};

// 获取小程序二维码
const getMiniProgramCode = async () => {
  // 获取小程序二维码的buffer
  const resp = await cloud.openapi.wxacode.get({
    path: "pages/index/index",
  });
  const { buffer } = resp;
  // 将图片上传云存储空间
  const upload = await cloud.uploadFile({
    cloudPath: "code.png",
    fileContent: buffer,
  });
  return upload.fileID;
};

// 创建集合
const createCollection = async () => {
  try {
    // 创建集合
    await db.createCollection("sales");
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "上海",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华东",
        city: "南京",
        sales: 11,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "广州",
        sales: 22,
      },
    });
    await db.collection("sales").add({
      // data 字段表示需新增的 JSON 数据
      data: {
        region: "华南",
        city: "深圳",
        sales: 22,
      },
    });
    return {
      success: true,
    };
  } catch (e) {
    // 这里catch到的是该collection已经存在，从业务逻辑上来说是运行成功的，所以catch返回success给前端，避免工具在前端抛出异常
    return {
      success: true,
      data: "create collection success",
    };
  }
};

// 查询数据
const selectRecord = async () => {
  // 返回数据库查询结果
  return await db.collection("sales").get();
};

// 更新数据
const updateRecord = async (event) => {
  try {
    // 遍历修改数据库信息
    for (let i = 0; i < event.data.length; i++) {
      await db
        .collection("sales")
        .where({
          _id: event.data[i]._id,
        })
        .update({
          data: {
            sales: event.data[i].sales,
          },
        });
    }
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 新增数据
const insertRecord = async (event) => {
  try {
    const insertRecord = event.data;
    // 插入数据
    await db.collection("sales").add({
      data: {
        region: insertRecord.region,
        city: insertRecord.city,
        sales: Number(insertRecord.sales),
      },
    });
    return {
      success: true,
      data: event.data,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// 删除数据
const deleteRecord = async (event) => {
  try {
    await db
      .collection("sales")
      .where({
        _id: event.data._id,
      })
      .remove();
    return {
      success: true,
    };
  } catch (e) {
    return {
      success: false,
      errMsg: e,
    };
  }
};

// Campus service data is kept separate from the QuickStart `sales` collection.
// This lets the existing demo actions continue to work unchanged.
const campusCollections = ["campus_numbers", "campus_orders"];
const campusOperators = new Set(["中国移动", "中国联通", "中国电信"]);

const campusText = (value, maxLength) => String(value == null ? "" : value).trim().slice(0, maxLength);
const campusNow = () => new Date().toISOString();

const campusError = (message, code = "CAMPUS_ERROR") => ({
  success: false,
  errCode: code,
  errMsg: message,
});

const campusOk = (data) => ({ success: true, data });

const campusOpenId = () => cloud.getWXContext().OPENID || "";

const campusStaffKeyMatches = (value, role = "operator") => {
  const roleKey = role === "outlet" ? process.env.CAMPUS_OUTLET_KEY : process.env.CAMPUS_OPERATOR_KEY;
  const configured = String(roleKey || process.env.CAMPUS_STAFF_KEY || "");
  const supplied = String(value || "");
  if (!configured || !supplied || configured.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(configured), Buffer.from(supplied));
};

const campusRequireStaff = (event, role = "operator") => {
  if (campusStaffKeyMatches(event.staffKey, role)) return null;
  const configured = role === "outlet" ? process.env.CAMPUS_OUTLET_KEY : process.env.CAMPUS_OPERATOR_KEY;
  if (!configured && !process.env.CAMPUS_STAFF_KEY) return campusError(`云函数未配置 ${role === "outlet" ? "CAMPUS_OUTLET_KEY" : "CAMPUS_OPERATOR_KEY"}`, "STAFF_KEY_NOT_CONFIGURED");
  return campusError("管理口令不正确", "STAFF_UNAUTHORIZED");
};

const campusEnsureCollections = async () => {
  await Promise.all(campusCollections.map(async (name) => {
    try {
      await db.createCollection(name);
    } catch (error) {
      // The collection already exists in the normal case.
    }
  }));
};

const campusRead = async (name, query = {}) => {
  try {
    const result = await db.collection(name).where(query).limit(1000).get();
    return result.data || [];
  } catch (error) {
    return [];
  }
};

const campusDisplayNumber = (phone) => {
  const value = campusText(phone, 20);
  return value.length === 11 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
};

const campusFeatureCode = () => `CAMPUS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

const campusListOffers = async (event) => {
  const operator = campusText(event.operator, 20);
  const keyword = campusText(event.keyword, 20);
  const offers = (await campusRead("campus_numbers", { status: "available" }))
    .filter((item) => !operator || item.operator === operator)
    .filter((item) => !keyword || item.phone.includes(keyword) || item.displayNumber.includes(keyword))
    .sort((left, right) => String(left.phone).localeCompare(String(right.phone)));
  const pageSize = Math.min(Math.max(Number(event.pageSize) || 20, 1), 50);
  const page = Math.max(Number(event.page) || 1, 1);
  const start = (page - 1) * pageSize;
  return campusOk({
    offers: offers.slice(start, start + pageSize).map((item) => ({
      id: item._id,
      operator: item.operator,
      displayNumber: item.displayNumber || campusDisplayNumber(item.phone),
      planName: item.planName || "校园通信套餐",
      monthlyFee: Number(item.monthlyFee) || 0,
    })),
    page,
    pageSize,
    total: offers.length,
    totalPages: Math.max(Math.ceil(offers.length / pageSize), 1),
  });
};

const campusReserveNumber = async (event) => {
  const openid = campusOpenId();
  const name = campusText(event.name, 40);
  const studentNo = campusText(event.studentNo, 40);
  const phone = campusText(event.phone, 20);
  const shippingRecipient = campusText(event.shippingRecipient, 40);
  const shippingPhone = campusText(event.shippingPhone, 20);
  const shippingAddress = campusText(event.shippingAddress, 160);
  const offerId = campusText(event.offerId, 80);
  if (!openid || !name || !phone || !shippingRecipient || !shippingPhone || !shippingAddress || !offerId) return campusError("请完整填写身份、收货信息并选择号码", "INVALID_INPUT");
  if (!/^1\d{10}$/.test(phone)) return campusError("联系电话格式不正确", "INVALID_PHONE");
  if (!/^1\d{10}$/.test(shippingPhone)) return campusError("收货联系号码格式不正确", "INVALID_SHIPPING_PHONE");

  await campusEnsureCollections();
  const offers = await campusRead("campus_numbers");
  const offer = offers.find((item) => item._id === offerId && item.status === "available");
  if (!offer) return campusError("号码已被选走或暂不可办理", "NUMBER_UNAVAILABLE");

  const featureCode = campusFeatureCode();
  const now = campusNow();
  const claimed = await db.collection("campus_numbers").where({ _id: offerId, status: "available" }).update({
    data: {
      status: "reserved",
      reservedBy: openid,
      reservedOrderId: featureCode,
      updatedAt: now,
    },
  });
  if (!claimed.stats || claimed.stats.updated !== 1) return campusError("号码已被选走，请重新选择", "NUMBER_UNAVAILABLE");

  try {
    const inserted = await db.collection("campus_orders").add({
      data: {
        featureCode,
        openid,
        name,
        studentNo,
        phone,
        shippingRecipient,
        shippingPhone,
        shippingAddress,
        numberId: offer._id,
        operator: offer.operator,
        displayNumber: offer.displayNumber || campusDisplayNumber(offer.phone),
        planName: offer.planName || "校园通信套餐",
        monthlyFee: Number(offer.monthlyFee) || 0,
        outletAddress: offer.outletAddress || "请等待运营商分配线下办理地址",
        status: "pending_realname",
        idCardLast4: "",
        verificationMessage: "",
        verifiedAt: "",
        createdAt: now,
        updatedAt: now,
      },
    });
    const linked = await db.collection("campus_numbers").where({ _id: offerId, reservedOrderId: featureCode }).update({ data: { reservedOrderId: inserted._id, updatedAt: now } });
    if (!linked.stats || linked.stats.updated !== 1) throw new Error("number-order-link-failed");
    return campusOk({
      orderId: inserted._id,
      featureCode,
      outletAddress: offer.outletAddress || "请等待运营商分配线下办理地址",
      displayNumber: offer.displayNumber || campusDisplayNumber(offer.phone),
      operator: offer.operator,
      planName: offer.planName || "校园通信套餐",
      status: "pending_realname",
    });
  } catch (error) {
    await db.collection("campus_numbers").where({ _id: offerId, reservedOrderId: featureCode }).update({ data: { status: "available", reservedBy: "", reservedOrderId: "", updatedAt: campusNow() } });
    return campusError("预约保存失败，号码已释放，请重试", "ORDER_CREATE_FAILED");
  }
};

const campusStudentOrders = async () => {
  const openid = campusOpenId();
  if (!openid) return campusError("无法识别当前微信用户", "OPENID_MISSING");
  const orders = (await campusRead("campus_orders", { openid }))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .map((item) => ({
      id: item._id,
      featureCode: item.featureCode,
      name: item.name,
      studentNo: item.studentNo,
      phone: item.phone,
      shippingRecipient: item.shippingRecipient || item.name,
      shippingPhone: item.shippingPhone || item.phone,
      shippingAddress: item.shippingAddress || "",
      operator: item.operator,
      displayNumber: item.displayNumber,
      planName: item.planName,
      monthlyFee: item.monthlyFee,
      outletAddress: item.outletAddress,
      status: item.status,
      idCardLast4: item.idCardLast4,
      verifiedAt: item.verifiedAt,
      createdAt: item.createdAt,
    }));
  return campusOk({ orders });
};

const campusImportNumbers = async (event) => {
  const authError = campusRequireStaff(event);
  if (authError) return authError;
  const rows = Array.isArray(event.rows) ? event.rows.slice(0, 500) : [];
  if (!rows.length) return campusError("没有可导入的号码", "INVALID_INPUT");
  await campusEnsureCollections();
  let imported = 0;
  let skipped = 0;
  const errors = [];
  for (const row of rows) {
    const operator = campusText(row.operator, 20);
    const phone = campusText(row.phone, 20).replace(/\s+/g, "");
    if (!campusOperators.has(operator) || !/^1\d{10}$/.test(phone)) {
      errors.push(`号码 ${phone || "空值"} 的运营商或号码格式不正确`);
      continue;
    }
    const existing = await campusRead("campus_numbers", { phone });
    if (existing.length) {
      skipped += 1;
      continue;
    }
    await db.collection("campus_numbers").add({
      data: {
        operator,
        phone,
        displayNumber: campusDisplayNumber(phone),
        planName: campusText(row.planName, 80) || "校园通信套餐",
        monthlyFee: Math.max(Number(row.monthlyFee) || 0, 0),
        outletAddress: campusText(row.outletAddress, 160),
        status: "available",
        reservedBy: "",
        reservedOrderId: "",
        createdAt: campusNow(),
        updatedAt: campusNow(),
      },
    });
    imported += 1;
  }
  return campusOk({ imported, skipped, errors });
};

const campusListOrders = async (event) => {
  const authError = campusRequireStaff(event);
  if (authError) return authError;
  const orders = (await campusRead("campus_orders"))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, 300)
    .map((item) => ({
      id: item._id,
      featureCode: item.featureCode,
      name: item.name,
      studentNo: item.studentNo,
      phone: item.phone,
      shippingRecipient: item.shippingRecipient || item.name,
      shippingPhone: item.shippingPhone || item.phone,
      shippingAddress: item.shippingAddress || "",
      operator: item.operator,
      displayNumber: item.displayNumber,
      planName: item.planName,
      outletAddress: item.outletAddress,
      status: item.status,
      idCardLast4: item.idCardLast4,
      verifiedAt: item.verifiedAt,
      createdAt: item.createdAt,
    }));
  return campusOk({ orders });
};

const campusAssignOutlet = async (event) => {
  const authError = campusRequireStaff(event);
  if (authError) return authError;
  const orderId = campusText(event.orderId, 80);
  const outletAddress = campusText(event.outletAddress, 160);
  if (!orderId || !outletAddress) return campusError("请填写订单和线下办理地址", "INVALID_INPUT");
  const updated = await db.collection("campus_orders").where({ _id: orderId }).update({ data: { outletAddress, updatedAt: campusNow() } });
  if (!updated.stats || updated.stats.updated !== 1) return campusError("订单不存在", "ORDER_NOT_FOUND");
  return campusOk({ orderId, outletAddress });
};

const campusNormalizeIdCard = (value) => campusText(value, 18).toUpperCase().replace(/\s+/g, "");

const campusImportVerification = async (event) => {
  const authError = campusRequireStaff(event, "outlet");
  if (authError) return authError;
  const messages = Array.isArray(event.messages) ? event.messages.slice(0, 200) : [];
  if (!messages.length) return campusError("没有可导入的实名验证消息", "INVALID_INPUT");
  await campusEnsureCollections();
  const results = [];
  for (const message of messages) {
    const featureCode = campusText(message.featureCode, 40).toUpperCase();
    const idCard = campusNormalizeIdCard(message.idCard);
    const verificationResult = campusText(message.result || message.status, 20).toLowerCase();
    const orderList = await campusRead("campus_orders", { featureCode });
    const order = orderList[0];
    if (!order) {
      results.push({ featureCode, success: false, message: "特征码不存在" });
      continue;
    }
    if (!/^\d{15}(\d{2}[0-9X])?$/.test(idCard)) {
      results.push({ featureCode, success: false, message: "身份证号码格式不正确" });
      continue;
    }
    const idCardHash = crypto.createHash("sha256").update(idCard).digest("hex");
    if (!["verified", "success", "passed", "ok", "通过", "成功"].includes(verificationResult)) {
      results.push({ featureCode, success: false, message: "实名验证未通过，号码保持待实名状态" });
      continue;
    }
    const messageName = campusText(message.name, 40);
    if (messageName && messageName !== campusText(order.name, 40)) {
      results.push({ featureCode, success: false, message: "身份证实名姓名与选号订单不匹配" });
      continue;
    }
    if (order.status === "activated") {
      results.push({ featureCode, success: order.idCardHash === idCardHash, message: order.idCardHash === idCardHash ? "该订单已经激活" : "身份证与已激活订单不匹配" });
      continue;
    }
    const now = campusNow();
    const updatedOrder = await db.collection("campus_orders").where({ _id: order._id, status: "pending_realname" }).update({
      data: {
        status: "activated",
        idCardLast4: idCard.slice(-4),
        idCardHash,
        verificationMessage: "verified",
        verifiedAt: now,
        updatedAt: now,
      },
    });
    if (!updatedOrder.stats || updatedOrder.stats.updated !== 1) {
      results.push({ featureCode, success: false, message: "订单状态已变化，请刷新后重试" });
      continue;
    }
    const updatedNumber = await db.collection("campus_numbers").where({ reservedOrderId: order._id, status: "reserved" }).update({ data: { status: "activated", updatedAt: now } });
    if (!updatedNumber.stats || updatedNumber.stats.updated !== 1) {
      await db.collection("campus_orders").where({ _id: order._id, status: "activated" }).update({
        data: { status: "pending_realname", idCardLast4: "", idCardHash: "", verificationMessage: "", verifiedAt: "", updatedAt: campusNow() },
      });
      results.push({ featureCode, success: false, message: "号码状态更新失败，订单已回到待实名状态" });
      continue;
    }
    results.push({ featureCode, success: true, message: "实名验证成功，号码已激活", orderId: order._id, displayNumber: order.displayNumber });
  }
  return campusOk({ results });
};

// const getOpenId = require('./getOpenId/index');
// const getMiniProgramCode = require('./getMiniProgramCode/index');
// const createCollection = require('./createCollection/index');
// const selectRecord = require('./selectRecord/index');
// const updateRecord = require('./updateRecord/index');
// const fetchGoodsList = require('./fetchGoodsList/index');
// const genMpQrcode = require('./genMpQrcode/index');
// 云函数入口函数
exports.main = async (event, context) => {
  switch (event.type) {
    case "getOpenId":
      return await getOpenId();
    case "getMiniProgramCode":
      return await getMiniProgramCode();
    case "createCollection":
      return await createCollection();
    case "selectRecord":
      return await selectRecord();
    case "updateRecord":
      return await updateRecord(event);
    case "insertRecord":
      return await insertRecord(event);
    case "deleteRecord":
      return await deleteRecord(event);
    case "campusListOffers":
      return await campusListOffers(event);
    case "campusReserveNumber":
      return await campusReserveNumber(event);
    case "campusStudentOrders":
      return await campusStudentOrders(event);
    case "campusStaffLogin":
      if (!campusStaffKeyMatches(event.staffKey, event.role)) return campusRequireStaff(event, event.role);
      await campusEnsureCollections();
      return campusOk({ role: event.role === "outlet" ? "outlet" : "operator" });
    case "campusImportNumbers":
      return await campusImportNumbers(event);
    case "campusListOrders":
      return await campusListOrders(event);
    case "campusAssignOutlet":
      return await campusAssignOutlet(event);
    case "campusImportVerification":
      return await campusImportVerification(event);
    default:
      return campusError("未知的云函数动作", "UNKNOWN_ACTION");
  }
};

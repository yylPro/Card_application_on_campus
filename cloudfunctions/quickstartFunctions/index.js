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
const campusCollections = ["campus_numbers", "campus_orders", "campus_staff_accounts", "campus_staff_sessions"];
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

const campusRole = (role) => role === "outlet" ? "outlet" : "operator";
const campusHash = (value) => crypto.createHash("sha256").update(String(value || "")).digest("hex");
const campusPhoneHash = (phone) => campusHash(campusText(phone, 20));
const campusSessionHash = (token) => campusHash(token);
const campusPasswordValid = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{9,15}$/.test(String(password || ""));
const campusPasswordHash = (password, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  hash: crypto.scryptSync(String(password), salt, 32).toString("hex"),
});
const campusPasswordMatches = (password, account) => {
  if (!account?.passwordSalt || !account?.passwordHash) return false;
  const actual = Buffer.from(campusPasswordHash(password, account.passwordSalt).hash, "hex");
  const expected = Buffer.from(account.passwordHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};
const campusBuiltinStaffPhoneHashes = [
  '5d8c1379cdc1549ad2f4b0c8d80f9b3d0cdb48c2e305d32b450334160885a6d9',
  '91bfb9037b45bca2c94ad62c883acd6cb5a1f992a0e6d37366d7f7a7a63f8a88',
  '7b7720561af334aa42fe0a08fbdcba2fc01e7ffde472c53248db8aaf51af90d1',
  'c8552b94751a59c2243a8812ac7cc5e7504c62a3bfbc2ce2432af33f800f638b',
  '6efbd11efcd61924e412d31fe87917b4b88b3b6183967fda5d064efef669759a',
  '322c34aaa620caddd6b08ac38ba81dfe5b1118474aae1051ac19c6dd850bede3'
];
const campusAuthorizedPhoneHashes = (role) => {
  const roleKey = campusRole(role) === "outlet" ? "CAMPUS_OUTLET_PHONE_HASHES" : "CAMPUS_OPERATOR_PHONE_HASHES";
  return new Set([...campusBuiltinStaffPhoneHashes, process.env.CAMPUS_STAFF_PHONE_HASHES, process.env[roleKey]].flatMap((value) => String(value || "").split(",")).map((value) => value.trim().toLowerCase()).filter(Boolean));
};
const campusPhoneAuthorized = (phone, role) => {
  const hashes = campusAuthorizedPhoneHashes(role);
  if (!hashes.size) return false;
  return hashes.has(campusPhoneHash(phone));
};

const campusIssueStaffSession = async (account) => {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = Date.now();
  await db.collection("campus_staff_sessions").add({
    data: {
      tokenHash: campusSessionHash(token),
      role: account.role,
      phoneHash: account.phoneHash,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 8 * 60 * 60 * 1000).toISOString(),
    },
  });
  return token;
};

const campusRequireStaff = async (event, role = "operator") => {
  const session = campusText(event.staffSession, 200);
  if (!session) return campusError("请先使用授权手机号登录", "STAFF_SESSION_REQUIRED");
  const sessions = await campusRead("campus_staff_sessions", { tokenHash: campusSessionHash(session), role: campusRole(role) });
  const active = sessions.find((item) => new Date(item.expiresAt).getTime() > Date.now());
  if (!active) return campusError("无权执行此操作或登录已失效", "STAFF_UNAUTHORIZED");
  return null;
};

const campusStaffRegister = async (event) => {
  const role = campusRole(event.role);
  const phone = campusText(event.phone, 20).replace(/\s+/g, "");
  const password = String(event.password || "");
  if (!/^1\d{10}$/.test(phone)) return campusError("手机号格式不正确", "INVALID_PHONE");
  if (password !== String(event.confirmPassword || "")) return campusError("两次密码不一致", "PASSWORD_MISMATCH");
  if (!campusPhoneAuthorized(phone, role)) {
    return campusAuthorizedPhoneHashes(role).size ? campusError("该手机号未获本线下端授权", "STAFF_PHONE_UNAUTHORIZED") : campusError(`云函数未配置 ${role === "outlet" ? "CAMPUS_OUTLET_PHONE_HASHES" : "CAMPUS_OPERATOR_PHONE_HASHES"}`, "STAFF_PHONE_NOT_CONFIGURED");
  }
  if (!campusPasswordValid(password)) return campusError("密码需为 9-15 位且包含大小写字母和数字", "INVALID_PASSWORD");
  await campusEnsureCollections();
  const phoneHash = campusPhoneHash(phone);
  if ((await campusRead("campus_staff_accounts", { phoneHash, role })).length) return campusError("该授权手机号已注册，请直接登录", "STAFF_ALREADY_REGISTERED");
  const passwordData = campusPasswordHash(password);
  const account = { phoneHash, role, passwordSalt: passwordData.salt, passwordHash: passwordData.hash, status: "active", createdAt: campusNow(), updatedAt: campusNow() };
  await db.collection("campus_staff_accounts").add({ data: account });
  const staffSession = await campusIssueStaffSession(account);
  return campusOk({ role, staffSession });
};

const campusStaffLogin = async (event) => {
  const role = campusRole(event.role);
  const phone = campusText(event.phone, 20).replace(/\s+/g, "");
  const password = String(event.password || "");
  if (!/^1\d{10}$/.test(phone) || !campusPasswordValid(password)) return campusError("手机号或密码错误", "STAFF_UNAUTHORIZED");
  await campusEnsureCollections();
  const account = (await campusRead("campus_staff_accounts", { phoneHash: campusPhoneHash(phone), role, status: "active" }))[0];
  if (!account || !campusPhoneAuthorized(phone, role) || !campusPasswordMatches(password, account)) return campusError("手机号或密码错误", "STAFF_UNAUTHORIZED");
  const staffSession = await campusIssueStaffSession(account);
  return campusOk({ role, staffSession });
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
  const authError = await campusRequireStaff(event);
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
  const authError = await campusRequireStaff(event);
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
  const authError = await campusRequireStaff(event);
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
  const authError = await campusRequireStaff(event, "outlet");
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
      return await campusStaffLogin(event);
    case "campusStaffRegister":
      return await campusStaffRegister(event);
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

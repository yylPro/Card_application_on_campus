const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const crypto = require('node:crypto');

const collections = new Map();
let nextId = 1;
let currentOpenId = 'student-a';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matches(row, query) {
  return Object.entries(query || {}).every(([key, value]) => row[key] === value);
}

function collection(name, query = {}) {
  const rows = collections.get(name) || [];
  return {
    where(nextQuery) { return collection(name, nextQuery); },
    limit() { return this; },
    async get() { return { data: rows.filter((row) => matches(row, query)).map(clone) }; },
    async add({ data }) {
      const row = { ...clone(data), _id: `mock-${nextId++}` };
      rows.push(row);
      collections.set(name, rows);
      return { _id: row._id }; 
    },
    async update({ data }) {
      let updated = 0;
      for (const row of rows) {
        if (!matches(row, query)) continue;
        Object.assign(row, clone(data));
        updated += 1;
      }
      return { stats: { updated } };
    },
  };
}

const cloudMock = {
  DYNAMIC_CURRENT_ENV: 'mock-env',
  init() {},
  database() { return { collection, createCollection: async (name) => { if (!collections.has(name)) collections.set(name, []); } }; },
  getWXContext() { return { OPENID: currentOpenId, APPID: 'mock-app' }; },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudMock;
  return originalLoad.call(this, request, parent, isMain);
};
const phoneHash = (phone) => crypto.createHash('sha256').update(phone).digest('hex');
const operatorPhone = '13900000001';
const outletPhone = '13900000002';
process.env.CAMPUS_OPERATOR_PHONE_HASHES = phoneHash(operatorPhone);
process.env.CAMPUS_OUTLET_PHONE_HASHES = phoneHash(outletPhone);
const campusFunction = require('../cloudfunctions/quickstartFunctions/index.js');
Module._load = originalLoad;

async function call(type, data = {}, openid = currentOpenId) {
  currentOpenId = openid;
  return campusFunction.main({ type, ...data }, {});
}

test.after(() => {
  delete process.env.CAMPUS_OPERATOR_PHONE_HASHES;
  delete process.env.CAMPUS_OUTLET_PHONE_HASHES;
});

test('三端云函数权限、选号隔离和实名激活闭环', async () => {
  const deniedRegister = await call('campusStaffRegister', { phone: '13900000003', password: 'OperatorA123', confirmPassword: 'OperatorA123', role: 'operator' }, 'operator-user');
  assert.equal(deniedRegister.errCode, 'STAFF_PHONE_UNAUTHORIZED');
  const denied = await call('campusStaffLogin', { phone: operatorPhone, password: 'WrongPass123', role: 'operator' }, 'operator-user');
  assert.equal(denied.errCode, 'STAFF_UNAUTHORIZED');

  const operatorRegister = await call('campusStaffRegister', { phone: operatorPhone, password: 'OperatorA123', confirmPassword: 'OperatorA123', role: 'operator' }, 'operator-user');
  assert.equal(operatorRegister.success, true);
  const operatorLogin = await call('campusStaffLogin', { phone: operatorPhone, password: 'OperatorA123', role: 'operator' }, 'operator-user');
  assert.equal(operatorLogin.success, true);
  const operatorSession = operatorLogin.data.staffSession;
  const imported = await call('campusImportNumbers', {
    staffSession: operatorSession,
    rows: [{ operator: '中国移动', phone: '13800000001', planName: '校园套餐', monthlyFee: 39, outletAddress: '东门营业厅' },
      { operator: '中国联通', phone: '18600000001', planName: '联通套餐', monthlyFee: 29, outletAddress: '西门营业厅' }],
  }, 'operator-user');
  assert.equal(imported.data.imported, 2);

  const offers = await call('campusListOffers', { page: 1, pageSize: 10 }, 'student-a');
  assert.equal(offers.data.offers.length, 2);
  const firstOffer = offers.data.offers[0];
  const reserved = await call('campusReserveNumber', {
    name: '学生甲', studentNo: 'A-001', phone: '13900000001',
    shippingRecipient: '收货人甲', shippingPhone: '13900000001', shippingAddress: '一号宿舍楼 101', offerId: firstOffer.id,
  }, 'student-a');
  assert.equal(reserved.success, true);
  assert.equal(reserved.data.outletAddress, '东门营业厅');

  const privateOrders = await call('campusStudentOrders', {}, 'student-b');
  assert.equal(privateOrders.data.orders.length, 0);
  const ownOrders = await call('campusStudentOrders', {}, 'student-a');
  assert.equal(ownOrders.data.orders[0].shippingAddress, '一号宿舍楼 101');

  const secondOffer = (await call('campusListOffers', { page: 1, pageSize: 10 }, 'student-a')).data.offers[0];
  const concurrentInput = {
    name: '并发学生', phone: '13700000001', shippingRecipient: '并发收货人',
    shippingPhone: '13700000001', shippingAddress: '二号宿舍楼', offerId: secondOffer.id,
  };
  const concurrent = await Promise.all([
    call('campusReserveNumber', concurrentInput, 'student-c'),
    call('campusReserveNumber', { ...concurrentInput, phone: '13700000002', shippingPhone: '13700000002' }, 'student-d'),
  ]);
  assert.deepEqual(concurrent.map((item) => item.success).sort(), [false, true]);

  const outletRegister = await call('campusStaffRegister', { phone: outletPhone, password: 'OutletA12345', confirmPassword: 'OutletA12345', role: 'outlet' }, 'outlet-user');
  assert.equal(outletRegister.success, true);
  const outletLogin = await call('campusStaffLogin', { phone: outletPhone, password: 'OutletA12345', role: 'outlet' }, 'outlet-user');
  assert.equal(outletLogin.data.role, 'outlet');
  const outletSession = outletLogin.data.staffSession;
  const operatorOnly = await call('campusAssignOutlet', { staffSession: outletSession, orderId: reserved.data.orderId, outletAddress: '错误地址' }, 'outlet-user');
  assert.equal(operatorOnly.errCode, 'STAFF_UNAUTHORIZED');
  const assigned = await call('campusAssignOutlet', { staffSession: operatorSession, orderId: reserved.data.orderId, outletAddress: '北门营业厅' }, 'operator-user');
  assert.equal(assigned.success, true);

  const operatorCannotVerify = await call('campusImportVerification', {
    staffSession: operatorSession, messages: [{ featureCode: reserved.data.featureCode, idCard: '110101199001010001', result: 'verified' }],
  }, 'operator-user');
  assert.equal(operatorCannotVerify.errCode, 'STAFF_UNAUTHORIZED');

  const invalidId = await call('campusImportVerification', {
    staffSession: outletSession, messages: [{ featureCode: reserved.data.featureCode, idCard: '110101199001010002', result: 'verified' }],
  }, 'outlet-user');
  assert.equal(invalidId.data.results[0].success, true);
  const replay = await call('campusImportVerification', {
    staffSession: outletSession, messages: [{ featureCode: reserved.data.featureCode, idCard: '110101199001010002', result: 'verified' }],
  }, 'outlet-user');
  assert.equal(replay.data.results[0].message, '该订单已经激活');
  const activated = (await call('campusStudentOrders', {}, 'student-a')).data.orders[0];
  assert.equal(activated.status, 'activated');
  assert.equal(activated.idCardLast4, '0002');
});

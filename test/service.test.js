const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const TEST_PHONES = ['13800000001', '13800000002', '13800000003'];
const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAADICAIAAAAWZq/8AAAA0ElEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfBru5gABK7VpbgAAAABJRU5ErkJggg==';
const TINY_TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLrJAAAAABJRU5ErkJggg==';
const smsMessages = [];
let baseUrl;
let child;
let integrationServer;
let integrationUrl;
let tempDir;
let cachedAdminCookie;

function idCardFor(phone) {
  const sequence = phone.slice(-3) === '000' ? '001' : phone.slice(-3);
  const base = `11010119900101${sequence}`;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = [...base].reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
  return `${base}${checkCodes[sum % 11]}`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (error) { reject(error); } });
    req.on('error', reject);
  });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function waitForServer() {
  let lastError;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/schools/XXU-2026`);
      if (response.ok) return;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw lastError || new Error('测试服务未能启动');
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.cookie ? { Cookie: options.cookie } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

async function testCode(phone, purpose, schoolCode = 'XXU-2026') {
  const messageCount = smsMessages.length;
  const { response, body } = await request('/api/student/code', { method: 'POST', body: { schoolCode, phone, purpose } });
  assert.equal(response.status, 200);
  assert.equal(body.developmentCode, undefined, '配置短信网关时不得返回验证码');
  assert.equal(smsMessages.length, messageCount + 1, '统一 API 应调用短信网关');
  return smsMessages.at(-1).code;
}

async function adminCookie() {
  if (cachedAdminCookie) return cachedAdminCookie;
  const { response } = await request('/api/auth/login', { method: 'POST', body: { username: 'operator', password: 'campus-admin-2026' } });
  assert.equal(response.status, 200);
  cachedAdminCookie = response.headers.get('set-cookie').split(';')[0];
  return cachedAdminCookie;
}

async function authorizedAdminCookie() {
  const { response } = await request('/api/auth/login', { method: 'POST', body: { phone: '18600000001', password: 'CampusAdmin2026' } });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

async function offlineCookie() {
  const { response } = await request('/api/offline/register', {
    method: 'POST',
    body: { phone: '18500000001', password: 'OfflinePass1', confirmPassword: 'OfflinePass1' }
  });
  assert.equal(response.status, 201);
  return response.headers.get('set-cookie').split(';')[0];
}

async function createOrder(phone, overrides = {}) {
  const schoolCode = overrides.schoolCode || 'XXU-2026';
  const code = await testCode(phone, 'submit', schoolCode);
  const { response, body } = await request('/api/orders', {
    method: 'POST',
    body: {
      schoolCode,
      name: '内测学生',
      studentNo: `TEST-${phone.slice(-4)}`,
      idCard: idCardFor(phone),
      college: '信息工程学院',
      idCardFrontImage: TEST_IMAGE,
      idCardBackImage: TEST_IMAGE,
      phone,
      code,
      address: '内测宿舍 1 栋 101',
      deliveryRecipient: '内测收货人',
      deliveryPhone: '13700000009',
      appointment: '尽快联系',
      detail: '自动化测试订单',
      type: '校园网账号预约',
      serviceConsent: true,
      marketingConsent: false,
      ...overrides
    }
  });
  return { response, body };
}

async function updateRecord(cookie, id, body) {
  return request(`/api/admin/records/order/${encodeURIComponent(id)}`, { method: 'PATCH', cookie, body });
}

before(async () => {
  integrationServer = http.createServer(async (req, res) => {
    const body = await readJson(req);
    if (req.method === 'POST' && req.url === '/sms') {
      smsMessages.push(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.method === 'POST' && req.url === '/school-verify') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (body.studentNo === 'TEST-MISSING') return res.end(JSON.stringify({ eligible: false, reason: 'not_found' }));
      return res.end(JSON.stringify({ eligible: body.name !== '拒绝学生' }));
    }
    res.writeHead(404).end();
  });
  integrationUrl = `http://127.0.0.1:${await listen(integrationServer)}`;
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-service-test-'));
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      DATA_FILE: path.join(tempDir, 'db.json'),
      ACTIVATION_EXPORT_KEY: Buffer.alloc(32, 7).toString('base64'),
      ID_IMAGE_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      SMS_WEBHOOK_URL: `${integrationUrl}/sms`,
      SCHOOL_VERIFY_URL: `${integrationUrl}/school-verify`
    },
    stdio: 'ignore'
  });
  await waitForServer();
});

after(() => {
  child?.kill();
  integrationServer?.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('二维码、分流、H5 与小程序入口契约可用', async () => {
  const health = await request('/api/health');
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.match(health.response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(health.response.headers.get('x-frame-options'), 'DENY');
  for (const privatePath of ['/.env', '/server.js', '/data/db.json', '/database/sqlserver.sql', '/test/service.test.js']) {
    assert.equal((await request(privatePath)).response.status, 404, `${privatePath} 不得由静态服务公开`);
  }
  const dispatchPage = await request('/q/XXU-2026');
  assert.equal(dispatchPage.response.status, 200);
  assert.match(dispatchPage.body, /dispatch\.js/);
  const dispatch = await request('/api/dispatch/XXU-2026');
  assert.equal(dispatch.response.status, 200);
  assert.equal(dispatch.body.h5Path, '/service/XXU-2026');
  const unifiedEntry = await request('/api/dispatch/UNIFIED-2026');
  assert.equal(unifiedEntry.response.status, 200);
  assert.equal(unifiedEntry.body.entryType, 'unified');
  assert.equal(unifiedEntry.body.h5Path, '/service');
  assert.equal(unifiedEntry.body.school, null);
  const unifiedPage = await request('/entry');
  assert.equal(unifiedPage.response.status, 200);
  const h5 = await request('/service/XXU-2026');
  assert.equal(h5.response.status, 200);
  assert.match(h5.body, /校园通信服务/);
  const miniProgramConfig = await request('/miniprogram/app.json');
  assert.equal(miniProgramConfig.response.status, 200);
  assert.ok(miniProgramConfig.body.pages.includes('pages/home/home'));
  const fixtures = await request('/api/dev/test-fixtures');
  assert.equal(fixtures.response.status, 200);
  assert.equal(fixtures.body.school.code, 'TEST-2026');
  assert.equal(fixtures.body.students.length, 3);
  assert.equal(fixtures.body.availableOffers.length, 12);
  const developmentSchools = await request(`/api/schools?q=${encodeURIComponent('校园通信')}`);
  assert.ok(developmentSchools.body.schools.some((item) => item.code === 'TEST-2026'));
});

test('运营商未授权手机号不能登录或注册', async () => {
  const login = await request('/api/auth/login', { method: 'POST', body: { phone: '12345678901', password: 'CampusAdmin2026' } });
  assert.equal(login.response.status, 401);
  const register = await request('/api/auth/register', { method: 'POST', body: { phone: '12345678901', password: 'AdminPass2026', confirmPassword: 'AdminPass2026' } });
  assert.equal(register.response.status, 403);
});

test('不同授权运营商账号读取同一份共享业务数据', async () => {
  const first = await request('/api/admin/overview', { cookie: await adminCookie() });
  const second = await request('/api/admin/overview', { cookie: await authorizedAdminCookie() });
  assert.equal(first.response.status, 200);
  assert.equal(second.response.status, 200);
  assert.deepEqual(second.body.orders.map((record) => record.id), first.body.orders.map((record) => record.id));
  assert.deepEqual(second.body.tickets.map((record) => record.id), first.body.tickets.map((record) => record.id));
});

test('运营后台可创建学校、生成动态二维码并返回 PNG', async () => {
  const cookie = await adminCookie();
  const created = await request('/api/admin/schools', { method: 'POST', cookie, body: { name: '接口测试大学', code: 'API-2026', servicePhone: '10086', verificationMode: 'api' } });
  assert.equal(created.response.status, 201);
  const qr = await request('/api/admin/qr/API-2026', { cookie });
  assert.equal(qr.response.status, 200);
  assert.match(qr.response.headers.get('content-type'), /image\/png/);
  const audit = await request('/api/admin/audit-logs?limit=20', { cookie });
  assert.equal(audit.response.status, 200);
  assert.ok(audit.body.logs.some((item) => item.action === 'school.created' && item.target === 'API-2026'));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ 运营商: '中国联通', 可选号码: '186****0001', 套餐名称: '联通校园套餐', 月费: 29 }]), '号码');
  const imported = await request('/api/admin/number-offers/import', { method: 'POST', cookie, body: { schoolCode: 'API-2026', fileBase64: Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })).toString('base64') } });
  assert.equal(imported.response.status, 201);
  assert.equal(imported.body.imported, 1);
});

test('学生信息收集要求身份证、学院与必要同意', async () => {
  const code = await testCode(TEST_PHONES[0], 'submit');
  const noConsent = await request('/api/orders', { method: 'POST', body: { schoolCode: 'XXU-2026', name: '内测学生', studentNo: 'TEST-NO-CONSENT', phone: TEST_PHONES[0], code, address: '内测地址', detail: '未同意必要信息处理', type: '校园网账号预约' } });
  assert.equal(noConsent.response.status, 400);
  const created = await request('/api/orders', { method: 'POST', body: { schoolCode: 'XXU-2026', name: '内测学生', studentNo: 'TEST-0001', idCard: idCardFor(TEST_PHONES[0]), college: '信息工程学院', idCardFrontImage: TEST_IMAGE, idCardBackImage: TEST_IMAGE, phone: TEST_PHONES[0], code, address: '内测地址', detail: '正常预约', type: '校园网账号预约', serviceConsent: true, marketingConsent: false } });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.record.verificationStatus, 'not_required');
  const storedDb = JSON.parse(fs.readFileSync(path.join(tempDir, 'db.json'), 'utf8'));
  const storedRecord = storedDb.orders.find((item) => item.id === created.body.record.id);
  for (const filename of [storedRecord.idCardFrontFile, storedRecord.idCardBackFile]) {
    assert.match(filename, /\.enc$/);
    const encryptedImage = fs.readFileSync(path.join(tempDir, 'id-images', filename));
    assert.equal(encryptedImage.subarray(0, 5).toString('ascii'), 'CIMG1');
    assert.notDeepEqual(encryptedImage.subarray(-Buffer.from(TEST_IMAGE.split(',')[1], 'base64').length), Buffer.from(TEST_IMAGE.split(',')[1], 'base64'));
  }
});

test('错误身份证校验位和伪装图片均被拒绝', async () => {
  const phone = '13700000008';
  const validIdCard = idCardFor(phone);
  const payload = {
    schoolCode: 'XXU-2026', name: '校验测试学生', studentNo: 'VALIDATION-01', idCard: validIdCard,
    college: '信息工程学院', idCardFrontImage: TEST_IMAGE, idCardBackImage: TEST_IMAGE,
    phone, address: '内测地址', detail: '校验拒绝测试', type: '校园网账号预约', serviceConsent: true
  };
  const wrongChecksum = `${validIdCard.slice(0, -1)}${validIdCard.endsWith('0') ? '1' : '0'}`;
  const invalidId = await request('/api/orders', { method: 'POST', body: { ...payload, idCard: wrongChecksum } });
  assert.equal(invalidId.response.status, 400);
  assert.match(invalidId.body.error, /校验位/);

  const disguised = await request('/api/orders', {
    method: 'POST', body: { ...payload, idCardFrontImage: `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}` }
  });
  assert.equal(disguised.response.status, 400);
  assert.match(disguised.body.error, /文件格式不一致/);

});

test('学校接口核验关闭后，订单统一标记为无需核验', async () => {
  const verified = await createOrder(TEST_PHONES[1], { schoolCode: 'API-2026', name: '内测学生' });
  assert.equal(verified.response.status, 201);
  assert.equal(verified.body.record.verificationStatus, 'not_required');
  const rejectedCode = await testCode(TEST_PHONES[2], 'submit', 'API-2026');
  const rejected = await request('/api/orders', { method: 'POST', body: { schoolCode: 'API-2026', name: '拒绝学生', studentNo: 'TEST-REJECTED', phone: TEST_PHONES[2], code: rejectedCode, address: '内测地址', detail: '接口拒绝测试', type: '校园网账号预约', serviceConsent: true } });
  assert.equal(rejected.response.status, 400);
  const missingCode = await testCode(TEST_PHONES[0], 'submit', 'API-2026');
  const missing = await request('/api/orders', { method: 'POST', body: { schoolCode: 'API-2026', name: '内测学生', studentNo: 'TEST-MISSING', phone: TEST_PHONES[0], code: missingCode, address: '内测地址', detail: '学生信息不存在测试', type: '校园网账号预约', serviceConsent: true } });
  assert.equal(missing.response.status, 400);
});

test('选号订单预占号码，取消后自动释放', async () => {
  const before = await request('/api/schools/XXU-2026/numbers');
  const missingAddress = await createOrder('13700000006', { type: '新生选号预约', selectedOfferId: before.body.offers[0].id, address: '' });
  assert.equal(missingAddress.response.status, 400);
  assert.match(missingAddress.body.error, /收货地址/);
  const created = await createOrder(TEST_PHONES[1], { type: '新生选号预约', selectedOfferId: before.body.offers[0].id, fulfillmentMethod: '快递配送', deliveryRecipient: '内测收货人', deliveryPhone: '13700000009' });
  assert.equal(created.response.status, 201);
  const storedAfterCreate = JSON.parse(fs.readFileSync(path.join(tempDir, 'db.json'), 'utf8'));
  assert.equal(storedAfterCreate.orders.find((item) => item.id === created.body.record.id).address, '内测宿舍 1 栋 101');
  assert.equal(storedAfterCreate.orders.find((item) => item.id === created.body.record.id).deliveryRecipient, '内测收货人');
  assert.equal(storedAfterCreate.orders.find((item) => item.id === created.body.record.id).deliveryPhone, '13700000009');
  const reserved = await request('/api/schools/XXU-2026/numbers');
  assert.equal(reserved.body.offers.length, before.body.offers.length - 1);
  const cancelled = await updateRecord(await adminCookie(), created.body.record.id, { status: 'cancelled' });
  assert.equal(cancelled.response.status, 200);
  const released = await request('/api/schools/XXU-2026/numbers');
  assert.equal(released.body.offers.length, before.body.offers.length);
});

test('并发提交同一号码时只允许一个订单预占成功', async () => {
  const offers = await request('/api/schools/XXU-2026/numbers');
  const selectedOfferId = offers.body.offers[0].id;
  const firstPhone = '13900000001';
  const secondPhone = '13900000002';
  const firstCode = await testCode(firstPhone, 'submit');
  const secondCode = await testCode(secondPhone, 'submit');
  const order = (phone, code, studentNo) => request('/api/orders', {
    method: 'POST',
    body: { schoolCode: 'XXU-2026', name: '并发测试学生', studentNo, idCard: idCardFor(phone), college: '信息工程学院', idCardFrontImage: TEST_IMAGE, idCardBackImage: TEST_IMAGE, phone, code, address: '内测宿舍', deliveryRecipient: '并发收货人', deliveryPhone: '13700000009', detail: '并发预占测试', type: '新生选号预约', selectedOfferId, fulfillmentMethod: '迎新点办理', serviceConsent: true }
  });
  const results = await Promise.all([
    order(firstPhone, firstCode, 'CONCURRENT-01'),
    order(secondPhone, secondCode, 'CONCURRENT-02')
  ]);
  assert.deepEqual(results.map((result) => result.response.status).sort(), [201, 409]);
});

test('订单状态、审计历史、学生确认和评价完整闭环', async () => {
  const created = await createOrder(TEST_PHONES[2]);
  assert.equal(created.response.status, 201);
  const cookie = await adminCookie();
  const id = created.body.record.id;
  assert.equal((await updateRecord(cookie, id, { status: 'contacting' })).response.status, 200);
  assert.equal((await updateRecord(cookie, id, { status: 'assigned' })).response.status, 400);
  assert.equal((await updateRecord(cookie, id, { status: 'assigned', assignee: '内测装维员' })).response.status, 200);
  assert.equal((await updateRecord(cookie, id, { status: 'scheduled', scheduledAt: '2026-08-08T09:00:00+08:00' })).response.status, 200);
  assert.equal((await updateRecord(cookie, id, { status: 'processing' })).response.status, 200);
  assert.equal((await updateRecord(cookie, id, { status: 'completed' })).response.status, 400);
  const completed = await updateRecord(cookie, id, { status: 'completed', serviceResult: '内测服务完成' });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.record.statusHistory.length, 6);
  const code = await testCode(TEST_PHONES[2], 'confirm');
  const confirmed = await request('/api/student/confirm-completion', { method: 'POST', body: { schoolCode: 'XXU-2026', phone: TEST_PHONES[2], recordId: id, code, rating: 5, ratingComment: '自动化测试评价' } });
  assert.equal(confirmed.response.status, 200);
  assert.equal(confirmed.body.record.rating, 5);
});

test('运营商结果导入后签发一次性凭证，线下核销必须验证原手机号', async () => {
  const phone = '13700000001';
  const created = await createOrder(phone, { type: '校园网账号预约' });
  assert.equal(created.response.status, 201);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{
    服务编号: created.body.record.id, 运营商: '中国移动', 运营商返回码: '实名完成-001'
  }]), '实名结果');
  const imported = await request('/api/admin/vouchers/import', {
    method: 'POST', cookie: await adminCookie(),
    body: { fileBase64: Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })).toString('base64') }
  });
  assert.equal(imported.response.status, 201);
  assert.equal(imported.body.issued, 1);

  const noCode = await request('/api/student/records', { method: 'POST', body: { schoolCode: 'XXU-2026', phone } });
  assert.equal(noCode.response.status, 400);
  const queryCode = await testCode(phone, 'query');
  const records = await request('/api/student/records', { method: 'POST', body: { schoolCode: 'XXU-2026', phone, code: queryCode } });
  assert.equal(records.response.status, 200);
  assert.match(records.body.records[0].voucher.qrDataUrl, /^data:image\/png;base64,/);

  const db = JSON.parse(fs.readFileSync(path.join(tempDir, 'db.json'), 'utf8'));
  const voucher = db.vouchers.find((item) => item.recordId === created.body.record.id);
  const redeemPath = `/api/redeem/${encodeURIComponent(voucher.token)}`;
  assert.equal((await request(redeemPath)).body.status, 'issued');
  assert.equal((await request(`${redeemPath}/confirm`, { method: 'POST', body: { code: '000000' } })).response.status, 400);
  const redeemCode = await request(`${redeemPath}/request-code`, { method: 'POST' });
  assert.equal(redeemCode.response.status, 200);
  const code = smsMessages.at(-1).code;
  const redeemed = await request(`${redeemPath}/confirm`, { method: 'POST', body: { code, redeemedBy: 'counter-01' } });
  assert.equal(redeemed.response.status, 200);
  assert.equal((await request(`${redeemPath}/confirm`, { method: 'POST', body: { code } })).response.status, 409);
});

test('线下实体端使用授权手机号注册，且仅凭特征码和身份证双重匹配激活号码', async () => {
  const unauthorized = await request('/api/offline/register', { method: 'POST', body: { phone: '18500009999', password: 'OfflinePass1', confirmPassword: 'OfflinePass1' } });
  assert.equal(unauthorized.response.status, 403);
  const offers = await request('/api/schools/XXU-2026/numbers');
  const phone = '13700000004';
  const idCard = idCardFor(phone);
  const created = await createOrder(phone, { type: '新生选号预约', selectedOfferId: offers.body.offers[0].id, idCard });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.record.verificationStatus, 'pending_manual');

  const admin = await adminCookie();
  const addressUpdate = await request('/api/admin/offline-settings', { method: 'PATCH', cookie: admin, body: { verificationAddress: '东校区迎新服务点 A03' } });
  assert.equal(addressUpdate.response.status, 200);
  assert.ok(addressUpdate.body.affectedOrders >= 1);
  const assignedOverview = await request('/api/admin/overview', { cookie: admin });
  const assignedRecord = assignedOverview.body.orders.find((item) => item.id === created.body.record.id);
  assert.equal(assignedOverview.body.offlineSettings.verificationAddress, '东校区迎新服务点 A03');
  assert.equal(assignedRecord.idCard, idCard);
  assert.equal(assignedRecord.college, '信息工程学院');
  assert.equal(assignedRecord.backupPhone, '');
  assert.equal(assignedRecord.offlineLocation, '东校区迎新服务点 A03');
  assert.match(assignedRecord.offlineFeatureCode, /^[A-Z0-9_-]{8}$/);
  assert.equal((await updateRecord(admin, created.body.record.id, { activationStatus: 'activated' })).response.status, 403);
  const queryCode = await testCode(phone, 'query');
  const studentRecords = await request('/api/student/records', { method: 'POST', body: { schoolCode: 'XXU-2026', phone, code: queryCode } });
  const studentRecord = studentRecords.body.records.find((item) => item.id === created.body.record.id);
  assert.equal(studentRecord.offline.location, '东校区迎新服务点 A03');
  assert.equal(studentRecord.offline.featureCode, assignedRecord.offlineFeatureCode);
  assert.equal(studentRecord.activationStatus, 'pending');

  const worker = await offlineCookie();
  const wrong = await request('/api/offline/matches', {
    method: 'POST', cookie: worker,
    body: { featureCode: assignedRecord.offlineFeatureCode, idCard: '110101199001999999' }
  });
  assert.equal(wrong.response.status, 400);

  const matched = await request('/api/offline/matches', {
    method: 'POST', cookie: worker,
    body: { featureCode: assignedRecord.offlineFeatureCode, idCard }
  });
  assert.equal(matched.response.status, 200);
  assert.equal(matched.body.record.name, '内测学生');
  assert.equal(matched.body.record.phone, phone);
  assert.equal(matched.body.record.selectedNumber, assignedRecord.selectedNumber);
  const beforeConfirm = await request('/api/admin/overview', { cookie: admin });
  assert.equal(beforeConfirm.body.orders.find((item) => item.id === created.body.record.id).activationStatus, 'pending');

  const activated = await request('/api/offline/verifications', {
    method: 'POST', cookie: worker,
    body: { matchToken: matched.body.matchToken, reference: '现场核验-0004' }
  });
  assert.equal(activated.response.status, 201);
  assert.equal(activated.body.record.activationStatus, 'activated');

  const overview = await request('/api/admin/overview', { cookie: admin });
  const record = overview.body.orders.find((item) => item.id === created.body.record.id);
  assert.equal(record.activationStatus, 'activated');
  assert.equal(record.verificationStatus, 'verified');
  assert.equal(record.status, 'completed');
  assert.equal(overview.body.numberOffers.find((item) => item.id === offers.body.offers[0].id).status, 'activated');

  const storedDb = JSON.parse(fs.readFileSync(path.join(tempDir, 'db.json'), 'utf8'));
  const archive = storedDb.activatedArchives.find((item) => item.recordId === created.body.record.id);
  assert.equal(archive.algorithm, 'aes-256-gcm');
  assert.equal(archive.name, undefined);
  assert.equal(archive.idCard, undefined);
  assert.equal(archive.phone, undefined);
  assert.ok(archive.ciphertext && archive.iv && archive.tag);

  const exportedResponse = await fetch(`${baseUrl}/api/admin/export-activated.xlsx`, { headers: { Cookie: admin } });
  assert.equal(exportedResponse.status, 200);
  const exportedWorkbook = XLSX.read(Buffer.from(await exportedResponse.arrayBuffer()), { type: 'buffer' });
  const exportedRows = XLSX.utils.sheet_to_json(exportedWorkbook.Sheets['已实名激活名单']);
  const exported = exportedRows.find((item) => item.身份证号 === idCard);
  assert.equal(exported.学校, 'XX大学');
  assert.equal(exported.学院, '信息工程学院');
  assert.equal(exported.姓名, '内测学生');
  assert.equal(exported.选号号码, assignedRecord.selectedNumber);
  assert.equal(String(exported.联系电话), phone);
  assert.equal(exported.激活状态, '已激活');
});

test('学生可用手机号和办理密码查询本人服务', async () => {
  const phone = '13700000003';
  const password = 'CampusPass1';
  const created = await createOrder(phone, { password });
  assert.equal(created.response.status, 201);
  const records = await request('/api/student/records', { method: 'POST', body: { phone, password } });
  assert.equal(records.response.status, 200);
  assert.ok(records.body.records.some((record) => record.id === created.body.record.id));
});

test('CRM、实名制与装维系统尚未接入，测试只验证内部状态字段', async () => {
  const overview = await request('/api/admin/overview', { cookie: await adminCookie() });
  assert.equal(overview.response.status, 200);
  assert.equal(typeof overview.body.metrics.availableNumbers, 'number');
  assert.ok(smsMessages.length >= 6, '短信通知契约已被模拟网关接收');
});

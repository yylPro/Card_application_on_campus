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
const TEST_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLrJAAAAABJRU5ErkJggg==';
const smsMessages = [];
let baseUrl;
let child;
let integrationServer;
let integrationUrl;
let tempDir;

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
  const { response } = await request('/api/auth/login', { method: 'POST', body: { username: 'operator', password: 'campus-admin-2026' } });
  assert.equal(response.status, 200);
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
      idCard: `110101199001${phone.slice(-6)}`,
      college: '信息工程学院',
      idCardFrontImage: TEST_IMAGE,
      idCardBackImage: TEST_IMAGE,
      phone,
      code,
      address: '内测宿舍 1 栋 101',
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
  const dispatchPage = await request('/q/XXU-2026');
  assert.equal(dispatchPage.response.status, 200);
  assert.match(dispatchPage.body, /dispatch\.js/);
  const dispatch = await request('/api/dispatch/XXU-2026');
  assert.equal(dispatch.response.status, 200);
  assert.equal(dispatch.body.h5Path, '/service/XXU-2026');
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
  assert.equal(fixtures.body.availableOffers.length, 3);
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
  const created = await request('/api/orders', { method: 'POST', body: { schoolCode: 'XXU-2026', name: '内测学生', studentNo: 'TEST-0001', idCard: '110101199001010001', college: '信息工程学院', idCardFrontImage: TEST_IMAGE, idCardBackImage: TEST_IMAGE, phone: TEST_PHONES[0], code, address: '内测地址', detail: '正常预约', type: '校园网账号预约', serviceConsent: true, marketingConsent: false } });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.record.verificationStatus, 'not_required');
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
  const created = await createOrder(TEST_PHONES[1], { type: '新生选号预约', selectedOfferId: before.body.offers[0].id, fulfillmentMethod: '快递配送' });
  assert.equal(created.response.status, 201);
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
    body: { schoolCode: 'XXU-2026', name: '并发测试学生', studentNo, idCard: `110101199001${phone.slice(-6)}`, college: '信息工程学院', idCardFrontImage: TEST_IMAGE, idCardBackImage: TEST_IMAGE, phone, code, address: '内测宿舍', detail: '并发预占测试', type: '新生选号预约', selectedOfferId, fulfillmentMethod: '迎新点办理', serviceConsent: true }
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

test('CRM、实名制与装维系统尚未接入，测试只验证内部状态字段', async () => {
  const overview = await request('/api/admin/overview', { cookie: await adminCookie() });
  assert.equal(overview.response.status, 200);
  assert.equal(typeof overview.body.metrics.availableNumbers, 'number');
  assert.ok(smsMessages.length >= 6, '短信通知契约已被模拟网关接收');
});

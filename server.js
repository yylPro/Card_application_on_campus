const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const { Storage } = require('./backend/storage');

const ROOT = __dirname;

function loadLocalEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
  }
}

// Local secrets live in .env; explicitly supplied environment variables take precedence.
loadLocalEnv();
const DB_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(ROOT, 'data', 'db.json');
const DATA_DIR = path.dirname(DB_FILE);
const UPLOAD_DIR = path.join(DATA_DIR, 'id-images');
const IMPORT_DIR = process.env.IMPORT_DIR ? path.resolve(process.env.IMPORT_DIR) : path.join(ROOT, 'data', 'imports');
const DB_DRIVER = (process.env.DB_DRIVER || 'json').toLowerCase();
let sqlStorage = null;
let runtimeDb = null;
const PORT = Number(process.env.PORT || 4173);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ADMIN_USER = process.env.ADMIN_USER || 'operator';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'campus-admin-2026';
const WECHAT_OFFICIAL_APP_ID = process.env.WECHAT_OFFICIAL_APP_ID || '';
const WECHAT_OFFICIAL_APP_SECRET = process.env.WECHAT_OFFICIAL_APP_SECRET || '';
const WECHAT_MINIPROGRAM_APP_ID = process.env.WECHAT_MINIPROGRAM_APP_ID || '';
const WECHAT_MINIPROGRAM_HOME = process.env.WECHAT_MINIPROGRAM_HOME || 'pages/home/home';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ALLOWED_OPERATORS = new Set(['中国移动', '中国联通', '中国电信']);
const TEST_PHONE_NUMBERS = new Set((process.env.TEST_PHONE_NUMBERS || '13800000001,13800000002,13800000003')
  .split(',').map((phone) => phone.trim()).filter(validPhone));
const TEST_SCHOOL_CODE = 'TEST-2026';
const TEST_FIXTURES = [
  { flow: '选号与线下实名激活', name: '内测新生一', studentNo: 'TEST20260001', phone: '13800000001', service: '新生选号预约' },
  { flow: '校园网账号预约', name: '内测新生二', studentNo: 'TEST20260002', phone: '13800000002', service: '校园网账号预约' },
  { flow: '宽带故障报修', name: '内测学生三', studentNo: 'TEST20260003', phone: '13800000003', service: '宽带故障报修' }
];
const sessions = new Map();
const queryCodes = new Map();
const authAttempts = new Map();
let mutationQueue = Promise.resolve();
let wechatTicketCache = { value: '', expiresAt: 0 };
const allowedStatuses = new Set(['pending', 'contacting', 'assigned', 'scheduled', 'processing', 'completed', 'cancelled']);
const allowedVerificationStatuses = new Set(['pending_manual', 'verified', 'rejected', 'not_required']);
const allowedDeliveryStatuses = new Set(['not_applicable', 'pending', 'shipped', 'delivered']);
const allowedActivationStatuses = new Set(['not_applicable', 'pending', 'activated', 'failed']);
const allowedSubsidyStatuses = new Set(['not_applicable', 'pending', 'approved', 'paid']);
const statusTransitions = {
  pending: new Set(['pending', 'contacting', 'cancelled']),
  contacting: new Set(['contacting', 'assigned', 'scheduled', 'cancelled']),
  assigned: new Set(['assigned', 'scheduled', 'processing', 'cancelled']),
  scheduled: new Set(['scheduled', 'processing', 'cancelled']),
  processing: new Set(['processing', 'completed', 'cancelled']),
  completed: new Set(['completed']),
  cancelled: new Set(['cancelled'])
};

const initialDb = {
  schools: [{
    code: 'XXU-2026',
    name: 'XX大学',
    status: 'active',
    servicePhone: '10086',
    verificationMode: 'manual',
    scans: 0,
    updatedAt: new Date().toISOString()
  }, ...(!IS_PRODUCTION ? [{
    code: TEST_SCHOOL_CODE,
    name: '校园通信服务示范大学',
    status: 'active',
    servicePhone: '10086',
    verificationMode: 'manual',
    scans: 0,
    updatedAt: new Date().toISOString()
  }] : [])],
  orders: [],
  tickets: [],
  numberOffers: [
    { id: 'XXU-1382026', schoolCode: 'XXU-2026', displayNumber: '138****2026', planName: '校园畅享套餐', monthlyFee: 39, status: 'available', reservedBy: '' },
    { id: 'XXU-1391688', schoolCode: 'XXU-2026', displayNumber: '139****1688', planName: '校园畅享套餐', monthlyFee: 39, status: 'available', reservedBy: '' },
    { id: 'XXU-1585200', schoolCode: 'XXU-2026', displayNumber: '158****5200', planName: '青春优享套餐', monthlyFee: 59, status: 'available', reservedBy: '' },
    ...(!IS_PRODUCTION ? [
      { id: 'TEST-1380001', schoolCode: TEST_SCHOOL_CODE, displayNumber: '138****0001', planName: '内测选号套餐 A', monthlyFee: 0, status: 'available', reservedBy: '' },
      { id: 'TEST-1380002', schoolCode: TEST_SCHOOL_CODE, displayNumber: '138****0002', planName: '内测选号套餐 B', monthlyFee: 0, status: 'available', reservedBy: '' },
      { id: 'TEST-1380003', schoolCode: TEST_SCHOOL_CODE, displayNumber: '138****0003', planName: '内测选号套餐 C', monthlyFee: 0, status: 'available', reservedBy: '' }
    ] : [])
  ]
};

function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf8');
}

function normalizeDb(db) {
  db.schools = Array.isArray(db.schools) ? db.schools : [];
  db.orders = Array.isArray(db.orders) ? db.orders : [];
  db.tickets = Array.isArray(db.tickets) ? db.tickets : [];
  db.numberOffers = Array.isArray(db.numberOffers) ? db.numberOffers : [];
  db.numberOffers.forEach((offer) => { if (!ALLOWED_OPERATORS.has(offer.operator)) offer.operator = '中国移动'; });
  db.auditLogs = Array.isArray(db.auditLogs) ? db.auditLogs.slice(-5000) : [];
  db.schools.forEach((school) => {
    if (!Number.isFinite(school.scans)) school.scans = 0;
    if (!['manual', 'api', 'none'].includes(school.verificationMode)) school.verificationMode = 'manual';
    if (!Array.isArray(school.colleges)) school.colleges = [];
    if (school.code === TEST_SCHOOL_CODE && school.colleges.length === 0) school.colleges = ['信息工程学院', '通信工程学院', '经济管理学院'];
    if (school.code === TEST_SCHOOL_CODE && /内测/.test(school.name)) school.name = '校园通信服务示范大学';
  });
  [...db.orders, ...db.tickets].forEach((record) => {
    if (!record.verificationStatus) record.verificationStatus = 'pending_manual';
    if (!record.internalNote) record.internalNote = '';
    if (!record.appointment) record.appointment = '尽快联系';
    if (!allowedDeliveryStatuses.has(record.deliveryStatus)) record.deliveryStatus = 'not_applicable';
    if (!allowedActivationStatuses.has(record.activationStatus)) record.activationStatus = 'not_applicable';
    if (!allowedSubsidyStatuses.has(record.subsidyStatus)) record.subsidyStatus = 'not_applicable';
    if (!Number.isFinite(record.subsidyAmount)) record.subsidyAmount = 0;
    if (!record.selectedNumber) record.selectedNumber = '';
    if (!record.selectedOfferId) record.selectedOfferId = '';
    if (!record.idCard) record.idCard = '';
    if (!record.college) record.college = '';
    if (!record.backupPhone) record.backupPhone = '';
    if (!record.idCardFrontFile) record.idCardFrontFile = '';
    if (!record.idCardBackFile) record.idCardBackFile = '';
    if (!record.fulfillmentMethod) record.fulfillmentMethod = '';
    if (!record.channel) record.channel = 'school_qr';
    if (!record.assignee) record.assignee = '';
    if (!record.scheduledAt) record.scheduledAt = '';
    if (!record.deliveryCarrier) record.deliveryCarrier = '';
    if (!record.deliveryTrackingNo) record.deliveryTrackingNo = '';
    if (!record.serviceResult) record.serviceResult = '';
    if (!Array.isArray(record.statusHistory)) record.statusHistory = [{ status: record.status || 'pending', at: record.createdAt || new Date().toISOString(), by: 'system' }];
    if (!Number.isInteger(record.rating) || record.rating < 1 || record.rating > 5) record.rating = 0;
    if (!record.ratingComment) record.ratingComment = '';
    if (!record.completionConfirmedAt) record.completionConfirmedAt = '';
  });
  return db;
}

function syncSchoolsFromWorkbook(db) {
  if (!fs.existsSync(IMPORT_DIR)) return false;
  const filename = fs.readdirSync(IMPORT_DIR).find((item) => /\.xlsx?$/i.test(item));
  if (!filename) return false;
  let rows;
  try {
    const workbook = XLSX.readFile(path.join(IMPORT_DIR, filename));
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  } catch (error) {
    console.error('学校信息 Excel 读取失败:', error.message);
    return false;
  }
  let changed = false;
  const importedCodes = new Set();
  for (const row of rows.slice(1)) {
    const name = safe(row[0], 100);
    if (!name) continue;
    const colleges = [...new Set(String(row[1] || '').split(/[、,，/；;]/).map((item) => safe(item, 80)).filter(Boolean))].slice(0, 200);
    const digest = crypto.createHash('sha1').update(name).digest('hex').slice(0, 8).toUpperCase();
    const code = `GX-${digest}`;
    importedCodes.add(code);
    let school = db.schools.find((item) => item.code === code);
    if (!school) {
      school = { code, name, status: 'active', source: 'workbook', servicePhone: '10086', verificationMode: 'none', colleges, scans: 0, updatedAt: new Date().toISOString() };
      db.schools.push(school);
      changed = true;
    } else if (school.name !== name || JSON.stringify(school.colleges || []) !== JSON.stringify(colleges) || school.status !== 'active') {
      school.name = name; school.colleges = colleges; school.status = 'active'; school.source = 'workbook'; school.updatedAt = new Date().toISOString(); changed = true;
    }
  }
  for (const school of db.schools) if (school.source === 'workbook' && !importedCodes.has(school.code) && school.status === 'active') { school.status = 'disabled'; school.updatedAt = new Date().toISOString(); changed = true; }
  return changed;
}

function readDb() {
  ensureDb();
  if (runtimeDb) return runtimeDb;
  const db = normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  if (syncSchoolsFromWorkbook(db)) writeDb(db);
  return db;
}

function writeDb(db) {
  if (sqlStorage) { runtimeDb = db; sqlStorage.save(db).catch((error) => console.error('数据库保存失败:', error.message)); return; }
  const tempFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tempFile, DB_FILE);
}

function audit(db, action, actor, target, details = {}) {
  db.auditLogs.push({ id: id('AUD'), action, actor, target, details, at: new Date().toISOString() });
  if (db.auditLogs.length > 5000) db.auditLogs.splice(0, db.auditLogs.length - 5000);
}

function runMutation(task) {
  const next = mutationQueue.then(task, task);
  mutationQueue = next.catch(() => {});
  return next;
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function rateLimit(map, key, maxAttempts, windowMs) {
  const now = Date.now();
  const attempts = (map.get(key) || []).filter((time) => time > now - windowMs);
  if (attempts.length >= maxAttempts) return false;
  attempts.push(now);
  map.set(key, attempts);
  return true;
}

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase();
}

function safe(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function validPhone(value) {
  return /^1\d{10}$/.test(value);
}

function validIdCard(value) {
  return /^(\d{17}[\dXx])$/.test(value);
}

function maskPhoneNumber(value) {
  const normalized = String(value || '').replace(/\s|-/g, '');
  if (/^1\d{10}$/.test(normalized)) return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
  return normalized;
}

function saveIdImage(value, recordId, side) {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''));
  if (!match) throw new Error('身份证图片仅支持 JPG 或 PNG 格式');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) throw new Error('单张身份证图片不能超过 2MB');
  const extension = match[1] === 'image/png' ? 'png' : 'jpg';
  const filename = `${recordId}-${side}.${extension}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return filename;
}

function validCode(value) {
  return /^[A-Za-z0-9-]{3,40}$/.test(value);
}

function isDevelopmentTestPhone(phone) {
  return !IS_PRODUCTION && TEST_PHONE_NUMBERS.has(phone);
}

function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(JSON.stringify(body));
}

function text(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        reject(new Error('请求内容过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('提交内容格式错误'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  return (req.headers.cookie || '').split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index > -1) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    return cookies;
  }, {});
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user: ADMIN_USER, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function sessionCookie(token, maxAge) {
  return `campus_admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${IS_PRODUCTION ? '; Secure' : ''}`;
}

function sessionFor(req) {
  const token = parseCookies(req).campus_admin_session;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function requireAdmin(req, res) {
  const session = sessionFor(req);
  if (!session) {
    json(res, 401, { error: '请先登录运营商后台' });
    return null;
  }
  return session;
}

function clearExpiredMemory() {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
  for (const [key, code] of queryCodes) if (code.expiresAt <= now) queryCodes.delete(key);
}

function otpKey(purpose, schoolCode, phone) {
  return `${purpose}:${schoolCode}:${phone}`;
}

async function issueStudentCode(db, body, purpose) {
  const schoolCode = safe(body.schoolCode, 40);
  const phone = safe(body.phone, 20);
  if (!validPhone(phone)) return { error: '请输入正确的 11 位手机号码', status: 400 };
  const school = db.schools.find((item) => item.code === schoolCode && item.status === 'active');
  if (!school) return { error: '学校信息无效', status: 400 };
  const key = otpKey(purpose, schoolCode, phone);
  const existing = queryCodes.get(key);
  if (existing && existing.sentAt + OTP_RESEND_MS > Date.now()) return { error: '验证码已发送，请稍后再试', status: 429 };
  const code = String(crypto.randomInt(100000, 1000000));
  try { await sendVerificationCode(phone, code); } catch { return { error: '验证码服务暂时不可用，请稍后重试', status: 503 }; }
  queryCodes.set(key, { code, sentAt: Date.now(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  const response = { ok: true, expiresInSeconds: Math.floor(OTP_TTL_MS / 1000) };
  if (isDevelopmentTestPhone(phone) && !process.env.SMS_WEBHOOK_URL) response.developmentCode = code;
  return { response, status: 200 };
}

function consumeStudentCode(schoolCode, phone, code, purpose) {
  const key = otpKey(purpose, schoolCode, phone);
  const storedCode = queryCodes.get(key);
  if (!validPhone(phone) || !/^\d{6}$/.test(code)) return '请输入手机号和 6 位验证码';
  if (!storedCode || storedCode.expiresAt < Date.now()) return '验证码已过期，请重新获取';
  if (storedCode.attempts >= 5) return '验证码尝试次数过多，请重新获取';
  if (!crypto.timingSafeEqual(Buffer.from(code), Buffer.from(storedCode.code))) {
    storedCode.attempts += 1;
    return '验证码错误';
  }
  queryCodes.delete(key);
  return null;
}

function safeIso(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function availableOffers(db, schoolCode) {
  return db.numberOffers
    .filter((offer) => offer.schoolCode === schoolCode && offer.status === 'available')
    .map(({ id, operator, displayNumber, planName, monthlyFee }) => ({ id, operator: operator || '未指定运营商', displayNumber, planName, monthlyFee }));
}

function pagedOffers(db, schoolCode, operator, query, page, pageSize) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const all = db.numberOffers.filter((offer) => offer.schoolCode === schoolCode && offer.status === 'available'
    && (!operator || offer.operator === operator)
    && (!normalizedQuery || `${offer.displayNumber} ${offer.planName}`.toLowerCase().includes(normalizedQuery)));
  const start = (page - 1) * pageSize;
  return { offers: all.slice(start, start + pageSize).map(({ id, operator: offerOperator, displayNumber, planName, monthlyFee }) => ({ id, operator: offerOperator || '未指定运营商', displayNumber, planName, monthlyFee })), total: all.length, page, pageSize, totalPages: Math.ceil(all.length / pageSize) };
}

function publicSchool(school) {
  return {
    code: school.code,
    name: school.name,
    status: school.status,
    servicePhone: school.servicePhone,
    verificationMode: school.verificationMode,
    colleges: school.colleges || []
  };
}

function dispatchSchool(school) {
  return {
    school: publicSchool(school),
    miniProgram: {
      enabled: Boolean(WECHAT_OFFICIAL_APP_ID && WECHAT_OFFICIAL_APP_SECRET && WECHAT_MINIPROGRAM_APP_ID),
      appId: WECHAT_MINIPROGRAM_APP_ID || null,
      path: `${WECHAT_MINIPROGRAM_HOME}?schoolCode=${encodeURIComponent(school.code)}`
    },
    h5Path: `/service/${encodeURIComponent(school.code)}`
  };
}

async function getWechatJsapiTicket() {
  if (wechatTicketCache.value && wechatTicketCache.expiresAt > Date.now()) return wechatTicketCache.value;
  const tokenUrl = new URL('https://api.weixin.qq.com/cgi-bin/token');
  tokenUrl.searchParams.set('grant_type', 'client_credential');
  tokenUrl.searchParams.set('appid', WECHAT_OFFICIAL_APP_ID);
  tokenUrl.searchParams.set('secret', WECHAT_OFFICIAL_APP_SECRET);
  const tokenResponse = await fetch(tokenUrl);
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error(token.errmsg || '无法获取微信访问令牌');
  const ticketUrl = new URL('https://api.weixin.qq.com/cgi-bin/ticket/getticket');
  ticketUrl.searchParams.set('access_token', token.access_token);
  ticketUrl.searchParams.set('type', 'jsapi');
  const ticketResponse = await fetch(ticketUrl);
  const ticket = await ticketResponse.json();
  if (!ticketResponse.ok || !ticket.ticket) throw new Error(ticket.errmsg || '无法获取微信 JSAPI 凭证');
  wechatTicketCache = { value: ticket.ticket, expiresAt: Date.now() + Math.max(60, Number(ticket.expires_in || 7200) - 300) * 1000 };
  return ticket.ticket;
}

async function wechatJsConfig(pageUrl) {
  const ticket = await getWechatJsapiTicket();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash('sha1').update(`jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${pageUrl}`).digest('hex');
  return { appId: WECHAT_OFFICIAL_APP_ID, timestamp, nonceStr, signature };
}

async function verifyStudent(school, record) {
  if (school.verificationMode === 'none') return { status: 'not_required' };
  if (school.verificationMode !== 'api' || !process.env.SCHOOL_VERIFY_URL) return { status: 'pending_manual' };
  try {
    const response = await fetch(process.env.SCHOOL_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SCHOOL_VERIFY_TOKEN ? { Authorization: `Bearer ${process.env.SCHOOL_VERIFY_TOKEN}` } : {})
      },
      body: JSON.stringify({ schoolCode: school.code, name: record.name, studentNo: record.studentNo })
    });
    if (!response.ok) return { status: 'pending_manual' };
    const result = await response.json();
    if (result.eligible === true) return { status: 'verified' };
    if (result.reason === 'not_found') return { status: 'rejected', error: '未查询到学生信息，请核对姓名和学号后重新提交' };
    return { status: 'rejected', error: '学生资格不符合办理条件，无法提交服务申请' };
  } catch {
    return { status: 'pending_manual' };
  }
}

async function sendVerificationCode(phone, code) {
  if (process.env.SMS_WEBHOOK_URL) {
    const response = await fetch(process.env.SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SMS_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.SMS_WEBHOOK_TOKEN}` } : {})
      },
      body: JSON.stringify({ phone, template: 'campus_service_query', code, expiresInMinutes: 5 })
    });
    if (!response.ok) throw new Error('短信发送失败，请稍后重试');
    return;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('短信服务尚未配置');
}

function csvEscape(value) {
  const textValue = String(value ?? '');
  return /[,"\r\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
}

function csv(records) {
  const header = ['服务编号', '学校', '姓名', '学号', '身份证号码', '学院', '手机号', '服务事项', '运营商', '意向号码', '交付方式', '服务地址', '预约时间', '需求说明', '服务状态', '交付进度', '实名激活', '补贴状态', '补贴金额', '营销授权', '内部备注', '创建时间'];
  const rows = records.map((record) => [
    record.id, record.schoolName, record.name, record.studentNo, record.idCard, record.college, record.phone, record.type,
    record.operator, record.selectedNumber, record.fulfillmentMethod, record.address, record.appointment, record.detail, record.status,
    record.deliveryStatus, record.activationStatus, record.subsidyStatus, record.subsidyAmount,
    record.marketingConsent ? '是' : '否', record.internalNote, record.createdAt
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')}`;
}

async function api(req, res, url) {
  clearExpiredMemory();
  const db = readDb();

  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { status: 'ok', time: new Date().toISOString() });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const username = safe(body.username, 60);
    const password = String(body.password || '');
    if (!rateLimit(authAttempts, `login:${clientIp(req)}`, 8, 15 * 60 * 1000)) {
      return json(res, 429, { error: '登录尝试次数过多，请 15 分钟后再试' });
    }
    const expectedPassword = Buffer.from(ADMIN_PASSWORD);
    const suppliedPassword = Buffer.from(password);
    const passwordMatches = suppliedPassword.length === expectedPassword.length
      && crypto.timingSafeEqual(suppliedPassword, expectedPassword);
    if (username !== ADMIN_USER || !passwordMatches) {
      return json(res, 401, { error: '账号或密码错误' });
    }
    const token = createSession();
    audit(db, 'auth.login', ADMIN_USER, ADMIN_USER, { ip: clientIp(req) });
    writeDb(db);
    return json(res, 200, { user: ADMIN_USER }, {
      'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000))
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const session = sessionFor(req);
    if (session) sessions.delete(session.token);
    return json(res, 200, { ok: true }, {
      'Set-Cookie': sessionCookie('', 0)
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/session') {
    const session = sessionFor(req);
    return json(res, 200, { authenticated: Boolean(session), user: session?.user || null });
  }

  if (req.method === 'GET' && url.pathname === '/api/dev/test-fixtures') {
    if (IS_PRODUCTION) return json(res, 404, { error: '接口不存在' });
    const school = db.schools.find((item) => item.code === TEST_SCHOOL_CODE && item.status === 'active');
    if (!school) return json(res, 503, { error: '内测学校尚未初始化，请执行内测数据初始化' });
    return json(res, 200, {
      school: publicSchool(school),
      entryPath: `/q/${TEST_SCHOOL_CODE}`,
      students: TEST_FIXTURES,
      availableOffers: availableOffers(db, TEST_SCHOOL_CODE),
      note: '仅开发和测试环境可用；测试验证码只对内测手机号显示。'
    });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/dispatch/')) {
    const code = decodeURIComponent(url.pathname.split('/').pop());
    const school = db.schools.find((item) => item.code === code && item.status === 'active');
    if (!school) return json(res, 404, { error: '学校二维码无效或已停用' });
    school.scans += 1;
    school.updatedAt = new Date().toISOString();
    writeDb(db);
    return json(res, 200, dispatchSchool(school));
  }

  if (req.method === 'POST' && url.pathname.startsWith('/api/dispatch/') && url.pathname.endsWith('/wechat-config')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const code = decodeURIComponent(parts[2] || '');
    const school = db.schools.find((item) => item.code === code && item.status === 'active');
    if (!school) return json(res, 404, { error: '学校二维码无效或已停用' });
    if (!WECHAT_OFFICIAL_APP_ID || !WECHAT_OFFICIAL_APP_SECRET || !WECHAT_MINIPROGRAM_APP_ID) return json(res, 503, { error: '小程序拉起尚未配置' });
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const pageUrl = safe(body.pageUrl, 500);
    try {
      if (new URL(pageUrl).origin !== url.origin) return json(res, 400, { error: '分流页地址无效' });
    } catch { return json(res, 400, { error: '分流页地址无效' }); }
    try { return json(res, 200, { config: await wechatJsConfig(pageUrl) }); }
    catch { return json(res, 503, { error: '微信小程序服务暂时不可用，请使用网页端办理' }); }
  }

  if (req.method === 'GET' && url.pathname === '/api/schools') {
    const query = safe(url.searchParams.get('q'), 60).toLowerCase();
    const schools = db.schools.filter((item) => item.status === 'active' && (!query || item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query))).slice(0, 20).map(publicSchool);
    return json(res, 200, { schools });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/schools/') && url.pathname.endsWith('/numbers')) {
    const parts = url.pathname.split('/').filter(Boolean);
    const code = decodeURIComponent(parts[2] || '');
    const school = db.schools.find((item) => item.code === code && item.status === 'active');
    if (!school) return json(res, 404, { error: '学校二维码无效或已停用' });
    const operator = safe(url.searchParams.get('operator'), 20);
    const query = safe(url.searchParams.get('q'), 60);
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page'), 10) || 1);
    const pageSize = Math.min(100, Math.max(10, Number.parseInt(url.searchParams.get('pageSize'), 10) || 30));
    return json(res, 200, pagedOffers(db, school.code, operator, query, page, pageSize));
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/schools/')) {
    const code = decodeURIComponent(url.pathname.split('/').pop());
    const school = db.schools.find((item) => item.code === code && item.status === 'active');
    if (!school) return json(res, 404, { error: '学校二维码无效或已停用' });
    if (url.searchParams.get('track') === '1') {
      school.scans += 1;
      school.updatedAt = new Date().toISOString();
      writeDb(db);
    }
    return json(res, 200, { school: publicSchool(school) });
  }

  if (req.method === 'POST' && (url.pathname === '/api/student/code' || url.pathname === '/api/student/query-code')) {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const purpose = ['submit', 'query', 'confirm'].includes(body.purpose) ? body.purpose : 'query';
    const result = await issueStudentCode(db, body, purpose);
    return json(res, result.status, result.response || { error: result.error });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/records') {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const schoolCode = safe(body.schoolCode, 40);
    const phone = safe(body.phone, 20);
    if (!db.schools.some((item) => item.code === schoolCode && item.status === 'active')) return json(res, 404, { error: '学校入口无效或已停用' });
    if (!validPhone(phone)) return json(res, 400, { error: '请输入正确的 11 位手机号码' });
    const records = [...db.orders, ...db.tickets]
      .filter((record) => record.schoolCode === schoolCode && record.phone === phone)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(({ id, type, status, createdAt, appointment, operator, selectedNumber, deliveryStatus, activationStatus, fulfillmentMethod, completionConfirmedAt, rating }) => ({ id, type, status, createdAt, appointment, operator, selectedNumber, deliveryStatus, activationStatus, fulfillmentMethod, completionConfirmedAt, rating }));
    return json(res, 200, { records });
  }

  if (req.method === 'POST' && (url.pathname === '/api/orders' || url.pathname === '/api/tickets')) {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const schoolCode = safe(body.schoolCode, 40);
    const school = db.schools.find((item) => item.code === schoolCode && item.status === 'active');
    if (!school) return json(res, 400, { error: '学校信息无效，请从学校专属二维码进入' });
    const record = {
      id: id(url.pathname === '/api/orders' ? 'ORD' : 'TKT'),
      schoolCode,
      schoolName: school.name,
      name: safe(body.name, 40),
      studentNo: safe(body.studentNo, 60),
      idCard: safe(body.idCard, 18).toUpperCase(),
      college: safe(body.college, 80),
      phone: safe(body.phone, 20),
      backupPhone: safe(body.backupPhone, 20),
      address: safe(body.address, 160),
      appointment: safe(body.appointment, 60) || '尽快联系',
      detail: safe(body.detail, 500),
      type: safe(body.type, 60),
      channel: safe(body.channel, 40) || 'school_qr',
      selectedNumber: safe(body.selectedNumber, 30),
      operator: safe(body.operator, 20),
      selectedOfferId: safe(body.selectedOfferId, 80),
      fulfillmentMethod: safe(body.fulfillmentMethod, 30),
      serviceConsent: body.serviceConsent === true || body.serviceConsent === 'on',
      marketingConsent: body.marketingConsent === true,
      status: 'pending',
      verificationStatus: 'pending_manual',
      deliveryStatus: 'not_applicable',
      activationStatus: 'not_applicable',
      subsidyStatus: 'not_applicable',
      subsidyAmount: 0,
      internalNote: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignee: '',
      scheduledAt: '',
      deliveryCarrier: '',
      deliveryTrackingNo: '',
      serviceResult: '',
      statusHistory: [],
      completionConfirmedAt: '',
      rating: 0,
      ratingComment: ''
    };
    if (!record.name) return json(res, 400, { error: '请输入姓名' });
    if (!validIdCard(record.idCard)) return json(res, 400, { error: '请输入正确的 18 位身份证号码' });
    if (!record.college) return json(res, 400, { error: '请输入所属学院' });
    if (!validPhone(record.phone)) return json(res, 400, { error: '请输入正确的 11 位手机号码' });
    if (record.backupPhone && !validPhone(record.backupPhone)) return json(res, 400, { error: '备用联系电话应为正确的 11 位手机号码' });
    if (!record.detail) return json(res, 400, { error: '请填写需求说明' });
    if (!record.type) return json(res, 400, { error: '请选择服务项目' });
    if (!record.serviceConsent) return json(res, 400, { error: '请先同意信息收集和后续联系说明' });
    try {
      record.idCardFrontFile = saveIdImage(body.idCardFrontImage, record.id, 'front');
      record.idCardBackFile = saveIdImage(body.idCardBackImage, record.id, 'back');
    } catch (error) { return json(res, 400, { error: error.message }); }
    if (url.pathname === '/api/orders' && record.type.includes('选号')) {
      const offer = db.numberOffers.find((item) => item.id === record.selectedOfferId && item.schoolCode === schoolCode && item.status === 'available');
      if (!offer) return json(res, 409, { error: '所选号码已被预占，请返回重新选择' });
      record.selectedNumber = offer.displayNumber;
      record.operator = offer.operator;
      record.fulfillmentMethod = '';
      record.deliveryStatus = 'pending';
      record.activationStatus = 'pending';
      record.subsidyStatus = 'pending';
    } else {
      record.selectedNumber = '';
      record.fulfillmentMethod = '';
    }
    if (record.selectedOfferId) {
      const offer = db.numberOffers.find((item) => item.id === record.selectedOfferId);
      offer.status = 'reserved';
      offer.reservedBy = record.id;
    }
    record.statusHistory.push({ status: record.status, at: record.createdAt, by: 'student' });
    record.verificationStatus = 'not_required';
    const collection = url.pathname === '/api/orders' ? db.orders : db.tickets;
    collection.push(record);
    audit(db, 'student.submitted', 'student', record.id, { schoolCode, type: record.type });
    writeDb(db);
    return json(res, 201, { record: { id: record.id, type: record.type, status: record.status, verificationStatus: record.verificationStatus } });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
    if (!requireAdmin(req, res)) return;
    const openRecords = (records) => records.filter((record) => !['completed', 'cancelled'].includes(record.status)).length;
    return json(res, 200, {
      schools: db.schools,
      orders: db.orders.slice(-300).reverse(),
      tickets: db.tickets.slice(-300).reverse(),
      metrics: {
        scans: db.schools.reduce((total, school) => total + (school.scans || 0), 0),
        orders: openRecords(db.orders),
        tickets: openRecords(db.tickets),
        activeSchools: db.schools.filter((item) => item.status === 'active').length,
        availableNumbers: db.numberOffers.filter((item) => item.status === 'available').length
      },
      numberOffers: db.numberOffers.slice(-500).reverse()
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/audit-logs') {
    if (!requireAdmin(req, res)) return;
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
    return json(res, 200, { logs: db.auditLogs.slice(-limit).reverse() });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/number-offers') {
    if (!requireAdmin(req, res)) return;
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const schoolCode = safe(body.schoolCode, 40);
    const operator = safe(body.operator, 20);
    const displayNumber = maskPhoneNumber(safe(body.displayNumber, 20));
    const planName = safe(body.planName, 80);
    const monthlyFee = Number(body.monthlyFee);
    if (!db.schools.some((item) => item.code === schoolCode)) return json(res, 400, { error: '学校不存在' });
    if (!ALLOWED_OPERATORS.has(operator)) return json(res, 400, { error: '请选择中国移动、中国联通或中国电信' });
    if (!/^1\d{2}\*{4}\d{4}$/.test(displayNumber)) return json(res, 400, { error: '脱敏号码格式不正确，例如 138****0001' });
    if (!planName) return json(res, 400, { error: '请输入套餐名称' });
    if (!Number.isFinite(monthlyFee) || monthlyFee < 0 || monthlyFee > 9999) return json(res, 400, { error: '月费应为 0 至 9999 的数字' });
    if (db.numberOffers.some((item) => item.schoolCode === schoolCode && item.displayNumber === displayNumber)) return json(res, 409, { error: '该学校已存在相同号码资源' });
    const offer = { id: id('NUM'), schoolCode, operator, displayNumber, planName, monthlyFee, status: 'available', reservedBy: '' };
    db.numberOffers.push(offer);
    audit(db, 'number-offer.created', sessionFor(req).user, offer.id, { schoolCode, displayNumber });
    writeDb(db);
    return json(res, 201, { offer });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/number-offers/import') {
    const session = requireAdmin(req, res);
    if (!session) return;
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const schoolCode = safe(body.schoolCode, 40);
    if (!db.schools.some((item) => item.code === schoolCode)) return json(res, 400, { error: '学校不存在' });
    if (!body.fileBase64) return json(res, 400, { error: '请上传 Excel 文件' });
    let rows;
    try {
      const workbook = XLSX.read(Buffer.from(String(body.fileBase64).replace(/^data:.*?;base64,/, ''), 'base64'), { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } catch { return json(res, 400, { error: 'Excel 文件无法解析，请检查文件格式' }); }
    if (!rows.length) return json(res, 400, { error: 'Excel 中没有可导入的数据' });
    const aliases = (row, names) => names.map((name) => row[name]).find((value) => value !== undefined && String(value).trim() !== '') ?? '';
    const imported = [];
    for (const row of rows) {
      const operator = safe(aliases(row, ['运营商', 'operator', 'Operator']), 20);
      const displayNumber = maskPhoneNumber(safe(aliases(row, ['可选号码', '脱敏号码', 'displayNumber', 'number']), 20));
      const planName = safe(aliases(row, ['套餐名称', 'planName', 'plan']), 80);
      const monthlyFee = Number(aliases(row, ['月费', 'monthlyFee', 'fee']) || 0);
      if (!ALLOWED_OPERATORS.has(operator) || !/^1\d{2}\*{4}\d{4}$/.test(displayNumber) || !planName || !Number.isFinite(monthlyFee) || monthlyFee < 0 || monthlyFee > 9999) continue;
      if (db.numberOffers.some((item) => item.schoolCode === schoolCode && item.displayNumber === displayNumber)) continue;
      const offer = { id: id('NUM'), schoolCode, operator, displayNumber, planName, monthlyFee, status: 'available', reservedBy: '' };
      db.numberOffers.push(offer);
      imported.push(offer);
    }
    if (!imported.length) return json(res, 400, { error: '没有符合格式的数据。请使用：运营商、可选号码、套餐名称、月费' });
    audit(db, 'number-offer.imported', session.user, schoolCode, { count: imported.length });
    writeDb(db);
    return json(res, 201, { imported: imported.length, skipped: rows.length - imported.length });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/confirm-completion') {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const schoolCode = safe(body.schoolCode, 40);
    const phone = safe(body.phone, 20);
    const recordId = safe(body.recordId, 80);
    const record = [...db.orders, ...db.tickets].find((item) => item.id === recordId && item.schoolCode === schoolCode && item.phone === phone);
    if (!record) return json(res, 404, { error: '未找到对应服务记录' });
    if (record.status !== 'completed') return json(res, 400, { error: '该服务尚未完成，暂不能确认' });
    if (record.completionConfirmedAt) return json(res, 409, { error: '该服务已确认完成' });
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(res, 400, { error: '请选择 1 至 5 星评价' });
    record.completionConfirmedAt = new Date().toISOString();
    record.rating = rating;
    record.ratingComment = safe(body.ratingComment, 300);
    record.updatedAt = record.completionConfirmedAt;
    audit(db, 'student.completion-confirmed', 'student', record.id, { rating: record.rating });
    writeDb(db);
    return json(res, 200, { record: { id: record.id, completionConfirmedAt: record.completionConfirmedAt, rating: record.rating } });
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/schools') {
    if (!requireAdmin(req, res)) return;
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const code = safe(body.code, 40).toUpperCase();
    const name = safe(body.name, 60);
    const servicePhone = safe(body.servicePhone, 20);
    const verificationMode = 'none';
    if (!name) return json(res, 400, { error: '请输入学校名称' });
    if (!validCode(code)) return json(res, 400, { error: '学校代码需为 3 至 40 位字母、数字或短横线' });
    if (!servicePhone) return json(res, 400, { error: '请输入服务电话' });
    if (db.schools.some((school) => school.code === code)) return json(res, 409, { error: '该学校代码已存在' });
    const colleges = Array.isArray(body.colleges) ? body.colleges.map((item) => safe(item, 80)).filter(Boolean).slice(0, 200) : [];
    const school = { code, name, status: 'active', servicePhone, verificationMode, colleges, scans: 0, updatedAt: new Date().toISOString() };
    db.schools.push(school);
    audit(db, 'school.created', sessionFor(req).user, school.code, { name: school.name });
    writeDb(db);
    return json(res, 201, { school });
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/schools/')) {
    if (!requireAdmin(req, res)) return;
    const code = decodeURIComponent(url.pathname.split('/').pop());
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const school = db.schools.find((item) => item.code === code);
    if (!school) return json(res, 404, { error: '学校不存在' });
    if (body.status && !['active', 'disabled'].includes(body.status)) return json(res, 400, { error: '学校状态无效' });
    if (body.status) school.status = body.status;
    if (body.verificationMode && ['manual', 'api', 'none'].includes(body.verificationMode)) school.verificationMode = body.verificationMode;
    school.updatedAt = new Date().toISOString();
    audit(db, 'school.updated', sessionFor(req).user, school.code, { status: school.status, verificationMode: school.verificationMode });
    writeDb(db);
    return json(res, 200, { school });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/admin/qr/')) {
    if (!requireAdmin(req, res)) return;
    const code = decodeURIComponent(url.pathname.split('/').pop());
    const school = db.schools.find((item) => item.code === code);
    if (!school) return json(res, 404, { error: '学校不存在' });
    const png = await QRCode.toBuffer(`${url.origin}/q/${encodeURIComponent(code)}`, { width: 720, margin: 2, errorCorrectionLevel: 'M' });
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
      'Content-Disposition': `inline; filename="${code}-qr.png"`,
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(png);
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/export') {
    if (!requireAdmin(req, res)) return;
    const type = url.searchParams.get('type');
    const records = type === 'order' ? db.orders : type === 'ticket' ? db.tickets : [...db.orders, ...db.tickets];
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="campus-service-records.csv"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    return res.end(csv(records));
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/export.xlsx') {
    if (!requireAdmin(req, res)) return;
    const type = url.searchParams.get('type');
    const records = type === 'order' ? db.orders : type === 'ticket' ? db.tickets : [...db.orders, ...db.tickets];
    const rows = records.map((record) => ({ 服务编号: record.id, 学校: record.schoolName, 姓名: record.name, 学号: record.studentNo, 身份证号码: record.idCard, 学院: record.college, 联系电话: record.phone, 备用联系电话: record.backupPhone, 运营商: record.operator, 意向号码: record.selectedNumber, 服务事项: record.type, 状态: record.status, 创建时间: record.createdAt }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '信息收集');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="campus-service-records.xlsx"', 'Cache-Control': 'no-store' });
    return res.end(buffer);
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/records/')) {
    if (!requireAdmin(req, res)) return;
    const parts = url.pathname.split('/').filter(Boolean);
    const category = parts[3];
    const recordId = decodeURIComponent(parts[4] || '');
    const collection = category === 'order' ? db.orders : category === 'ticket' ? db.tickets : null;
    if (!collection) return json(res, 400, { error: '记录类型无效' });
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const record = collection.find((item) => item.id === recordId);
    if (!record) return json(res, 404, { error: '服务记录不存在' });
    const nextStatus = body.status === undefined ? record.status : body.status;
    const nextVerification = body.verificationStatus === undefined ? record.verificationStatus : body.verificationStatus;
    const nextDelivery = body.deliveryStatus === undefined ? record.deliveryStatus : body.deliveryStatus;
    const nextActivation = body.activationStatus === undefined ? record.activationStatus : body.activationStatus;
    const nextSubsidy = body.subsidyStatus === undefined ? record.subsidyStatus : body.subsidyStatus;
    const nextAssignee = body.assignee === undefined ? record.assignee : safe(body.assignee, 80);
    const nextScheduledAt = body.scheduledAt === undefined ? record.scheduledAt : safeIso(body.scheduledAt);
    const nextCarrier = body.deliveryCarrier === undefined ? record.deliveryCarrier : safe(body.deliveryCarrier, 40);
    const nextTrackingNo = body.deliveryTrackingNo === undefined ? record.deliveryTrackingNo : safe(body.deliveryTrackingNo, 80);
    const nextResult = body.serviceResult === undefined ? record.serviceResult : safe(body.serviceResult, 500);
    if (!allowedStatuses.has(nextStatus) || !statusTransitions[record.status]?.has(nextStatus)) return json(res, 400, { error: '服务状态不能这样跳转' });
    if (!allowedVerificationStatuses.has(nextVerification)) return json(res, 400, { error: '核验状态无效' });
    if (!allowedDeliveryStatuses.has(nextDelivery)) return json(res, 400, { error: '交付进度无效' });
    if (!allowedActivationStatuses.has(nextActivation)) return json(res, 400, { error: '实名激活状态无效' });
    if (!allowedSubsidyStatuses.has(nextSubsidy)) return json(res, 400, { error: '补贴状态无效' });
    if (nextStatus === 'assigned' && !nextAssignee) return json(res, 400, { error: '派单前请填写服务负责人' });
    if (nextStatus === 'scheduled' && !nextScheduledAt) return json(res, 400, { error: '预约服务前请填写预约时间' });
    if (nextDelivery === 'shipped' && (!nextCarrier || !nextTrackingNo)) return json(res, 400, { error: '交付快递前请填写承运商和运单号' });
    if (nextStatus === 'completed' && !nextResult) return json(res, 400, { error: '完成服务前请填写处理结果' });
    if (nextStatus === 'completed' && nextActivation !== 'not_applicable' && nextActivation !== 'activated') return json(res, 400, { error: '选号订单须实名激活后才能完成' });
    const amount = body.subsidyAmount === undefined ? record.subsidyAmount : Number(body.subsidyAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 9999) return json(res, 400, { error: '补贴金额无效' });
    if (nextSubsidy === 'paid' && amount <= 0) return json(res, 400, { error: '结算补贴前请填写补贴金额' });
    record.status = nextStatus;
    record.verificationStatus = nextVerification;
    record.deliveryStatus = nextDelivery;
    record.activationStatus = nextActivation;
    record.subsidyStatus = nextSubsidy;
    record.subsidyAmount = amount;
    record.assignee = nextAssignee;
    record.scheduledAt = nextScheduledAt;
    record.deliveryCarrier = nextCarrier;
    record.deliveryTrackingNo = nextTrackingNo;
    record.serviceResult = nextResult;
    if (nextStatus === 'cancelled' && record.selectedOfferId) {
      const offer = db.numberOffers.find((item) => item.id === record.selectedOfferId && item.reservedBy === record.id);
      if (offer) { offer.status = 'available'; offer.reservedBy = ''; }
    }
    if (record.status !== (record.statusHistory.at(-1)?.status || '')) record.statusHistory.push({ status: record.status, at: new Date().toISOString(), by: ADMIN_USER });
    if (body.internalNote !== undefined) record.internalNote = safe(body.internalNote, 500);
    record.updatedAt = new Date().toISOString();
    audit(db, 'record.updated', sessionFor(req).user, record.id, { status: record.status, verificationStatus: record.verificationStatus });
    writeDb(db);
    return json(res, 200, { record });
  }

  return json(res, 404, { error: '接口不存在' });
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function staticFile(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (pathname.startsWith('/q/')) pathname = '/dispatch.html';
  if (pathname.startsWith('/service/')) pathname = '/index.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/operator.html';
  if (pathname === '/admin/login') pathname = '/admin-login.html';
  const file = path.resolve(ROOT, `.${pathname}`);
  if (!file.startsWith(path.resolve(ROOT)) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return text(res, 404, 'Not found');
  res.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const handler = () => api(req, res, url);
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) await runMutation(handler);
      else await handler();
    }
    else staticFile(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, 500, { error: '服务器内部错误' });
  }
});

if (IS_PRODUCTION && ADMIN_PASSWORD === 'campus-admin-2026') {
  throw new Error('生产环境必须通过 ADMIN_PASSWORD 设置非默认运营商密码');
}

ensureDb();
async function start() {
  if (DB_DRIVER !== 'json') {
    sqlStorage = new Storage({ driver: DB_DRIVER, file: DB_FILE, initial: initialDb, normalize: normalizeDb });
    runtimeDb = await sqlStorage.init();
    if (syncSchoolsFromWorkbook(runtimeDb)) await sqlStorage.save(runtimeDb);
  }
  server.listen(PORT, () => console.log(`Campus service running at http://127.0.0.1:${PORT} using ${DB_DRIVER}`));
}
start().catch((error) => { console.error('数据库初始化失败:', error); process.exitCode = 1; });

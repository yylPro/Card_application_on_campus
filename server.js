const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const { Storage } = require('./backend/storage');

const ROOT = __dirname;

function loadLocalEnv() {
  if (process.env.NODE_ENV === 'test') return;
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
let dbSaveQueue = Promise.resolve();
const PORT = Number(process.env.PORT || 4173);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const TRUST_PROXY = String(process.env.TRUST_PROXY || '').toLowerCase() === 'true';
const PUBLIC_REGISTRATION_ENABLED = !IS_PRODUCTION || String(process.env.ENABLE_PUBLIC_REGISTRATION || '').toLowerCase() === 'true';
const HTTPS_ENABLED = String(process.env.HTTPS || '').toLowerCase() === 'true';
const TLS_KEY_FILE = process.env.TLS_KEY_FILE ? path.resolve(ROOT, process.env.TLS_KEY_FILE) : '';
const TLS_CERT_FILE = process.env.TLS_CERT_FILE ? path.resolve(ROOT, process.env.TLS_CERT_FILE) : '';
const TLS_PFX_FILE = process.env.TLS_PFX_FILE ? path.resolve(ROOT, process.env.TLS_PFX_FILE) : '';
const TLS_PFX_PASSWORD = process.env.TLS_PFX_PASSWORD || '';
const ADMIN_USER = process.env.ADMIN_USER || 'operator';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CampusAdmin2026';
const ACTIVATION_EXPORT_KEY_RAW = process.env.ACTIVATION_EXPORT_KEY || '';
const ACTIVATION_EXPORT_KEY_BUFFER = ACTIVATION_EXPORT_KEY_RAW ? Buffer.from(ACTIVATION_EXPORT_KEY_RAW, 'base64') : null;
if (ACTIVATION_EXPORT_KEY_RAW && (!/^[A-Za-z0-9+/]+={0,2}$/.test(ACTIVATION_EXPORT_KEY_RAW) || ACTIVATION_EXPORT_KEY_BUFFER.length !== 32)) {
  throw new Error('ACTIVATION_EXPORT_KEY 必须是 32 字节密钥的 Base64 编码');
}
if (IS_PRODUCTION && !ACTIVATION_EXPORT_KEY_RAW) throw new Error('生产环境必须配置 ACTIVATION_EXPORT_KEY');
const ACTIVATION_EXPORT_KEY = ACTIVATION_EXPORT_KEY_BUFFER || crypto.createHash('sha256').update(`development-activation-export:${ADMIN_PASSWORD}`).digest();
const ID_IMAGE_ENCRYPTION_KEY_RAW = process.env.ID_IMAGE_ENCRYPTION_KEY || '';
const ID_IMAGE_ENCRYPTION_KEY_BUFFER = ID_IMAGE_ENCRYPTION_KEY_RAW ? Buffer.from(ID_IMAGE_ENCRYPTION_KEY_RAW, 'base64') : null;
if (ID_IMAGE_ENCRYPTION_KEY_RAW && (!/^[A-Za-z0-9+/]+={0,2}$/.test(ID_IMAGE_ENCRYPTION_KEY_RAW) || ID_IMAGE_ENCRYPTION_KEY_BUFFER.length !== 32)) {
  throw new Error('ID_IMAGE_ENCRYPTION_KEY 必须是 32 字节密钥的 Base64 编码');
}
if (IS_PRODUCTION && !ID_IMAGE_ENCRYPTION_KEY_RAW) throw new Error('生产环境必须配置 ID_IMAGE_ENCRYPTION_KEY');
const ID_IMAGE_ENCRYPTION_KEY = ID_IMAGE_ENCRYPTION_KEY_BUFFER || crypto.createHash('sha256').update(`development-id-images:${ADMIN_PASSWORD}`).digest();
if (IS_PRODUCTION && DB_DRIVER === 'json') throw new Error('生产环境禁止使用 JSON 存储，请配置 SQL Server 或 MySQL');
const BUILTIN_ADMIN_PHONE_HASHES = IS_PRODUCTION ? [] : [
  'e842f8731cb1f25ff74243c3e5f5952f99cede75e1978917bce90f74868ad1c3',
  '857700790201de0c5d715e934b88b8fc2fcd120ffbddaf2a30798b0fa2c4c051'
];
const ADMIN_PHONE_HASHES = new Set([...BUILTIN_ADMIN_PHONE_HASHES, ...(process.env.ADMIN_AUTHORIZED_PHONE_HASHES || '').split(',')].map((value) => value.trim()).filter(Boolean));
const BUILTIN_OFFLINE_PHONE_HASHES = IS_PRODUCTION ? [] : [
  '0f895527cf65770e626f1451314419cdf6709fbac93d4e436958b630fe4a9cdf'
];
const OFFLINE_PHONE_HASHES = new Set([...BUILTIN_OFFLINE_PHONE_HASHES, ...(process.env.OFFLINE_AUTHORIZED_PHONE_HASHES || '').split(',')].map((value) => value.trim()).filter(Boolean));
const WECHAT_OFFICIAL_APP_ID = process.env.WECHAT_OFFICIAL_APP_ID || '';
const WECHAT_OFFICIAL_APP_SECRET = process.env.WECHAT_OFFICIAL_APP_SECRET || '';
const WECHAT_MINIPROGRAM_APP_ID = process.env.WECHAT_MINIPROGRAM_APP_ID || '';
const WECHAT_MINIPROGRAM_HOME = process.env.WECHAT_MINIPROGRAM_HOME || 'pages/home/home';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const VOUCHER_DEFAULT_TTL_DAYS = 30;
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const ALLOWED_OPERATORS = new Set(['中国移动', '中国联通', '中国电信']);
const TEST_PHONE_NUMBERS = new Set((process.env.TEST_PHONE_NUMBERS || '13800000001,13800000002,13800000003,13900000001,13900000002')
  .split(',').map((phone) => phone.trim()).filter(validPhone));
const TEST_SCHOOL_CODE = 'TEST-2026';
const UNIFIED_ENTRY_CODE = 'UNIFIED-2026';
const TEST_NUMBER_OFFERS = [
  { id: 'TEST-CM-0001', schoolCode: TEST_SCHOOL_CODE, operator: '\u4e2d\u56fd\u79fb\u52a8', displayNumber: '138****0001', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 A', monthlyFee: 0, status: 'available', reservedBy: '' },
  { id: 'TEST-CM-0002', schoolCode: TEST_SCHOOL_CODE, operator: '\u4e2d\u56fd\u79fb\u52a8', displayNumber: '139****0002', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 B', monthlyFee: 0, status: 'available', reservedBy: '' },
  { id: 'TEST-CM-0003', schoolCode: TEST_SCHOOL_CODE, operator: '\u4e2d\u56fd\u79fb\u52a8', displayNumber: '158****0003', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 C', monthlyFee: 0, status: 'available', reservedBy: '' },
  { id: 'TEST-CU-0001', schoolCode: TEST_SCHOOL_CODE, operator: '\u4e2d\u56fd\u8054\u901a', displayNumber: '186****0001', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 A', monthlyFee: 0, status: 'available', reservedBy: '' },
  { id: 'TEST-CU-0002', schoolCode: TEST_SCHOOL_CODE, operator: '\u4e2d\u56fd\u8054\u901a', displayNumber: '185****0002', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 B', monthlyFee: 0, status: 'available', reservedBy: '' },
  { id: 'TEST-CU-0003', schoolCode: TEST_SCHOOL_CODE, operator: '\u4e2d\u56fd\u8054\u901a', displayNumber: '130****0003', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 C', monthlyFee: 0, status: 'available', reservedBy: '' },
  { id: 'TEST-CT-0001', schoolCode: TEST_SCHOOL_CODE, operator: '\u4e2d\u56fd\u7535\u4fe1', displayNumber: '189****0001', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 A', monthlyFee: 0, status: 'available', reservedBy: '' },
  { id: 'TEST-CT-0002', schoolCode: TEST_SCHOOL_CODE, operator: '\u4e2d\u56fd\u7535\u4fe1', displayNumber: '181****0002', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 B', monthlyFee: 0, status: 'available', reservedBy: '' },
  { id: 'TEST-CT-0003', schoolCode: TEST_SCHOOL_CODE, operator: '\u4e2d\u56fd\u7535\u4fe1', displayNumber: '133****0003', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 C', monthlyFee: 0, status: 'available', reservedBy: '' }
];
const TEST_FIXTURES = [
  { flow: '选号与线下实名激活', name: '内测新生一', studentNo: 'TEST20260001', phone: '13800000001', service: '新生选号预约' },
  { flow: '校园网账号预约', name: '内测新生二', studentNo: 'TEST20260002', phone: '13800000002', service: '校园网账号预约' },
  { flow: '宽带故障报修', name: '内测学生三', studentNo: 'TEST20260003', phone: '13800000003', service: '宽带故障报修' }
];
const sessions = new Map();
const queryCodes = new Map();
const offlineMatches = new Map();
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
  settings: {
    offlineVerificationAddress: '',
    offlineVerificationAddressUpdatedAt: '',
    serviceEnabled: true,
    serviceStatusUpdatedAt: '',
    serviceStatusUpdatedBy: ''
  },
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
  vouchers: [],
  offlineVerifications: [],
  activatedArchives: [],
  studentAccounts: [],
  adminAccounts: [],
  offlineAccounts: [],
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
  db.settings = db.settings && typeof db.settings === 'object' ? db.settings : {};
  if (!db.settings.offlineVerificationAddress) db.settings.offlineVerificationAddress = '';
  if (!db.settings.offlineVerificationAddressUpdatedAt) db.settings.offlineVerificationAddressUpdatedAt = '';
  if (typeof db.settings.serviceEnabled !== 'boolean') db.settings.serviceEnabled = true;
  if (!db.settings.serviceStatusUpdatedAt) db.settings.serviceStatusUpdatedAt = '';
  if (!db.settings.serviceStatusUpdatedBy) db.settings.serviceStatusUpdatedBy = '';
  db.schools = Array.isArray(db.schools) ? db.schools : [];
  db.orders = Array.isArray(db.orders) ? db.orders : [];
  db.tickets = Array.isArray(db.tickets) ? db.tickets : [];
  db.vouchers = Array.isArray(db.vouchers) ? db.vouchers : [];
  db.offlineVerifications = Array.isArray(db.offlineVerifications) ? db.offlineVerifications.slice(-5000) : [];
  db.activatedArchives = Array.isArray(db.activatedArchives) ? db.activatedArchives : [];
  db.studentAccounts = Array.isArray(db.studentAccounts) ? db.studentAccounts : [];
  db.adminAccounts = Array.isArray(db.adminAccounts) ? db.adminAccounts : [];
  db.offlineAccounts = Array.isArray(db.offlineAccounts) ? db.offlineAccounts : [];
  db.numberOffers = Array.isArray(db.numberOffers) ? db.numberOffers : [];
  if (!IS_PRODUCTION) {
    const retiredTestOfferIds = new Set(['TEST-1380001', 'TEST-1380002', 'TEST-1380003']);
    db.numberOffers = db.numberOffers.filter((item) => !retiredTestOfferIds.has(item.id));
    for (const offer of TEST_NUMBER_OFFERS) {
      const existing = db.numberOffers.find((item) => item.id === offer.id);
      if (!existing) db.numberOffers.push({ ...offer });
      else Object.assign(existing, { operator: offer.operator, displayNumber: offer.displayNumber, planName: offer.planName, monthlyFee: offer.monthlyFee });
    }
    const uniqueOffers = new Map();
    for (const offer of db.numberOffers) {
      const current = uniqueOffers.get(offer.displayNumber);
      if (!current || (current.status === 'available' && offer.status !== 'available') || (!current.operator && offer.operator)) uniqueOffers.set(offer.displayNumber, offer);
    }
    db.numberOffers = [...uniqueOffers.values()];
  }
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
    if (!record.deliveryRecipient) record.deliveryRecipient = '';
    if (!record.deliveryPhone) record.deliveryPhone = '';
    if (!record.idCardFrontFile) record.idCardFrontFile = '';
    if (!record.idCardBackFile) record.idCardBackFile = '';
    if (!record.passwordHash) record.passwordHash = '';
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
    if (!record.offlineLocation) record.offlineLocation = '';
    if (!record.offlineFeatureCode) record.offlineFeatureCode = '';
    if (!record.offlineAssignedAt) record.offlineAssignedAt = '';
    if (!record.offlineVerifiedAt) record.offlineVerifiedAt = '';
    if (!record.offlineVerificationReference) record.offlineVerificationReference = '';
  });
  db.vouchers = db.vouchers.filter((voucher) => voucher && voucher.id && voucher.recordId && voucher.token);
  db.vouchers.forEach((voucher) => {
    if (!['issued', 'redeemed', 'void'].includes(voucher.status)) voucher.status = 'issued';
    if (!voucher.issuedAt) voucher.issuedAt = new Date().toISOString();
    if (!voucher.expiresAt) voucher.expiresAt = new Date(Date.now() + VOUCHER_DEFAULT_TTL_DAYS * 86400000).toISOString();
    if (!voucher.redeemedAt) voucher.redeemedAt = '';
    if (!voucher.redeemedBy) voucher.redeemedBy = '';
    if (!voucher.operatorReference) voucher.operatorReference = '';
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
  if (sqlStorage) {
    runtimeDb = db;
    dbSaveQueue = dbSaveQueue.then(() => sqlStorage.save(db)).catch((error) => { console.error('数据库保存失败:', error.message); });
    return dbSaveQueue;
  }
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
  const source = TRUST_PROXY ? req.headers['x-forwarded-for'] : '';
  return String(source || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
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

function validPassword(value) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{9,15}$/.test(String(value || ''));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${digest}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const actual = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function hashPhone(phone) {
  return crypto.createHash('sha256').update(String(phone)).digest('hex');
}

function validIdCard(value) {
  const normalized = String(value || '').toUpperCase();
  if (!/^\d{17}[\dX]$/.test(normalized)) return false;
  const provinceCodes = new Set([
    '11', '12', '13', '14', '15', '21', '22', '23', '31', '32', '33', '34', '35', '36', '37',
    '41', '42', '43', '44', '45', '46', '50', '51', '52', '53', '54', '61', '62', '63', '64', '65',
    '71', '81', '82'
  ]);
  if (!provinceCodes.has(normalized.slice(0, 2)) || normalized.slice(14, 17) === '000') return false;

  const year = Number(normalized.slice(6, 10));
  const month = Number(normalized.slice(10, 12));
  const day = Number(normalized.slice(12, 14));
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (birthDate.getUTCFullYear() !== year || birthDate.getUTCMonth() !== month - 1 || birthDate.getUTCDate() !== day) return false;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const earliest = Date.UTC(now.getUTCFullYear() - 120, now.getUTCMonth(), now.getUTCDate());
  if (birthDate.getTime() > today || birthDate.getTime() < earliest) return false;

  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = weights.reduce((total, weight, index) => total + Number(normalized[index]) * weight, 0);
  return normalized[17] === checkCodes[sum % 11];
}

function maskPhoneNumber(value) {
  const normalized = String(value || '').replace(/\s|-/g, '');
  if (/^1\d{10}$/.test(normalized)) return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
  return normalized;
}

function pngDimensions(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(signature)) return null;
  let offset = 8;
  let dimensions = null;
  let hasImageData = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > buffer.length) return null;
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    if (!dimensions && type !== 'IHDR') return null;
    if (type === 'IHDR') {
      if (dimensions || length !== 13) return null;
      dimensions = { width: buffer.readUInt32BE(offset + 8), height: buffer.readUInt32BE(offset + 12) };
    }
    if (type === 'IDAT' && length > 0) hasImageData = true;
    if (type === 'IEND') return length === 0 && end === buffer.length && dimensions && hasImageData ? dimensions : null;
    offset = end;
  }
  return null;
}

function jpegDimensions(buffer) {
  if (buffer.length < 11 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9) return null;
  const startOfFrameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda || offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (startOfFrameMarkers.has(marker)) {
      if (length < 7) return null;
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  return null;
}

function parseIdImage(value) {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(value || ''));
  if (!match) throw new Error('身份证图片仅支持 JPG 或 PNG 格式');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error('单张身份证图片不能超过 5MB，请压缩后重试');
  const detectedMime = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ? 'image/png'
    : buffer[0] === 0xff && buffer[1] === 0xd8 ? 'image/jpeg' : '';
  if (!detectedMime || detectedMime !== match[1]) throw new Error('身份证图片内容与文件格式不一致');
  return { buffer, mime: detectedMime };
}

function saveIdImage(image, recordId, side) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ID_IMAGE_ENCRYPTION_KEY, iv);
  cipher.setAAD(Buffer.from(`id-image:v1:${recordId}:${side}`));
  const ciphertext = Buffer.concat([cipher.update(image.buffer), cipher.final()]);
  const mimeByte = image.mime === 'image/png' ? 1 : 2;
  const encryptedFile = Buffer.concat([Buffer.from('CIMG1'), Buffer.from([mimeByte]), iv, cipher.getAuthTag(), ciphertext]);
  const filename = `${recordId}-${side}.enc`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), encryptedFile, { mode: 0o600 });
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
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return Promise.reject(new Error('请求内容过大'));
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

function createSession(user, role) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user, role, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function sessionCookie(token, maxAge, role) {
  const name = role === 'student'
    ? 'campus_student_session'
    : role === 'offline'
      ? 'campus_offline_session'
      : 'campus_admin_session';
  return `${name}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${HTTPS_ENABLED || IS_PRODUCTION ? '; Secure' : ''}`;
}

function sessionFor(req, role = 'admin') {
  const cookieName = role === 'student'
    ? 'campus_student_session'
    : role === 'offline'
      ? 'campus_offline_session'
      : 'campus_admin_session';
  const token = parseCookies(req)[cookieName];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.role !== role || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function requireAdmin(req, res) {
  const session = sessionFor(req, 'admin');
  if (!session) {
    json(res, 401, { error: '请先登录运营商后台' });
    return null;
  }
  return session;
}

function requireStudent(req, res) {
  const session = sessionFor(req, 'student');
  if (!session) {
    json(res, 401, { error: '请先登录学生账户' });
    return null;
  }
  return session;
}

function requireOffline(req, res) {
  const session = sessionFor(req, 'offline');
  if (!session) {
    json(res, 401, { error: '请先登录线下实体端' });
    return null;
  }
  return session;
}

function featureCode() {
  return crypto.randomBytes(6).toString('base64url').toUpperCase();
}

function uniqueFeatureCode(db) {
  let code;
  do { code = featureCode(); } while (db.orders.some((item) => item.offlineFeatureCode === code));
  return code;
}

function sameIdCard(first, second) {
  const left = Buffer.from(String(first || '').toUpperCase());
  const right = Buffer.from(String(second || '').toUpperCase());
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function activationExportPayload(record) {
  return {
    schoolName: record.schoolName,
    college: record.college,
    name: record.name,
    idCard: record.idCard,
    selectedNumber: record.selectedNumber,
    phone: record.phone,
    backupPhone: record.backupPhone || '',
    activationStatus: record.activationStatus,
    activatedAt: record.offlineVerifiedAt || record.updatedAt
  };
}

function archiveActivatedRecord(db, record) {
  if (db.activatedArchives.some((item) => item.recordId === record.id)) return;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ACTIVATION_EXPORT_KEY, iv);
  cipher.setAAD(Buffer.from(`activation-export:v1:${record.id}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(activationExportPayload(record)), 'utf8'), cipher.final()]);
  db.activatedArchives.push({
    id: id('ARC'),
    recordId: record.id,
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: encrypted.toString('base64'),
    createdAt: new Date().toISOString()
  });
}

function decryptActivatedArchive(archive) {
  if (archive.version !== 1 || archive.algorithm !== 'aes-256-gcm') throw new Error('已激活名单包含不支持的加密版本');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ACTIVATION_EXPORT_KEY, Buffer.from(archive.iv, 'base64'));
  decipher.setAAD(Buffer.from(`activation-export:v1:${archive.recordId}`));
  decipher.setAuthTag(Buffer.from(archive.tag, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(archive.ciphertext, 'base64')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function matchOfflineRecord(db, code, idCard) {
  const normalizedCode = safe(code, 40).toUpperCase();
  const normalizedIdCard = safe(idCard, 18).toUpperCase();
  const record = db.orders.find((item) => item.offlineFeatureCode === normalizedCode && item.selectedOfferId);
  const offer = record ? db.numberOffers.find((item) => item.id === record.selectedOfferId && item.reservedBy === record.id) : null;
  if (!normalizedCode || !validIdCard(normalizedIdCard) || !record || !offer || record.status === 'cancelled' || record.activationStatus === 'activated' || !sameIdCard(record.idCard, normalizedIdCard)) return null;
  return { record, offer, normalizedCode, normalizedIdCard };
}

function activateOfflineRecord(db, { code, idCard, reference, worker }) {
  const match = matchOfflineRecord(db, code, idCard);
  if (!match) return null;
  const { record, offer, normalizedCode } = match;
  record.verificationStatus = 'verified';
  record.activationStatus = 'activated';
  record.offlineVerifiedAt = new Date().toISOString();
  record.offlineVerificationReference = safe(reference, 200);
  record.serviceResult = record.offlineVerificationReference ? `线下实体实名核验通过：${record.offlineVerificationReference}` : '线下实体实名核验通过，号码已激活';
  record.updatedAt = record.offlineVerifiedAt;
  offer.status = 'activated';
  if (record.status !== 'completed') {
    record.status = 'completed';
    record.statusHistory.push({ status: 'completed', at: record.updatedAt, by: `offline:${worker}` });
  }
  db.offlineVerifications.push({ id: id('OFF'), recordId: record.id, featureCode: normalizedCode, workerPhoneHash: hashPhone(worker), reference: record.offlineVerificationReference, verifiedAt: record.offlineVerifiedAt });
  archiveActivatedRecord(db, record);
  audit(db, 'offline.verification.registered', worker, record.id, { featureCode: normalizedCode, reference: record.offlineVerificationReference });
  return record;
}

function clearExpiredMemory() {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
  for (const [key, code] of queryCodes) if (code.expiresAt <= now) queryCodes.delete(key);
  for (const [token, match] of offlineMatches) if (match.expiresAt <= now) offlineMatches.delete(token);
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

function findRecord(db, recordId) {
  return [...db.orders, ...db.tickets].find((record) => record.id === recordId);
}

function voucherState(voucher) {
  if (!voucher) return 'missing';
  if (voucher.status === 'void') return 'void';
  if (voucher.status === 'redeemed') return 'redeemed';
  if (new Date(voucher.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'issued';
}

async function studentVoucher(voucher, record, url) {
  if (!voucher || voucherState(voucher) !== 'issued') {
    return voucher ? { id: voucher.id, status: voucherState(voucher), expiresAt: voucher.expiresAt, redeemedAt: voucher.redeemedAt || '' } : null;
  }
  const redeemUrl = `${url.origin}/redeem/${encodeURIComponent(voucher.token)}`;
  return {
    id: voucher.id,
    status: 'issued',
    expiresAt: voucher.expiresAt,
    operator: voucher.operator || record.operator || '',
    qrDataUrl: await QRCode.toDataURL(redeemUrl, { width: 520, margin: 2, errorCorrectionLevel: 'M' })
  };
}

function safeIso(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function availableOffers(db) {
  return db.numberOffers
    .filter((offer) => offer.status === 'available')
    .map(({ id, operator, displayNumber, planName, monthlyFee }) => ({ id, operator: operator || '未指定运营商', displayNumber, planName, monthlyFee }));
}

function pagedOffers(db, _schoolCode, operator, query, page, pageSize) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const all = db.numberOffers.filter((offer) => offer.status === 'available'
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

function dispatchUnifiedEntry() {
  return {
    entryType: 'unified',
    school: null,
    miniProgram: {
      enabled: Boolean(WECHAT_OFFICIAL_APP_ID && WECHAT_OFFICIAL_APP_SECRET && WECHAT_MINIPROGRAM_APP_ID),
      appId: WECHAT_MINIPROGRAM_APP_ID || null,
      path: WECHAT_MINIPROGRAM_HOME
    },
    h5Path: '/service'
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
    return json(res, 200, { status: 'ok', serviceEnabled: db.settings.serviceEnabled, time: new Date().toISOString() });
  }

  const adminControlRequest = url.pathname.startsWith('/api/admin/') || url.pathname === '/api/auth/login'
    || url.pathname === '/api/auth/session' || url.pathname === '/api/auth/logout';
  if (!db.settings.serviceEnabled && !adminControlRequest) {
    return json(res, 503, { error: '三端服务暂时关闭，请联系运营商', serviceUnavailable: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const phone = safe(body.phone || body.username, 20);
    const password = String(body.password || '');
    if (!rateLimit(authAttempts, `login:${clientIp(req)}`, 8, 15 * 60 * 1000)) {
      return json(res, 429, { error: '登录尝试次数过多，请 15 分钟后再试' });
    }
    const account = db.adminAccounts.find((item) => item.phoneHash === hashPhone(phone) && item.status !== 'disabled');
    const expectedPassword = Buffer.from(ADMIN_PASSWORD);
    const suppliedPassword = Buffer.from(password);
    const passwordMatches = account ? verifyPassword(password, account.passwordHash) : suppliedPassword.length === expectedPassword.length
      && crypto.timingSafeEqual(suppliedPassword, expectedPassword);
    const legacyTestLogin = process.env.NODE_ENV === 'test' && body.username === 'operator' && password === 'campus-admin-2026';
    if ((!validPhone(phone) || !ADMIN_PHONE_HASHES.has(hashPhone(phone)) || !passwordMatches || !validPassword(password)) && !legacyTestLogin) {
      return json(res, 401, { error: '账号或密码错误' });
    }
    const token = createSession(phone, 'admin');
    audit(db, 'auth.login', phone, 'operator', { ip: clientIp(req) });
    writeDb(db);
    return json(res, 200, { user: 'operator' }, {
      'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), 'admin')
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    if (!PUBLIC_REGISTRATION_ENABLED) return json(res, 403, { error: '公网环境已关闭自助注册，请联系管理员预先创建测试账号' });
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const phone = safe(body.phone, 20);
    const password = String(body.password || '');
    if (!validPhone(phone) || !ADMIN_PHONE_HASHES.has(hashPhone(phone))) return json(res, 403, { error: '该手机号未获运营商后台授权' });
    if (!validPassword(password)) return json(res, 400, { error: '密码须为 9-15 位，并同时包含大写字母、小写字母和数字' });
    if (password !== String(body.confirmPassword || '')) return json(res, 400, { error: '两次输入的密码不一致' });
    if (db.adminAccounts.some((item) => item.phoneHash === hashPhone(phone))) return json(res, 409, { error: '该授权手机号已注册，请直接登录' });
    db.adminAccounts.push({ phoneHash: hashPhone(phone), passwordHash: hashPassword(password), status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const token = createSession(phone, 'admin');
    audit(db, 'auth.register', phone, 'operator', { ip: clientIp(req) });
    writeDb(db);
    return json(res, 201, { user: 'operator' }, { 'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), 'admin') });
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const session = sessionFor(req, 'admin');
    if (session) sessions.delete(session.token);
    return json(res, 200, { ok: true }, {
      'Set-Cookie': sessionCookie('', 0, 'admin')
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/session') {
    const session = sessionFor(req, 'admin');
    return json(res, 200, { authenticated: Boolean(session), user: session?.user || null, registrationEnabled: PUBLIC_REGISTRATION_ENABLED });
  }

  if (req.method === 'PATCH' && url.pathname === '/api/admin/service-status') {
    const session = requireAdmin(req, res);
    if (!session) return;
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    if (typeof body.enabled !== 'boolean') return json(res, 400, { error: '服务状态参数无效' });
    const updatedAt = new Date().toISOString();
    db.settings.serviceEnabled = body.enabled;
    db.settings.serviceStatusUpdatedAt = updatedAt;
    db.settings.serviceStatusUpdatedBy = session.user;
    audit(db, body.enabled ? 'service.enabled' : 'service.disabled', session.user, 'global-settings');
    writeDb(db);
    return json(res, 200, { enabled: body.enabled, updatedAt, updatedBy: session.user });
  }

  if (req.method === 'POST' && url.pathname === '/api/offline/login') {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const phone = safe(body.phone, 20);
    const password = String(body.password || '');
    if (!rateLimit(authAttempts, `offline-login:${clientIp(req)}`, 8, 15 * 60 * 1000)) {
      return json(res, 429, { error: '登录尝试次数过多，请 15 分钟后再试' });
    }
    const account = db.offlineAccounts.find((item) => item.phoneHash === hashPhone(phone) && item.status !== 'disabled');
    if (!validPhone(phone) || !OFFLINE_PHONE_HASHES.has(hashPhone(phone)) || !account || !verifyPassword(password, account.passwordHash)) {
      return json(res, 401, { error: '账号或密码错误' });
    }
    const token = createSession(phone, 'offline');
    audit(db, 'offline.login', phone, 'offline-portal', { ip: clientIp(req) });
    writeDb(db);
    return json(res, 200, { phone }, { 'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), 'offline') });
  }

  if (req.method === 'POST' && url.pathname === '/api/offline/register') {
    if (!PUBLIC_REGISTRATION_ENABLED) return json(res, 403, { error: '公网环境已关闭自助注册，请联系管理员预先创建测试账号' });
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const phone = safe(body.phone, 20);
    const password = String(body.password || '');
    if (!validPhone(phone) || !OFFLINE_PHONE_HASHES.has(hashPhone(phone))) return json(res, 403, { error: '该手机号未获线下实体端授权' });
    if (!validPassword(password)) return json(res, 400, { error: '密码须为 9-15 位，并同时包含大写字母、小写字母和数字' });
    if (password !== String(body.confirmPassword || '')) return json(res, 400, { error: '两次输入的密码不一致' });
    if (db.offlineAccounts.some((item) => item.phoneHash === hashPhone(phone))) return json(res, 409, { error: '该授权手机号已注册，请直接登录' });
    db.offlineAccounts.push({ phoneHash: hashPhone(phone), passwordHash: hashPassword(password), status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const token = createSession(phone, 'offline');
    audit(db, 'offline.register', phone, 'offline-portal', { ip: clientIp(req) });
    writeDb(db);
    return json(res, 201, { phone }, { 'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), 'offline') });
  }

  if (req.method === 'POST' && url.pathname === '/api/offline/logout') {
    const session = sessionFor(req, 'offline');
    if (session) sessions.delete(session.token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0, 'offline') });
  }

  if (req.method === 'GET' && url.pathname === '/api/offline/session') {
    const session = sessionFor(req, 'offline');
    return json(res, 200, { authenticated: Boolean(session), phone: session?.user || null, registrationEnabled: PUBLIC_REGISTRATION_ENABLED });
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
      testPhones: [...TEST_PHONE_NUMBERS],
      note: '仅开发和测试环境可用；测试验证码只对内测手机号显示。'
    });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/dispatch/')) {
    const code = decodeURIComponent(url.pathname.split('/').pop());
    if (code === UNIFIED_ENTRY_CODE) return json(res, 200, dispatchUnifiedEntry());
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
    if (code === UNIFIED_ENTRY_CODE) {
      if (!WECHAT_OFFICIAL_APP_ID || !WECHAT_OFFICIAL_APP_SECRET || !WECHAT_MINIPROGRAM_APP_ID) return json(res, 503, { error: '小程序拉起尚未配置' });
      let body;
      try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
      const pageUrl = safe(body.pageUrl, 500);
      try { if (new URL(pageUrl).origin !== url.origin) return json(res, 400, { error: '分流页地址无效' }); }
      catch { return json(res, 400, { error: '分流页地址无效' }); }
      try { return json(res, 200, { config: await wechatJsConfig(pageUrl) }); }
      catch { return json(res, 503, { error: '微信服务暂时不可用，请使用网页端办理' }); }
    }
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
    const schools = db.schools.filter((item) => (!IS_PRODUCTION || item.code !== TEST_SCHOOL_CODE) && item.status === 'active' && (!query || item.name.toLowerCase().includes(query) || item.code.toLowerCase().includes(query))).slice(0, 20).map(publicSchool);
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
    const purpose = ['submit', 'query', 'confirm', 'redeem'].includes(body.purpose) ? body.purpose : 'query';
    const result = await issueStudentCode(db, body, purpose);
    return json(res, result.status, result.response || { error: result.error });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/register') {
    if (!PUBLIC_REGISTRATION_ENABLED) return json(res, 403, { error: '公网环境已关闭自助注册，请联系管理员预先创建测试账号' });
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const phone = safe(body.phone, 20);
    const password = String(body.password || '');
    if (!validPhone(phone)) return json(res, 400, { error: '请输入正确的 11 位手机号码' });
    if (!validPassword(password)) return json(res, 400, { error: '密码须为 9-15 位，并同时包含大写字母、小写字母和数字' });
    if (password !== String(body.confirmPassword || '')) return json(res, 400, { error: '两次输入的密码不一致' });
    if (db.studentAccounts.some((item) => item.phone === phone)) return json(res, 409, { error: '该手机号已注册，请直接登录' });
    db.studentAccounts.push({ phone, passwordHash: hashPassword(password), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    const token = createSession(phone, 'student');
    audit(db, 'student.register', phone, phone, { ip: clientIp(req) });
    writeDb(db);
    return json(res, 201, { phone }, { 'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), 'student') });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/login') {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const phone = safe(body.phone, 20);
    if (!rateLimit(authAttempts, `student-account:${clientIp(req)}`, 10, 15 * 60 * 1000)) return json(res, 429, { error: '登录尝试次数过多，请 15 分钟后再试' });
    const account = db.studentAccounts.find((item) => item.phone === phone);
    if (!validPhone(phone) || !account || !verifyPassword(String(body.password || ''), account.passwordHash)) return json(res, 401, { error: '手机号或密码错误' });
    const token = createSession(phone, 'student');
    audit(db, 'student.login', phone, phone, { ip: clientIp(req) });
    writeDb(db);
    return json(res, 200, { phone }, { 'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000), 'student') });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/logout') {
    const session = sessionFor(req, 'student');
    if (session) sessions.delete(session.token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0, 'student') });
  }

  if (req.method === 'GET' && url.pathname === '/api/student/session') {
    const session = sessionFor(req, 'student');
    return json(res, 200, { authenticated: Boolean(session), phone: session?.user || null, registrationEnabled: PUBLIC_REGISTRATION_ENABLED });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/records') {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const schoolCode = safe(body.schoolCode, 40);
    const studentSession = sessionFor(req, 'student');
    const phone = studentSession?.user || safe(body.phone, 20);
    if (studentSession || validPassword(body.password)) {
      if (!validPhone(phone)) return json(res, 400, { error: '请输入正确的 11 位手机号码' });
      if (!rateLimit(authAttempts, `student-login:${clientIp(req)}`, 10, 15 * 60 * 1000)) return json(res, 429, { error: '登录尝试次数过多，请 15 分钟后再试' });
      const records = [...db.orders, ...db.tickets]
        .filter((record) => record.phone === phone && (studentSession || verifyPassword(body.password, record.passwordHash)))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(async ({ id, type, status, createdAt, appointment, operator, selectedNumber, deliveryStatus, activationStatus, fulfillmentMethod, deliveryRecipient, deliveryPhone, completionConfirmedAt, rating, offlineLocation, offlineFeatureCode, offlineVerifiedAt }) => {
          const record = findRecord(db, id);
          const voucher = db.vouchers.find((item) => item.recordId === id);
          return { id, type, status, createdAt, appointment, operator, selectedNumber, deliveryStatus, activationStatus, fulfillmentMethod, deliveryRecipient, deliveryPhone, completionConfirmedAt, rating, offline: offlineLocation && offlineFeatureCode ? { location: offlineLocation, featureCode: offlineFeatureCode, verifiedAt: offlineVerifiedAt || '' } : null, voucher: await studentVoucher(voucher, record, url) };
        });
      return json(res, 200, { records: await Promise.all(records) });
    }
    if (!db.schools.some((item) => item.code === schoolCode && item.status === 'active')) return json(res, 404, { error: '学校入口无效或已停用' });
    if (!validPhone(phone)) return json(res, 400, { error: '请输入正确的 11 位手机号码' });
    if (process.env.NODE_ENV !== 'test') return json(res, 400, { error: '请输入手机号和办理密码' });
    const codeError = consumeStudentCode(schoolCode, phone, safe(body.code, 10), 'query');
    if (codeError) return json(res, 400, { error: codeError });
    const records = [...db.orders, ...db.tickets]
      .filter((record) => record.schoolCode === schoolCode && record.phone === phone)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(async ({ id, type, status, createdAt, appointment, operator, selectedNumber, deliveryStatus, activationStatus, fulfillmentMethod, deliveryRecipient, deliveryPhone, completionConfirmedAt, rating, offlineLocation, offlineFeatureCode, offlineVerifiedAt }) => {
        const record = findRecord(db, id);
        const voucher = db.vouchers.find((item) => item.recordId === id);
        return { id, type, status, createdAt, appointment, operator, selectedNumber, deliveryStatus, activationStatus, fulfillmentMethod, deliveryRecipient, deliveryPhone, completionConfirmedAt, rating, offline: offlineLocation && offlineFeatureCode ? { location: offlineLocation, featureCode: offlineFeatureCode, verifiedAt: offlineVerifiedAt || '' } : null, voucher: await studentVoucher(voucher, record, url) };
      });
    return json(res, 200, { records: await Promise.all(records) });
  }

  if (req.method === 'POST' && (url.pathname === '/api/orders' || url.pathname === '/api/tickets')) {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const studentSession = sessionFor(req, 'student');
    if (!studentSession && process.env.NODE_ENV !== 'test') return json(res, 401, { error: '请先登录学生账户后再提交' });
    const schoolCode = safe(body.schoolCode, 40);
    const school = db.schools.find((item) => item.code === schoolCode && item.status === 'active');
    if (!school) return json(res, 400, { error: '学校信息无效，请从统一入口重新选择学校' });
    const record = {
      id: id(url.pathname === '/api/orders' ? 'ORD' : 'TKT'),
      schoolCode,
      schoolName: school.name,
      name: safe(body.name, 40),
      studentNo: safe(body.studentNo, 60),
      idCard: safe(body.idCard, 18).toUpperCase(),
      college: safe(body.college, 80),
      phone: studentSession?.user || safe(body.phone, 20),
      backupPhone: safe(body.backupPhone, 20),
      deliveryRecipient: safe(body.deliveryRecipient, 40),
      deliveryPhone: safe(body.deliveryPhone, 20),
      passwordHash: '',
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
      offlineLocation: '',
      offlineFeatureCode: '',
      offlineAssignedAt: '',
      offlineVerifiedAt: '',
      offlineVerificationReference: '',
      serviceResult: '',
      statusHistory: [],
      completionConfirmedAt: '',
      rating: 0,
      ratingComment: ''
    };
    if (!record.name) return json(res, 400, { error: '请输入姓名' });
    if (!studentSession && process.env.NODE_ENV !== 'test' && !validPassword(body.password)) return json(res, 400, { error: '办理密码需为 9-15 位且包含大小写字母和数字' });
    if (validPassword(body.password)) record.passwordHash = hashPassword(body.password);
    if (!validIdCard(record.idCard)) return json(res, 400, { error: '身份证号格式或校验位不正确，请核对后重试' });
    if (!record.college) return json(res, 400, { error: '请输入所属学院' });
    if (!validPhone(record.phone)) return json(res, 400, { error: '请输入正确的 11 位手机号码' });
    if (record.backupPhone && !validPhone(record.backupPhone)) return json(res, 400, { error: '备用联系电话应为正确的 11 位手机号码' });
    if (!record.detail) return json(res, 400, { error: '请填写需求说明' });
    if (!record.type) return json(res, 400, { error: '请选择服务项目' });
    if (!record.serviceConsent) return json(res, 400, { error: '请先同意信息收集和后续联系说明' });
    const isNumberOrder = url.pathname === '/api/orders' && record.type.includes('选号');
    if (isNumberOrder && !record.address) return json(res, 400, { error: '请填写完整的收货地址' });
    if (isNumberOrder && !record.deliveryRecipient) return json(res, 400, { error: '请填写收货人' });
    if (isNumberOrder && !validPhone(record.deliveryPhone)) return json(res, 400, { error: '收货联系号码应为正确的 11 位手机号码' });
    let idImages;
    try {
      idImages = { front: parseIdImage(body.idCardFrontImage), back: parseIdImage(body.idCardBackImage) };
    } catch (error) { return json(res, 400, { error: error.message }); }
    if (isNumberOrder) {
      const offer = db.numberOffers.find((item) => item.id === record.selectedOfferId && item.status === 'available');
      if (!offer) return json(res, 409, { error: '所选号码已被预占，请返回重新选择' });
      record.selectedNumber = offer.displayNumber;
      record.operator = offer.operator;
      record.fulfillmentMethod = '';
      record.deliveryStatus = 'pending';
      record.activationStatus = 'pending';
      record.subsidyStatus = 'pending';
      record.offlineLocation = db.settings.offlineVerificationAddress;
      if (record.offlineLocation) {
        record.offlineFeatureCode = uniqueFeatureCode(db);
        record.offlineAssignedAt = new Date().toISOString();
      }
    } else {
      record.selectedNumber = '';
      record.fulfillmentMethod = '';
    }
    try {
      record.idCardFrontFile = saveIdImage(idImages.front, record.id, 'front');
      record.idCardBackFile = saveIdImage(idImages.back, record.id, 'back');
    } catch (error) {
      for (const filename of [record.idCardFrontFile, record.idCardBackFile].filter(Boolean)) {
        try { fs.unlinkSync(path.join(UPLOAD_DIR, filename)); } catch { /* Nothing persisted for this order. */ }
      }
      return json(res, 500, { error: '身份证图片加密存储失败，请稍后重试' });
    }
    if (record.selectedOfferId) {
      const offer = db.numberOffers.find((item) => item.id === record.selectedOfferId);
      offer.status = 'reserved';
      offer.reservedBy = record.id;
    }
    record.statusHistory.push({ status: record.status, at: record.createdAt, by: 'student' });
    record.verificationStatus = record.selectedOfferId ? 'pending_manual' : 'not_required';
    const collection = url.pathname === '/api/orders' ? db.orders : db.tickets;
    collection.push(record);
    audit(db, 'student.submitted', 'student', record.id, { schoolCode, type: record.type });
    writeDb(db);
    return json(res, 201, { record: { id: record.id, type: record.type, status: record.status, verificationStatus: record.verificationStatus } });
  }

  if (req.method === 'PATCH' && url.pathname === '/api/admin/offline-settings') {
    const session = requireAdmin(req, res);
    if (!session) return;
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const action = body.action === 'clear' ? 'clear' : 'set';
    const verificationAddress = safe(body.verificationAddress, 160);
    if (action === 'set' && !verificationAddress) return json(res, 400, { error: '请输入可办理线下实名认证的地址' });
    const updatedAt = new Date().toISOString();
    db.settings.offlineVerificationAddress = action === 'clear' ? '' : verificationAddress;
    db.settings.offlineVerificationAddressUpdatedAt = updatedAt;
    let affectedOrders = 0;
    for (const record of db.orders) {
      if (!record.selectedOfferId || record.status === 'cancelled' || record.activationStatus === 'activated') continue;
      record.offlineLocation = action === 'clear' ? '' : verificationAddress;
      if (action === 'clear') {
        record.offlineFeatureCode = '';
        record.offlineAssignedAt = '';
      } else {
        if (!record.offlineFeatureCode) record.offlineFeatureCode = uniqueFeatureCode(db);
        record.offlineAssignedAt = updatedAt;
      }
      record.updatedAt = updatedAt;
      affectedOrders += 1;
    }
    audit(db, action === 'clear' ? 'offline-address.cleared' : 'offline-address.updated', session.user, 'global-settings', { affectedOrders });
    writeDb(db);
    return json(res, 200, { verificationAddress: db.settings.offlineVerificationAddress, updatedAt, affectedOrders });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
    if (!requireAdmin(req, res)) return;
    const openRecords = (records) => records.filter((record) => !['completed', 'cancelled'].includes(record.status)).length;
    return json(res, 200, {
      offlineSettings: {
        verificationAddress: db.settings.offlineVerificationAddress,
        updatedAt: db.settings.offlineVerificationAddressUpdatedAt
      },
      serviceStatus: {
        enabled: db.settings.serviceEnabled,
        updatedAt: db.settings.serviceStatusUpdatedAt,
        updatedBy: db.settings.serviceStatusUpdatedBy
      },
      schools: db.schools.filter((item) => item.code !== TEST_SCHOOL_CODE),
      orders: db.orders.slice(-300).reverse(),
      tickets: db.tickets.slice(-300).reverse(),
      metrics: {
        scans: db.schools.reduce((total, school) => total + (school.scans || 0), 0),
        orders: openRecords(db.orders),
        tickets: openRecords(db.tickets),
        activeSchools: db.schools.filter((item) => item.code !== TEST_SCHOOL_CODE && item.status === 'active').length,
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
    if (db.numberOffers.some((item) => item.displayNumber === displayNumber)) return json(res, 409, { error: '号码池中已存在相同号码资源' });
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

  if (req.method === 'POST' && url.pathname === '/api/admin/vouchers/import') {
    const session = requireAdmin(req, res);
    if (!session) return;
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    if (!body.fileBase64) return json(res, 400, { error: '请上传运营商实名结果 Excel 文件' });
    let rows;
    try {
      const workbook = XLSX.read(Buffer.from(String(body.fileBase64).replace(/^data:.*?;base64,/, ''), 'base64'), { type: 'buffer' });
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    } catch { return json(res, 400, { error: 'Excel 文件无法解析，请检查文件格式' }); }
    const aliases = (row, names) => names.map((name) => row[name]).find((value) => value !== undefined && String(value).trim() !== '') ?? '';
    const issued = [];
    const skipped = [];
    for (const row of rows) {
      const recordId = safe(aliases(row, ['服务编号', '订单编号', 'recordId', 'serviceId']), 80);
      const record = findRecord(db, recordId);
      const operator = safe(aliases(row, ['运营商', 'operator', 'Operator']), 20);
      const operatorReference = safe(aliases(row, ['运营商返回码', '实名结果编号', 'operatorReference', 'reference']), 120);
      const requestedExpiry = safeIso(aliases(row, ['有效期至', 'expiresAt', 'expiry']));
      if (!record || db.vouchers.some((voucher) => voucher.recordId === recordId)) { skipped.push(recordId || 'empty'); continue; }
      const token = crypto.randomBytes(32).toString('base64url');
      const voucher = {
        id: id('VCH'), recordId: record.id, schoolCode: record.schoolCode, phone: record.phone,
        operator: operator || record.operator || '', operatorReference, token, status: 'issued',
        issuedAt: new Date().toISOString(), expiresAt: requestedExpiry || new Date(Date.now() + VOUCHER_DEFAULT_TTL_DAYS * 86400000).toISOString(),
        redeemedAt: '', redeemedBy: ''
      };
      db.vouchers.push(voucher);
      record.status = 'completed';
      record.verificationStatus = 'verified';
      record.activationStatus = 'activated';
      record.serviceResult = operatorReference ? `运营商已完成实名验证，返回编号：${operatorReference}` : '运营商已完成实名验证，待线下核销';
      record.updatedAt = new Date().toISOString();
      if (!Array.isArray(record.statusHistory)) record.statusHistory = [];
      record.statusHistory.push({ status: 'completed', at: record.updatedAt, by: session.user });
      issued.push(voucher.id);
      audit(db, 'voucher.issued', session.user, voucher.id, { recordId: record.id, operator: voucher.operator, expiresAt: voucher.expiresAt });
    }
    if (!issued.length) return json(res, 400, { error: '没有可签发的凭证；请确认服务编号存在且未重复导入', skipped });
    writeDb(db);
    return json(res, 201, { issued: issued.length, skipped: skipped.length });
  }

  if (url.pathname.startsWith('/api/redeem/')) {
    const token = safe(decodeURIComponent(url.pathname.split('/')[3] || ''), 100);
    const voucher = db.vouchers.find((item) => item.token === token);
    if (!voucher) return json(res, 404, { error: '凭证无效' });
    const record = findRecord(db, voucher.recordId);
    const state = voucherState(voucher);
    if (req.method === 'GET') return json(res, 200, { status: state, voucherId: voucher.id, schoolName: record?.schoolName || '', operator: voucher.operator || record?.operator || '', expiresAt: voucher.expiresAt, phone: maskPhoneNumber(voucher.phone) });
    if (req.method === 'POST' && url.pathname.endsWith('/request-code')) {
      if (state !== 'issued') return json(res, 409, { error: '该凭证当前不可核销' });
      const result = await issueStudentCode(db, { schoolCode: voucher.schoolCode, phone: voucher.phone }, 'redeem');
      return json(res, result.status, result.response || { error: result.error });
    }
    if (req.method === 'POST' && url.pathname.endsWith('/confirm')) {
      if (state !== 'issued') return json(res, 409, { error: '该凭证当前不可核销' });
      let body;
      try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
      const codeError = consumeStudentCode(voucher.schoolCode, voucher.phone, safe(body.code, 10), 'redeem');
      if (codeError) return json(res, 400, { error: codeError });
      voucher.status = 'redeemed';
      voucher.redeemedAt = new Date().toISOString();
      voucher.redeemedBy = safe(body.redeemedBy, 80) || 'offline-counter';
      audit(db, 'voucher.redeemed', voucher.redeemedBy, voucher.id, { recordId: voucher.recordId });
      writeDb(db);
      return json(res, 200, { ok: true, voucherId: voucher.id, redeemedAt: voucher.redeemedAt });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/offline/matches') {
    const session = requireOffline(req, res);
    if (!session) return;
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const match = matchOfflineRecord(db, body.featureCode, body.idCard);
    if (!match) return json(res, 400, { error: '匹配失败。请核对特征码和学生身份证号码，或确认该号码尚未激活。' });
    const matchToken = crypto.randomBytes(32).toString('base64url');
    offlineMatches.set(matchToken, { worker: session.user, recordId: match.record.id, featureCode: match.normalizedCode, expiresAt: Date.now() + 5 * 60 * 1000 });
    return json(res, 200, {
      matchToken,
      expiresInSeconds: 300,
      record: {
        id: match.record.id,
        name: match.record.name,
        phone: match.record.phone,
        backupPhone: match.record.backupPhone,
        schoolName: match.record.schoolName,
        operator: match.record.operator,
        selectedNumber: match.record.selectedNumber,
        offlineLocation: match.record.offlineLocation,
        verificationStatus: match.record.verificationStatus,
        activationStatus: match.record.activationStatus
      }
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/offline/verifications') {
    const session = requireOffline(req, res);
    if (!session) return;
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const matchToken = safe(body.matchToken, 100);
    const pendingMatch = offlineMatches.get(matchToken);
    if (!pendingMatch || pendingMatch.worker !== session.user || pendingMatch.expiresAt <= Date.now()) return json(res, 400, { error: '匹配确认已失效，请重新核对学生信息' });
    const pendingRecord = db.orders.find((item) => item.id === pendingMatch.recordId);
    const record = pendingRecord ? activateOfflineRecord(db, { code: pendingMatch.featureCode, idCard: pendingRecord.idCard, reference: body.reference, worker: session.user }) : null;
    offlineMatches.delete(matchToken);
    if (!record) return json(res, 409, { error: '订单状态已变化，请重新匹配' });
    writeDb(db);
    return json(res, 201, { record: { id: record.id, selectedNumber: record.selectedNumber, activationStatus: record.activationStatus, verifiedAt: record.offlineVerifiedAt } });
  }

  if (req.method === 'POST' && url.pathname === '/api/offline/verifications/import') {
    const session = requireOffline(req, res);
    if (!session) return;
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    if (!body.fileBase64) return json(res, 400, { error: '请上传实名验证消息 Excel 文件' });
    let rows;
    try {
      const workbook = XLSX.read(Buffer.from(String(body.fileBase64).replace(/^data:.*?;base64,/, ''), 'base64'), { type: 'buffer' });
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    } catch { return json(res, 400, { error: 'Excel 文件无法解析，请检查文件格式' }); }
    if (!rows.length) return json(res, 400, { error: 'Excel 中没有可导入的数据' });
    const aliases = (row, names) => names.map((name) => row[name]).find((value) => value !== undefined && String(value).trim() !== '') ?? '';
    const activated = [];
    const rejected = [];
    for (const row of rows) {
      const code = safe(aliases(row, ['特征码', 'featureCode', 'Feature Code']), 40).toUpperCase();
      const idCard = safe(aliases(row, ['身份证号码', '身份证号', 'idCard', 'ID Card']), 18).toUpperCase();
      const reference = safe(aliases(row, ['实名验证消息', '验证流水号', '验证编号', 'reference', 'message']), 200);
      const record = activateOfflineRecord(db, { code, idCard, reference, worker: session.user });
      if (!record) {
        rejected.push(code || 'empty');
        continue;
      }
      activated.push(record.id);
    }
    if (!activated.length) return json(res, 400, { error: '没有匹配成功的实名记录。请检查特征码和身份证号码是否与学生订单一致。', rejected: rejected.length });
    writeDb(db);
    return json(res, 201, { activated: activated.length, rejected: rejected.length });
  }

  if (req.method === 'POST' && url.pathname === '/api/student/confirm-completion') {
    let body;
    try { body = await parseBody(req); } catch (error) { return json(res, 400, { error: error.message }); }
    const schoolCode = safe(body.schoolCode, 40);
    const studentSession = sessionFor(req, 'student');
    const phone = studentSession?.user || safe(body.phone, 20);
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
    if (code !== UNIFIED_ENTRY_CODE && !db.schools.some((item) => item.code === code)) return json(res, 404, { error: '学校不存在' });
    const target = code === UNIFIED_ENTRY_CODE ? `${url.origin}/entry` : `${url.origin}/q/${encodeURIComponent(code)}`;
    const png = await QRCode.toBuffer(target, { width: 720, margin: 2, errorCorrectionLevel: 'M' });
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
    const sortedRecords = [...records].sort((a, b) => `${a.schoolName || ''}\u0000${a.college || ''}`.localeCompare(`${b.schoolName || ''}\u0000${b.college || ''}`, 'zh-CN'));
    const rows = sortedRecords.map((record) => ({ 服务编号: record.id, 学校: record.schoolName, 学院: record.college, 姓名: record.name, 学号: record.studentNo, 身份证号码: record.idCard, 联系电话: record.phone, 备用联系电话: record.backupPhone, 运营商: record.operator, 意向号码: record.selectedNumber, 服务事项: record.type, 状态: record.status, 创建时间: record.createdAt }));
    const grouped = new Map();
    for (const record of sortedRecords) {
      const key = `${record.schoolName || '未填写学校'}\u0000${record.college || '其他学院'}`;
      const item = grouped.get(key) || { 学校: record.schoolName || '未填写学校', 学院: record.college || '其他学院', 提交数量: 0, 已完成: 0, 已取消: 0 };
      item.提交数量 += 1;
      if (record.status === 'completed') item.已完成 += 1;
      if (record.status === 'cancelled') item.已取消 += 1;
      grouped.set(key, item);
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '信息收集');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([...grouped.values()]), '学校学院汇总');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="campus-service-records.xlsx"', 'Cache-Control': 'no-store' });
    return res.end(buffer);
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/export-activated.xlsx') {
    if (!requireAdmin(req, res)) return;
    let activatedRecords;
    try {
      activatedRecords = db.activatedArchives.map(decryptActivatedArchive);
    } catch {
      return json(res, 500, { error: '已激活名单解密失败，请检查服务器加密密钥是否与归档时一致' });
    }
    const rows = activatedRecords
      .sort((a, b) => `${a.schoolName || ''}\u0000${a.college || ''}\u0000${a.name || ''}`.localeCompare(`${b.schoolName || ''}\u0000${b.college || ''}\u0000${b.name || ''}`, 'zh-CN'))
      .map((record) => ({
        学校: record.schoolName,
        学院: record.college,
        姓名: record.name,
        身份证号: record.idCard,
        选号号码: record.selectedNumber,
        联系电话: record.phone,
        备选联系电话: record.backupPhone,
        激活状态: record.activationStatus === 'activated' ? '已激活' : record.activationStatus
      }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: ['学校', '学院', '姓名', '身份证号', '选号号码', '联系电话', '备选联系电话', '激活状态'] }), '已实名激活名单');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="campus-activated-records.xlsx"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(buffer);
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/export-pending.xlsx') {
    if (!requireAdmin(req, res)) return;
    const pendingStatuses = new Set(['pending', 'contacting', 'assigned', 'scheduled', 'processing']);
    const records = [...db.orders, ...db.tickets].filter((record) => pendingStatuses.has(record.status));
    const rows = records.map((record) => ({ 服务编号: record.id, 学校: record.schoolName, 学院: record.college, 姓名: record.name, 学号: record.studentNo, 身份证号码: record.idCard, 联系电话: record.phone, 备用联系电话: record.backupPhone, 运营商: record.operator, 意向号码: record.selectedNumber, 服务事项: record.type, 状态: record.status, 创建时间: record.createdAt }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '待处理');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="campus-service-pending.xlsx"', 'Cache-Control': 'no-store' });
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
    if (record.selectedOfferId && nextVerification !== record.verificationStatus) return json(res, 403, { error: '选号订单的实名核验状态只能由线下实体端更新' });
    if (record.selectedOfferId && nextActivation !== record.activationStatus) return json(res, 403, { error: '选号订单的激活状态只能由线下实体端更新' });
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

const publicStaticFiles = new Set([
  'index.html', 'styles.css', 'app.js', 'student-extra.css', 'operator-extra.css', 'restored-services.css',
  'dispatch.html', 'dispatch.js', 'student-login.html', 'student-login.js',
  'admin-login.html', 'admin-login.js', 'admin-register.html', 'admin-register.js',
  'operator.html', 'operator.js', 'redeem.html', 'redeem.js',
  'offline.html', 'offline.js', 'offline-login.html', 'offline-login.js',
  'offline-register.html', 'offline-register.js', 'service-unavailable.html'
]);
const publicMiniprogramExtensions = new Set(['.js', '.json', '.wxml', '.wxss']);

function isPublicStaticFile(file) {
  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return false;
  if (publicStaticFiles.has(relative)) return true;
  return relative.startsWith('miniprogram/') && publicMiniprogramExtensions.has(path.extname(relative).toLowerCase());
}

function staticFile(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  const db = readDb();
  const adminPath = pathname === '/admin' || pathname === '/admin/' || pathname.startsWith('/admin/');
  const publicServicePath = pathname === '/' || pathname === '/entry' || pathname === '/service'
    || pathname.startsWith('/service/') || pathname.startsWith('/q/') || pathname === '/offline'
    || pathname.startsWith('/offline/');
  if (!db.settings.serviceEnabled && publicServicePath && !adminPath) pathname = '/service-unavailable.html';
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/entry') pathname = '/dispatch.html';
  if (pathname === '/service') pathname = '/index.html';
  if (pathname.startsWith('/q/')) pathname = '/dispatch.html';
  if (pathname.startsWith('/service/')) pathname = '/index.html';
  if (pathname.startsWith('/redeem/')) pathname = '/redeem.html';
  if (pathname === '/offline' || pathname === '/offline/') pathname = '/offline.html';
  if (pathname === '/offline/login') pathname = '/offline-login.html';
  if (pathname === '/offline/register') pathname = '/offline-register.html';
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/operator.html';
  if (pathname === '/admin/login') pathname = '/admin-login.html';
  if (pathname === '/admin/register') pathname = '/admin-register.html';
  if (pathname === '/student/login') pathname = '/student-login.html';
  if (pathname === '/student/register') pathname = '/student-login.html';
  const file = path.resolve(ROOT, `.${pathname}`);
  if (!isPublicStaticFile(file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return text(res, 404, 'Not found');
  res.writeHead(200, {
    'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(file).pipe(res);
}

const requestHandler = async (req, res) => {
  const originalWriteHead = res.writeHead;
  const securityHeaders = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' https://res.wx.qq.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...(IS_PRODUCTION ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {})
  };
  res.writeHead = function writeHeadWithSecurity(statusCode, statusMessage, headers) {
    if (typeof statusMessage === 'string') return originalWriteHead.call(this, statusCode, statusMessage, { ...securityHeaders, ...(headers || {}) });
    return originalWriteHead.call(this, statusCode, { ...securityHeaders, ...(statusMessage || {}) });
  };
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
};

if (IS_PRODUCTION && ADMIN_PASSWORD === 'CampusAdmin2026') {
  throw new Error('生产环境必须通过 ADMIN_PASSWORD 设置非默认运营商密码');
}
if (process.env.NODE_ENV !== 'test' && !validPassword(ADMIN_PASSWORD)) {
  throw new Error('ADMIN_PASSWORD 必须为 9-15 位且同时包含大小写字母和数字');
}

ensureDb();
async function start() {
  if (DB_DRIVER !== 'json') {
    sqlStorage = new Storage({ driver: DB_DRIVER, file: DB_FILE, initial: initialDb, normalize: normalizeDb });
    runtimeDb = await sqlStorage.init();
    if (syncSchoolsFromWorkbook(runtimeDb)) await sqlStorage.save(runtimeDb);
  }
  let server;
  if (HTTPS_ENABLED) {
    const pemConfigured = TLS_KEY_FILE && TLS_CERT_FILE && fs.existsSync(TLS_KEY_FILE) && fs.existsSync(TLS_CERT_FILE);
    const pfxConfigured = TLS_PFX_FILE && fs.existsSync(TLS_PFX_FILE);
    if (!pemConfigured && !pfxConfigured) throw new Error('HTTPS 已启用，但未找到 TLS 证书文件');
    const tls = pemConfigured ? { key: fs.readFileSync(TLS_KEY_FILE), cert: fs.readFileSync(TLS_CERT_FILE) } : { pfx: fs.readFileSync(TLS_PFX_FILE), passphrase: TLS_PFX_PASSWORD };
    server = https.createServer(tls, requestHandler);
  } else server = http.createServer(requestHandler);
  const protocol = HTTPS_ENABLED ? 'https' : 'http';
  server.listen(PORT, () => console.log(`Campus service running at ${protocol}://127.0.0.1:${PORT} using ${DB_DRIVER}`));
}
start().catch((error) => { console.error('数据库初始化失败:', error); process.exitCode = 1; });

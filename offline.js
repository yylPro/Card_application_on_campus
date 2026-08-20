const form = document.getElementById('offlineImportForm');
const manualForm = document.getElementById('offlineManualForm');
const toast = document.getElementById('toast');
const resultPanel = document.getElementById('offlineResult');
const matchPanel = document.getElementById('offlineMatch');
const matchDetail = document.getElementById('offlineMatchDetail');
let pendingMatchToken = '';
let pendingReference = '';
let pendingCampusNumber = '';
let pendingProofFile = '';
let scanStream = null;
let scanTimer = null;
let scanCanvas = null;
let scanContext = null;
let wechatSdkPromise = null;
let wechatScanReady = false;

function inWechat() { return /MicroMessenger/i.test(navigator.userAgent || ''); }
if (inWechat()) document.getElementById('offlineScanner').hidden = true;
function extractFeatureCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  const prefixed = raw.match(/CAMPUS-[A-Z0-9_-]{4,40}/);
  if (prefixed) return prefixed[0];
  return /^[A-Z0-9][A-Z0-9_-]{3,39}$/.test(raw) ? raw : '';
}
function loadWechatSdk() {
  if (wechatSdkPromise) return wechatSdkPromise;
  wechatSdkPromise = new Promise((resolve, reject) => {
    if (window.wx) return resolve(window.wx);
    const script = document.createElement('script');
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
    script.onload = () => resolve(window.wx);
    script.onerror = () => reject(new Error('微信扫码组件加载失败'));
    document.head.appendChild(script);
  });
  return wechatSdkPromise;
}
async function prepareWechatScan() {
  if (!inWechat()) return null;
  const wx = await loadWechatSdk();
  if (wechatScanReady) return wx;
  const response = await fetch('/api/wechat/js-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageUrl: location.href.split('#')[0] }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || '微信扫码配置失败');
  await new Promise((resolve, reject) => {
    wx.config({ ...payload.config, jsApiList: ['scanQRCode'] });
    wx.ready(() => { wechatScanReady = true; resolve(); });
    wx.error((error) => reject(new Error(error?.errMsg || '微信 JS-SDK 配置失败')));
  });
  return wx;
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

async function requireSession() {
  const response = await fetch('/api/offline/session');
  const session = await response.json();
  if (!session.authenticated) return location.replace('/offline/login');
  const phone = String(session.phone || '');
  document.getElementById('offlineAccount').textContent = phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2');
}

manualForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = manualForm.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = '正在匹配...';
  try {
    const data = Object.fromEntries(new FormData(manualForm).entries());
    data.activationProofFile = await readFile(manualForm.elements.activationProofFile.files[0]);
    const response = await fetch('/api/offline/import-verification', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ featureCode: data.featureCode, campusNumber: data.campusNumber, activationProofFile: data.activationProofFile, result: 'verified' }] })
    });
    const result = await response.json();
    if (response.status === 401) return location.replace('/offline/login');
    if (!response.ok) throw new Error(result.error || '登记失败');
    const item = result.results?.[0];
    if (!item?.success) throw new Error(item?.message || '核验失败');
    resultPanel.hidden = false;
    resultPanel.innerHTML = `<strong>实名核验已提交</strong><span>${escapeHtml(item.message || '请等待商家确认激活')}</span>`;
    manualForm.reset();
    showToast('实名核验已提交');
  } catch (error) {
    showToast(error.message || '登记失败，请稍后重试', true);
  } finally {
    button.disabled = false;
    button.textContent = '提交实名核验';
  }
});

document.getElementById('cancelOfflineMatch')?.addEventListener('click', () => {
  pendingMatchToken = '';
  pendingReference = '';
  pendingCampusNumber = '';
  matchPanel.hidden = true;
  manualForm.elements.featureCode.focus();
});

document.getElementById('confirmOfflineActivation')?.addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!pendingMatchToken) return showToast('匹配确认已失效，请重新匹配', true);
  button.disabled = true;
  button.textContent = '正在提交...';
  try {
    const response = await fetch('/api/offline/verifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchToken: pendingMatchToken, campusNumber: pendingCampusNumber, reference: pendingReference, activationProofFile: pendingProofFile })
    });
    const result = await response.json();
    if (response.status === 401) return location.replace('/offline/login');
    if (!response.ok) throw new Error(result.error || '核验失败');
    matchPanel.hidden = true;
    resultPanel.hidden = false;
    resultPanel.innerHTML = `<strong>实名核验已提交</strong><span>服务编号 ${escapeHtml(result.record.id)}，请由商家确认激活。</span>`;
    pendingMatchToken = '';
    pendingReference = '';
    pendingCampusNumber = '';
    pendingProofFile = '';
    manualForm.reset();
    showToast('学生实名核验已提交');
  } catch (error) {
    showToast(error.message || '核验失败，请稍后重试', true);
  } finally {
    button.disabled = false;
    button.textContent = '提交实名核验';
  }
});

async function stopScanner() {
  if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
  if (scanStream) scanStream.getTracks().forEach((track) => track.stop());
  scanStream = null;
  const video = document.getElementById('qrVideo');
  if (video) video.srcObject = null;
  document.getElementById('offlineScanner').hidden = true;
}

document.getElementById('scanQrButton').addEventListener('click', async () => {
  try {
    if (inWechat()) {
      const wx = await prepareWechatScan();
      wx.scanQRCode({ needResult: 1, scanType: ['qrCode'], success: (result) => {
        const rawValue = String(result.resultStr || result.result || '').trim().toUpperCase();
        const featureCode = extractFeatureCode(rawValue);
        if (!featureCode) return showToast('二维码中没有有效订单核验码', true);
        manualForm.elements.featureCode.value = featureCode;
        showToast('二维码已识别，请继续填写校园号码');
      }, fail: (error) => { if (!String(error?.errMsg || '').includes('cancel')) showToast('微信扫码失败，请重试', true); } });
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('SECURE_CONTEXT');
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    const video = document.getElementById('qrVideo');
    video.srcObject = scanStream;
    await video.play();
    document.getElementById('offlineScanner').hidden = false;
    scanCanvas = document.createElement('canvas');
    scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });
    const scan = async () => {
      if (!scanStream) return;
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight && window.jsQR) {
          scanCanvas.width = video.videoWidth;
          scanCanvas.height = video.videoHeight;
          scanContext.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
          const image = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
          const code = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
          const rawValue = String(code?.data || '').trim().toUpperCase();
          const featureCode = extractFeatureCode(rawValue);
          if (featureCode) {
            manualForm.elements.featureCode.value = featureCode;
            await stopScanner();
            showToast('二维码已识别，请继续填写校园号码');
            return;
          }
        }
      } catch { /* Camera frames can be unavailable briefly. */ }
      scanTimer = setTimeout(scan, 250);
    };
    scan();
  } catch (error) { await stopScanner(); showToast(error.name === 'NotAllowedError' ? '请允许摄像头权限后再扫码' : error.message === 'SECURE_CONTEXT' ? '请使用 https://leptla.com 打开，不能使用 http 或微信预览地址' : '无法打开摄像头，请检查浏览器权限', true); }
});
document.getElementById('stopScanButton').addEventListener('click', stopScanner);

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  const file = form.elements.verificationFile.files[0];
  if (!file) return showToast('请先选择实名验证文件', true);
  button.disabled = true;
  button.textContent = '正在匹配...';
  try {
    const response = await fetch('/api/offline/verifications/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileBase64: await readFile(file) })
    });
    const result = await response.json();
    if (response.status === 401) return location.replace('/offline/login');
    if (!response.ok) throw new Error(result.error || '导入失败');
    resultPanel.hidden = false;
    const verified = Number(result.verified || result.activated || 0);
    const pendingMerchant = Number(result.pendingMerchant || 0);
    resultPanel.innerHTML = `<strong>本次已提交 ${verified} 条实名核验</strong><span>${pendingMerchant ? `${pendingMerchant} 条校园账号预约等待商家确认激活；` : ''}${result.rejected ? `${result.rejected} 条未匹配，未做任何状态修改。` : '全部记录匹配成功。'}</span>`;
    form.reset();
    showToast('实名验证消息已处理');
  } catch (error) {
    showToast(error.message || '导入失败，请稍后重试', true);
  } finally {
    button.disabled = false;
    button.textContent = '导入并提交实名核验';
  }
});

document.getElementById('offlineLogoutButton').addEventListener('click', async () => {
  await fetch('/api/offline/logout', { method: 'POST' });
  location.replace('/offline/login');
});

requireSession().catch(() => location.replace('/offline/login'));

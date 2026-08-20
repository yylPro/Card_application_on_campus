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
    const response = await fetch('/api/offline/matches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(manualForm).entries()))
    });
    const result = await response.json();
    if (response.status === 401) return location.replace('/offline/login');
    if (!response.ok) throw new Error(result.error || '登记失败');
    pendingMatchToken = result.matchToken;
    pendingReference = data.reference || '';
    pendingCampusNumber = data.campusNumber || result.record.campusNumber || '';
    pendingProofFile = await readFile(manualForm.elements.activationProofFile.files[0]);
    matchDetail.innerHTML = `<dl><div><dt>学生姓名</dt><dd>${escapeHtml(result.record.name)}</dd></div><div><dt>联系电话</dt><dd>${escapeHtml(result.record.phone)}</dd></div><div><dt>学校</dt><dd>${escapeHtml(result.record.schoolName)}</dd></div><div><dt>校园号码</dt><dd>${escapeHtml(pendingCampusNumber)}</dd></div></dl>`;
    matchPanel.hidden = false;
    matchPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast('已匹配到学生订单，请核对');
  } catch (error) {
    showToast(error.message || '登记失败，请稍后重试', true);
  } finally {
    button.disabled = false;
    button.textContent = '匹配学生订单';
  }
});

document.getElementById('cancelOfflineMatch').addEventListener('click', () => {
  pendingMatchToken = '';
  pendingReference = '';
  pendingCampusNumber = '';
  matchPanel.hidden = true;
  manualForm.elements.featureCode.focus();
});

document.getElementById('confirmOfflineActivation').addEventListener('click', async (event) => {
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
  document.getElementById('offlineScanner').hidden = true;
}

document.getElementById('scanQrButton').addEventListener('click', async () => {
  if (!('BarcodeDetector' in window)) return showToast('当前浏览器不支持二维码扫描，请手工输入核验码', true);
  try {
    const detector = new BarcodeDetector({ formats: ['qr_code'] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    const video = document.getElementById('qrVideo');
    video.srcObject = scanStream;
    await video.play();
    document.getElementById('offlineScanner').hidden = false;
    const scan = async () => {
      if (!scanStream) return;
      try {
        const codes = await detector.detect(video);
        if (codes[0]?.rawValue) {
          manualForm.elements.featureCode.value = codes[0].rawValue.trim();
          await stopScanner();
          showToast('二维码已识别，请继续核对身份证和校园号码');
          return;
        }
      } catch { /* Camera frames can be unavailable briefly. */ }
      scanTimer = setTimeout(scan, 250);
    };
    scan();
  } catch (error) { await stopScanner(); showToast(error.name === 'NotAllowedError' ? '请允许摄像头权限后再扫码' : '无法打开摄像头，请手工输入核验码', true); }
});
document.getElementById('stopScanButton').addEventListener('click', stopScanner);

form.addEventListener('submit', async (event) => {
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

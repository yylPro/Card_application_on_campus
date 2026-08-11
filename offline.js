const form = document.getElementById('offlineImportForm');
const manualForm = document.getElementById('offlineManualForm');
const toast = document.getElementById('toast');
const resultPanel = document.getElementById('offlineResult');
const matchPanel = document.getElementById('offlineMatch');
const matchDetail = document.getElementById('offlineMatchDetail');
let pendingMatchToken = '';
let pendingReference = '';

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
    matchDetail.innerHTML = `<dl><div><dt>学生姓名</dt><dd>${escapeHtml(result.record.name)}</dd></div><div><dt>原联系电话</dt><dd>${escapeHtml(result.record.phone)}</dd></div><div><dt>备用联系电话</dt><dd>${escapeHtml(result.record.backupPhone || '未填写')}</dd></div><div><dt>学校</dt><dd>${escapeHtml(result.record.schoolName)}</dd></div><div><dt>运营商</dt><dd>${escapeHtml(result.record.operator)}</dd></div><div><dt>学生选号号码</dt><dd>${escapeHtml(result.record.selectedNumber)}</dd></div></dl>`;
    matchPanel.hidden = false;
    matchPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    showToast('已匹配到学生和选号号码，请核对');
  } catch (error) {
    showToast(error.message || '登记失败，请稍后重试', true);
  } finally {
    button.disabled = false;
    button.textContent = '匹配学生与选号号码';
  }
});

document.getElementById('cancelOfflineMatch').addEventListener('click', () => {
  pendingMatchToken = '';
  pendingReference = '';
  matchPanel.hidden = true;
  manualForm.elements.featureCode.focus();
});

document.getElementById('confirmOfflineActivation').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  if (!pendingMatchToken) return showToast('匹配确认已失效，请重新匹配', true);
  button.disabled = true;
  button.textContent = '正在激活...';
  try {
    const response = await fetch('/api/offline/verifications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchToken: pendingMatchToken, reference: pendingReference })
    });
    const result = await response.json();
    if (response.status === 401) return location.replace('/offline/login');
    if (!response.ok) throw new Error(result.error || '激活失败');
    matchPanel.hidden = true;
    resultPanel.hidden = false;
    resultPanel.innerHTML = `<strong>号码 ${escapeHtml(result.record.selectedNumber)} 已激活</strong><span>服务编号 ${escapeHtml(result.record.id)}</span>`;
    pendingMatchToken = '';
    pendingReference = '';
    manualForm.reset();
    showToast('学生已实名，选号号码已激活');
  } catch (error) {
    showToast(error.message || '激活失败，请稍后重试', true);
  } finally {
    button.disabled = false;
    button.textContent = '确认实名并激活';
  }
});

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
    resultPanel.innerHTML = `<strong>本次已激活 ${result.activated} 个号码</strong><span>${result.rejected ? `${result.rejected} 条未匹配，未做任何状态修改。` : '全部记录匹配成功。'}</span>`;
    form.reset();
    showToast('实名验证消息已处理');
  } catch (error) {
    showToast(error.message || '导入失败，请稍后重试', true);
  } finally {
    button.disabled = false;
    button.textContent = '导入并匹配激活';
  }
});

document.getElementById('offlineLogoutButton').addEventListener('click', async () => {
  await fetch('/api/offline/logout', { method: 'POST' });
  location.replace('/offline/login');
});

requireSession().catch(() => location.replace('/offline/login'));

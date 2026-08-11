const pathParts = location.pathname.split('/').filter(Boolean);
const routeSchoolCode = (pathParts[0] === 'q' || pathParts[0] === 'service') && pathParts[1] ? decodeURIComponent(pathParts[1]) : '';
let schoolCode = routeSchoolCode === 'UNIFIED-2026' ? '' : routeSchoolCode;
const toast = document.getElementById('toast');
const serviceModal = document.getElementById('serviceModal');
const lookupModal = document.getElementById('lookupModal');
const serviceForm = document.getElementById('serviceForm');
const lookupForm = document.getElementById('lookupForm');
const completionForm = document.getElementById('completionForm');
let signedInPhone = '';

fetch('/api/student/session')
  .then((response) => response.json())
  .then((session) => {
    if (!session.authenticated) { location.replace('/student/login'); return; }
    signedInPhone = session.phone || '';
    const phone = serviceForm.elements.phone;
    if (phone && signedInPhone) { phone.value = signedInPhone; phone.readOnly = true; }
    const lookupPhone = lookupForm.elements.phone;
    if (lookupPhone && signedInPhone) { lookupPhone.value = signedInPhone; lookupPhone.readOnly = true; }
  })
  .catch(() => location.replace('/student/login'));

const identityInput = serviceForm.elements.idCard;
const primaryPhoneInput = serviceForm.elements.phone;
const backupPhoneInput = serviceForm.elements.backupPhone;
function validIdCard(value) {
  const normalized = String(value || '').toUpperCase();
  if (!/^\d{17}[\dX]$/.test(normalized)) return false;
  const provinceCodes = new Set(['11', '12', '13', '14', '15', '21', '22', '23', '31', '32', '33', '34', '35', '36', '37', '41', '42', '43', '44', '45', '46', '50', '51', '52', '53', '54', '61', '62', '63', '64', '65', '71', '81', '82']);
  if (!provinceCodes.has(normalized.slice(0, 2)) || normalized.slice(14, 17) === '000') return false;
  const year = Number(normalized.slice(6, 10));
  const month = Number(normalized.slice(10, 12));
  const day = Number(normalized.slice(12, 14));
  const birthDate = new Date(year, month - 1, day);
  if (birthDate.getFullYear() !== year || birthDate.getMonth() !== month - 1 || birthDate.getDate() !== day) return false;
  const today = new Date();
  const earliest = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
  if (birthDate > today || birthDate < earliest) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checkCodes = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  const sum = weights.reduce((total, weight, index) => total + Number(normalized[index]) * weight, 0);
  return normalized[17] === checkCodes[sum % 11];
}
identityInput.setAttribute('minlength', '18');
identityInput.setAttribute('maxlength', '18');
identityInput.setAttribute('pattern', '[0-9]{17}[0-9Xx]');
primaryPhoneInput.setAttribute('minlength', '11');
primaryPhoneInput.setAttribute('maxlength', '11');
primaryPhoneInput.setAttribute('pattern', '1[0-9]{10}');
primaryPhoneInput.setAttribute('inputmode', 'numeric');
backupPhoneInput.setAttribute('minlength', '11');
backupPhoneInput.setAttribute('maxlength', '11');
backupPhoneInput.setAttribute('pattern', '1[0-9]{10}');
backupPhoneInput.setAttribute('inputmode', 'numeric');
let studentPasswordInput = serviceForm.elements.password;
if (!studentPasswordInput) {
  const label = document.createElement('label');
  label.textContent = '办理密码';
  studentPasswordInput = document.createElement('input');
  studentPasswordInput.name = 'password';
  studentPasswordInput.type = 'password';
  studentPasswordInput.autocomplete = 'new-password';
  studentPasswordInput.placeholder = '9-15位，含大小写字母和数字';
  label.append(studentPasswordInput);
  backupPhoneInput.closest('label').after(label);
}
studentPasswordInput.minLength = 9;
studentPasswordInput.maxLength = 15;
studentPasswordInput.pattern = '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[A-Za-z0-9]{9,15}';
studentPasswordInput.closest('label').hidden = true;
const legacyCodeInput = lookupForm.elements.code;
if (legacyCodeInput) legacyCodeInput.closest('label')?.remove();
document.getElementById('sendCodeButton')?.remove();
const lookupPasswordLabel = document.createElement('label');
lookupPasswordLabel.textContent = '办理密码';
const lookupPasswordInput = document.createElement('input');
lookupPasswordInput.name = 'password';
lookupPasswordInput.type = 'password';
lookupPasswordInput.autocomplete = 'current-password';
lookupPasswordInput.minLength = 9;
lookupPasswordInput.maxLength = 15;
lookupPasswordInput.pattern = '(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])[A-Za-z0-9]{9,15}';
lookupPasswordInput.placeholder = '请输入办理时设置的密码';
lookupPasswordLabel.append(lookupPasswordInput);
lookupForm.elements.phone.closest('label').before(lookupPasswordLabel);
lookupPasswordLabel.hidden = true;
lookupForm.previousElementSibling.textContent = '请输入办理时设置的手机号和密码查询服务进度。';

document.getElementById('nextServiceStepButton')?.addEventListener('click', (event) => {
  const idCard = identityInput.value.trim();
  const phone = primaryPhoneInput.value.trim();
  const backupPhone = backupPhoneInput.value.trim();
  const password = studentPasswordInput.value.trim();
  const error = !validIdCard(idCard) ? '身份证号格式或校验位不正确，请核对后重试'
    : !/^1\d{10}$/.test(phone) ? '联系电话必须为 11 位数字'
      : backupPhone && !/^1\d{10}$/.test(backupPhone) ? '备用联系电话必须为 11 位数字'
        : !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{9,15}$/.test(password) ? '办理密码需为 9-15 位且包含大小写字母和数字' : '';
  if (!error) return;
  event.stopImmediatePropagation();
  showToast(error, true);
}, true);

let school = null;
let selectedService = { title: '校园网账号预约', kind: 'order' };

async function readJson(response, fallback) {
  try {
    return await response.json();
  } catch {
    throw new Error(response.status >= 500 ? '服务暂时不可用，请稍后重试' : fallback);
  }
}

function userError(error, fallback = '操作未完成，请稍后重试') {
  if (error instanceof TypeError) return '网络连接失败，请检查网络后重试';
  return error?.message || fallback;
}

function imageDataUrl(file) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('身份证图片读取失败')); reader.readAsDataURL(file); });
}

async function loadNumberOffers() {
  const tabs = document.getElementById('operatorTabs');
  const search = document.getElementById('numberSearch');
  const list = document.getElementById('numberPickerList');
  const pagination = document.getElementById('numberPagination');
  const selectedInput = document.getElementById('selectedOfferId');
  const operators = ['中国移动', '中国联通', '中国电信'];
  let operator = operators[0];
  let page = 1;
  let query = '';
  let searchTimer;
  const render = async () => {
    list.innerHTML = '<p class="empty-state">正在加载可选号码...</p>';
    const params = new URLSearchParams({ operator, page: String(page), pageSize: '30' });
    if (query) params.set('q', query);
    try {
      const targetSchoolCode = selectedSchoolCode?.value || schoolCode;
      const response = await fetch(`/api/schools/${encodeURIComponent(targetSchoolCode)}/numbers?${params}`);
      const payload = await readJson(response, '号码资源加载失败，请稍后重试');
      if (!response.ok) throw new Error(payload.error || '号码资源暂不可用');
      tabs.innerHTML = operators.map((item) => `<button type="button" class="operator-tab ${item === operator ? 'active' : ''}" data-operator="${item}">${item}</button>`).join('');
      list.innerHTML = payload.offers.length ? payload.offers.map((offer) => `<button type="button" class="number-option ${selectedInput.value === offer.id ? 'selected' : ''}" data-offer-id="${offer.id}"><strong>${offer.displayNumber}</strong><span>${offer.planName} · ${offer.monthlyFee} 元/月</span></button>`).join('') : '<p class="empty-state">未找到可选号码</p>';
      pagination.innerHTML = payload.totalPages > 1 ? `<button type="button" class="outline-button" data-page="prev" ${page === 1 ? 'disabled' : ''}>上一页</button><span>第 ${page} / ${payload.totalPages} 页，共 ${payload.total} 个号码</span><button type="button" class="outline-button" data-page="next" ${page >= payload.totalPages ? 'disabled' : ''}>下一页</button>` : `<span>共 ${payload.total} 个号码</span>`;
    } catch (error) { list.innerHTML = '<p class="empty-state">号码加载失败，请稍后重试</p>'; pagination.replaceChildren(); showToast(userError(error), true); }
  };
  tabs.onclick = (event) => { const button = event.target.closest('[data-operator]'); if (button) { operator = button.dataset.operator; page = 1; render(); } };
  list.onclick = (event) => { const button = event.target.closest('[data-offer-id]'); if (!button) return; selectedInput.value = button.dataset.offerId; document.getElementById('selectedNumberSummary').textContent = button.querySelector('strong').textContent; list.querySelectorAll('.number-option').forEach((item) => item.classList.toggle('selected', item === button)); };
  pagination.onclick = (event) => { const action = event.target.dataset.page; if (action === 'prev') { page -= 1; render(); } if (action === 'next') { page += 1; render(); } };
  search.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { query = search.value.trim(); page = 1; render(); }, 250); };
  await render();
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

function openModal(modal) {
  modal.hidden = false;
  document.body.classList.add('modal-open');
  const firstInput = modal.querySelector('input');
  window.setTimeout(() => firstInput?.focus(), 50);
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach((modal) => { modal.hidden = true; });
  document.body.classList.remove('modal-open');
}

async function requestCode(phone, purpose) {
  const response = await fetch('/api/student/code', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schoolCode, phone, purpose })
  });
  const result = await readJson(response, '验证码发送失败，请稍后重试');
  if (!response.ok) throw new Error(result.error || '验证码发送失败');
  if (result.developmentCode) showToast(`本地开发验证码：${result.developmentCode}`);
  else showToast('验证码已发送，请注意查收');
}

function startCodeCooldown(button) {
  button.disabled = true;
  let seconds = 60;
  button.textContent = `${seconds} 秒后重试`;
  const timer = window.setInterval(() => {
    seconds -= 1;
    button.textContent = seconds > 0 ? `${seconds} 秒后重试` : '获取验证码';
    if (seconds <= 0) { window.clearInterval(timer); button.disabled = false; }
  }, 1000);
}

function setService(title, kind) {
  selectedService = { title, kind };
  document.getElementById('studentInfoStep').hidden = false;
  document.getElementById('serviceOptionsStep').hidden = true;
  document.getElementById('selectedNumberSummary').textContent = '尚未选择号码';
  const isNumberOrder = kind === 'order' && title.includes('选号');
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalIntro').textContent = kind === 'ticket'
    ? '请尽量写清故障或咨询情况，工作人员会尽快安排处理。'
    : '提交后，工作人员会与您确认服务时间和线下交付安排。';
  serviceForm.elements.detail.placeholder = kind === 'ticket'
    ? '例如：房间内宽带无法连接，路由器指示灯异常'
    : '例如：希望选号、办理校园网账号或预约上门服务';
  serviceForm.querySelector('.submit-button').textContent = kind === 'ticket' ? '提交工单' : '提交预约';
  document.getElementById('numberSelection').hidden = !isNumberOrder;
  serviceForm.elements.selectedOfferId.disabled = !isNumberOrder;
  serviceForm.elements.selectedOfferId.required = isNumberOrder;
  if (!isNumberOrder) serviceForm.elements.selectedOfferId.value = '';
  document.getElementById('fulfillmentNote').hidden = !isNumberOrder;
  openModal(serviceModal);
}

function formatTime(iso) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function statusLabel(status) {
  return ({
    pending: '待受理',
    assigned: '已派单',
    contacting: '联系中',
    scheduled: '已预约',
    processing: '处理中',
    completed: '已完成',
    cancelled: '已取消'
  })[status] || status;
}

function renderRecords(records) {
  const target = document.getElementById('lookupResults');
  if (!records.length) {
    target.innerHTML = '<p class="empty-state">暂未查询到记录，请核对手机号后再试。</p>';
    return;
  }
  target.innerHTML = records.map((record) => `
    <article class="record-item">
      <div><strong>${record.type}</strong><small>${record.id} · ${formatTime(record.createdAt)}${record.operator ? ` · ${record.operator} ${record.selectedNumber || ''}` : ''}</small></div>
      <span class="status-chip ${record.status}">${statusLabel(record.status)}</span>
      ${record.offline ? `<div class="offline-instruction ${record.activationStatus === 'activated' ? 'verified' : ''}"><strong>${record.activationStatus === 'activated' ? '号码已实名激活' : '请前往线下实名验证'}</strong><span>${escapeHtml(record.offline.location)}</span><code>${record.activationStatus === 'activated' ? '已激活' : escapeHtml(record.offline.featureCode)}</code></div>` : record.selectedNumber && record.activationStatus === 'pending' ? '<small>运营商正在分配线下实名地址和特征码</small>' : ''}
      ${record.voucher?.status === 'issued' ? `<div class="voucher-card"><strong>线下领卡凭证</strong><img src="${record.voucher.qrDataUrl}" alt="线下核销二维码" /><small>有效至 ${formatTime(record.voucher.expiresAt)}；到服务点出示后，须验证原手机号。</small></div>` : ''}
      ${record.voucher && record.voucher.status !== 'issued' ? `<small class="record-confirmed">领卡凭证：${record.voucher.status === 'redeemed' ? '已核销' : record.voucher.status === 'expired' ? '已过期' : '已作废'}</small>` : ''}
      ${record.status === 'completed' && !record.completionConfirmedAt ? `<button class="text-button completion-open" data-completion-record="${record.id}">确认完成</button>` : ''}
      ${record.completionConfirmedAt ? `<small class="record-confirmed">已确认 · ${record.rating} 星</small>` : ''}
    </article>
  `).join('');
}

function openCompletion(recordId) {
  completionForm.reset();
  completionForm.elements.recordId.value = recordId;
  document.getElementById('completionRecordId').textContent = `服务编号：${recordId}`;
  openModal(document.getElementById('completionModal'));
}

async function loadSchool() {
  if (!schoolCode) {
    document.getElementById('schoolBadge').textContent = '统一服务入口';
    document.getElementById('schoolEyebrow').textContent = '统一服务入口';
    document.getElementById('modalSchool').textContent = '请选择学校后继续';
    return;
  }
  try {
    const response = await fetch(`/api/schools/${encodeURIComponent(schoolCode)}`);
    const payload = await readJson(response, '学校入口加载失败，请重新扫描二维码');
    if (!response.ok) throw new Error(payload.error || '学校二维码无效或已停用');
    school = payload.school;
    selectedSchoolCode.value = school.code;
    schoolSearch.value = school.name;
    const colleges = school.colleges || [];
    collegeSelect.innerHTML = colleges.map((college) => `<option value="${college}">${college}</option>`).join('') + '<option value="其他">其他学院</option>';
    collegeCustom.hidden = colleges.length > 0;
    collegeCustom.required = false;
    document.title = `${school.name} · 校园通信服务`;
    document.getElementById('schoolBadge').textContent = `${school.name}专属服务`;
    document.getElementById('schoolEyebrow').textContent = `${school.name}专属服务`;
    document.getElementById('modalSchool').textContent = `${school.name}校园通信服务`;
  } catch (error) {
    document.getElementById('schoolBadge').textContent = '学校入口无效';
    showToast(userError(error), true);
  }
}

document.querySelectorAll('[data-open]').forEach((button) => {
  button.addEventListener('click', () => setService(button.dataset.open, button.dataset.kind));
});
document.getElementById('openNumberPickerButton')?.addEventListener('click', async () => {
  if (!selectedSchoolCode.value) return showToast('请先选择学校', true);
  openModal(document.getElementById('numberPickerModal'));
  await loadNumberOffers();
});
document.getElementById('confirmNumberButton')?.addEventListener('click', () => {
  if (!document.getElementById('selectedOfferId').value) return showToast('请先选择一个号码', true);
  closeModals();
  openModal(serviceModal);
});
document.getElementById('lookupButton').addEventListener('click', () => openModal(lookupModal));
document.getElementById('lookupResults').addEventListener('click', (event) => {
  const button = event.target.closest('[data-completion-record]');
  if (button) openCompletion(button.dataset.completionRecord);
});
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeModals));
document.querySelectorAll('.modal-backdrop').forEach((modal) => {
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModals(); });
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModals(); });

const schoolSearch = document.getElementById('schoolSearch');
const schoolResults = document.getElementById('schoolResults');
const selectedSchoolCode = document.getElementById('selectedSchoolCode');
const collegeSelect = document.getElementById('collegeSelect');
const collegeCustom = document.getElementById('collegeCustom');
let schoolSearchTimer;
schoolSearch?.addEventListener('input', () => {
  selectedSchoolCode.value = '';
  clearTimeout(schoolSearchTimer);
  schoolSearchTimer = setTimeout(async () => {
    const query = schoolSearch.value.trim();
    if (query.length < 2) { schoolResults.replaceChildren(); return; }
    try { const response = await fetch(`/api/schools?q=${encodeURIComponent(query)}`); const result = await readJson(response, '学校查询失败'); schoolResults.innerHTML = result.schools.map((item) => `<button type="button" data-school-code="${item.code}">${item.name}</button>`).join('') || '<span>未匹配到学校</span>'; schoolResults._schools = result.schools; } catch { schoolResults.innerHTML = '<span>学校查询失败</span>'; }
  }, 200);
});
schoolResults?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-school-code]'); if (!button) return;
  const item = schoolResults._schools.find((schoolItem) => schoolItem.code === button.dataset.schoolCode);
  selectedSchoolCode.value = item.code; schoolCode = item.code; school = item; schoolSearch.value = item.name; schoolResults.replaceChildren();
  document.getElementById('schoolBadge').textContent = `${item.name}服务入口`;
  const colleges = item.colleges || []; collegeSelect.innerHTML = colleges.map((college) => `<option value="${college}">${college}</option>`).join('') + '<option value="其他">其他学院</option>';
  collegeCustom.hidden = colleges.length > 0; collegeCustom.required = false;
  if (selectedService.title.includes('选号')) loadNumberOffers();
});
collegeSelect?.addEventListener('change', () => { collegeCustom.hidden = collegeSelect.value !== '其他'; collegeCustom.required = collegeSelect.value === '其他'; });

serviceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedSchoolCode.value) return showToast('请先搜索并选择学校', true);
  const submitButton = serviceForm.querySelector('[type="submit"]');
  const formData = new FormData(serviceForm);
  const payload = Object.fromEntries(formData.entries());
  payload.schoolCode = document.getElementById('selectedSchoolCode').value || schoolCode;
  payload.college = payload.college === '其他' ? String(payload.collegeCustom || '').trim() : payload.college;
  payload.idCardFrontImage = await imageDataUrl(formData.get('idCardFront'));
  payload.idCardBackImage = await imageDataUrl(formData.get('idCardBack'));
  payload.type = selectedService.title;
  payload.marketingConsent = formData.get('marketingConsent') === 'on';

  submitButton.disabled = true;
  submitButton.textContent = '正在提交...';
  try {
    const endpoint = selectedService.kind === 'ticket' ? '/api/tickets' : '/api/orders';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await readJson(response, '提交失败，请稍后再试');
    if (!response.ok) throw new Error(result.error || '提交失败，请稍后再试');
    serviceForm.reset();
    closeModals();
    showToast(`提交成功，服务编号：${result.record.id}`);
  } catch (error) {
    showToast(userError(error), true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = selectedService.kind === 'ticket' ? '提交工单' : '提交预约';
  }
});

document.getElementById('nextServiceStepButton')?.addEventListener('click', () => {
  const required = ['name', 'schoolSearch', 'selectedSchoolCode', 'idCard', 'college', 'phone', 'idCardFront', 'idCardBack'];
  const missing = required.find((name) => { const field = serviceForm.elements[name]; return !field || (field.type === 'file' ? !field.files.length : !String(field.value || '').trim()); });
  if (missing) return showToast('请先完成学生信息、学校、学院、身份证和联系电话填写', true);
  if (serviceForm.elements.backupPhone.value && !/^1\d{10}$/.test(serviceForm.elements.backupPhone.value.trim())) return showToast('备用联系电话格式不正确', true);
  document.getElementById('studentInfoStep').hidden = true;
  document.getElementById('serviceOptionsStep').hidden = false;
});
document.getElementById('previousServiceStepButton')?.addEventListener('click', () => {
  document.getElementById('studentInfoStep').hidden = false;
  document.getElementById('serviceOptionsStep').hidden = true;
});

lookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = lookupForm.querySelector('[type="submit"]');
  const formData = new FormData(lookupForm);
  const resultsTarget = document.getElementById('lookupResults');
  if (resultsTarget) resultsTarget.innerHTML = '';
  submitButton.disabled = true;
  submitButton.textContent = '查询中...';
  try {
    const response = await fetch('/api/student/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ schoolCode, phone: formData.get('phone'), password: formData.get('password'), code: formData.get('code') })
    });
    const result = await readJson(response, '查询失败，请稍后再试');
    if (!response.ok) throw new Error(result.error || '查询失败');
    renderRecords(result.records);
  } catch (error) {
    if (resultsTarget) resultsTarget.innerHTML = '';
    showToast(userError(error), true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = '查询进度';
  }
});

document.getElementById('sendCodeButton')?.addEventListener('click', async () => {
  const phone = lookupForm.elements.phone.value.trim();
  const button = document.getElementById('sendCodeButton');
  button.disabled = true;
  try {
    await requestCode(phone, 'query');
    startCodeCooldown(button);
  } catch (error) {
    showToast(userError(error), true);
    button.disabled = false;
  }
});

document.getElementById('sendSubmitCodeButton')?.addEventListener('click', async () => {
  const phone = serviceForm.elements.phone.value.trim();
  const button = document.getElementById('sendSubmitCodeButton');
  button.disabled = true;
  try {
    await requestCode(phone, 'submit');
    startCodeCooldown(button);
  } catch (error) {
    showToast(userError(error), true);
    button.disabled = false;
  }
});

document.getElementById('sendCompletionCodeButton')?.addEventListener('click', async () => {
  const phone = lookupForm.elements.phone.value.trim();
  const button = document.getElementById('sendCompletionCodeButton');
  button.disabled = true;
  try {
    await requestCode(phone, 'confirm');
    startCodeCooldown(button);
  } catch (error) {
    showToast(userError(error), true);
    button.disabled = false;
  }
});

completionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = completionForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const response = await fetch('/api/student/confirm-completion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolCode, phone: lookupForm.elements.phone.value.trim(), ...Object.fromEntries(new FormData(completionForm).entries()) })
    });
    const result = await readJson(response, '确认失败，请稍后再试');
    if (!response.ok) throw new Error(result.error || '确认失败');
    closeModals();
    showToast('已确认完成，感谢您的评价');
  } catch (error) {
    showToast(userError(error), true);
  } finally {
    button.disabled = false;
  }
});

loadSchool();

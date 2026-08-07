const pathParts = location.pathname.split('/').filter(Boolean);
const schoolCode = (pathParts[0] === 'q' || pathParts[0] === 'service') && pathParts[1] ? decodeURIComponent(pathParts[1]) : 'XXU-2026';
const toast = document.getElementById('toast');
const serviceModal = document.getElementById('serviceModal');
const lookupModal = document.getElementById('lookupModal');
const serviceForm = document.getElementById('serviceForm');
const lookupForm = document.getElementById('lookupForm');
const completionForm = document.getElementById('completionForm');

let school = null;
let selectedService = { title: '校园网账号预约', kind: 'order' };

async function loadNumberOffers() {
  const select = document.getElementById('numberOfferSelect');
  select.replaceChildren(new Option('正在加载可选号码...', ''));
  try {
    const response = await fetch(`/api/schools/${encodeURIComponent(schoolCode)}/numbers`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '号码资源暂不可用');
    select.replaceChildren(new Option(payload.offers.length ? '请选择意向号码' : '当前没有可选号码', ''));
    payload.offers.forEach((offer) => select.add(new Option(`${offer.displayNumber} · ${offer.planName} · ${offer.monthlyFee} 元/月`, offer.id)));
  } catch (error) {
    select.replaceChildren(new Option('号码加载失败，请稍后重试', ''));
    showToast(error.message, true);
  }
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
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
  const result = await response.json();
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
  document.getElementById('fulfillmentNote').hidden = !isNumberOrder;
  if (isNumberOrder) loadNumberOffers();
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
      <div><strong>${record.type}</strong><small>${record.id} · ${formatTime(record.createdAt)}</small></div>
      <span class="status-chip ${record.status}">${statusLabel(record.status)}</span>
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
  try {
    const response = await fetch(`/api/schools/${encodeURIComponent(schoolCode)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || '学校二维码无效或已停用');
    school = payload.school;
    document.title = `${school.name} · 校园通信服务`;
    document.getElementById('schoolBadge').textContent = `${school.name}专属服务`;
    document.getElementById('schoolEyebrow').textContent = `${school.name}专属服务`;
    document.getElementById('modalSchool').textContent = `${school.name}校园通信服务`;
  } catch (error) {
    document.getElementById('schoolBadge').textContent = '学校入口无效';
    showToast(error.message, true);
  }
}

document.querySelectorAll('[data-open]').forEach((button) => {
  button.addEventListener('click', () => setService(button.dataset.open, button.dataset.kind));
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

serviceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!school) return showToast('学校信息尚未加载，请稍后重试', true);
  const submitButton = serviceForm.querySelector('[type="submit"]');
  const formData = new FormData(serviceForm);
  const payload = Object.fromEntries(formData.entries());
  payload.schoolCode = schoolCode;
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
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '提交失败，请稍后再试');
    serviceForm.reset();
    closeModals();
    showToast(`提交成功，服务编号：${result.record.id}`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = selectedService.kind === 'ticket' ? '提交工单' : '提交预约';
  }
});

lookupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = lookupForm.querySelector('[type="submit"]');
  const formData = new FormData(lookupForm);
  submitButton.disabled = true;
  submitButton.textContent = '查询中...';
  try {
    const response = await fetch('/api/student/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolCode, phone: formData.get('phone'), code: formData.get('code') })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '查询失败');
    renderRecords(result.records);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = '查询进度';
  }
});

document.getElementById('sendCodeButton').addEventListener('click', async () => {
  const phone = lookupForm.elements.phone.value.trim();
  const button = document.getElementById('sendCodeButton');
  button.disabled = true;
  try {
    await requestCode(phone, 'query');
    startCodeCooldown(button);
  } catch (error) {
    showToast(error.message, true);
    button.disabled = false;
  }
});

document.getElementById('sendSubmitCodeButton').addEventListener('click', async () => {
  const phone = serviceForm.elements.phone.value.trim();
  const button = document.getElementById('sendSubmitCodeButton');
  button.disabled = true;
  try {
    await requestCode(phone, 'submit');
    startCodeCooldown(button);
  } catch (error) {
    showToast(error.message, true);
    button.disabled = false;
  }
});

document.getElementById('sendCompletionCodeButton').addEventListener('click', async () => {
  const phone = lookupForm.elements.phone.value.trim();
  const button = document.getElementById('sendCompletionCodeButton');
  button.disabled = true;
  try {
    await requestCode(phone, 'confirm');
    startCodeCooldown(button);
  } catch (error) {
    showToast(error.message, true);
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
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '确认失败');
    closeModals();
    showToast('已确认完成，感谢您的评价');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

loadSchool();

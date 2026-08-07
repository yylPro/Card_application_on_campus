const toast = document.getElementById('toast');
const statusOptions = [
  ['pending', '待受理'],
  ['contacting', '联系中'],
  ['assigned', '已派单'],
  ['scheduled', '已预约'],
  ['processing', '处理中'],
  ['completed', '已完成'],
  ['cancelled', '已取消']
];
const verificationOptions = [
  ['pending_manual', '待人工核验'],
  ['verified', '核验通过'],
  ['rejected', '核验不通过'],
  ['not_required', '无需核验']
];
let overview = null;
let activeFilter = 'all';

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error('网络连接失败，请检查网络后重试');
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(response.status >= 500 ? '服务暂时不可用，请稍后重试' : '服务响应异常，请稍后重试');
  }
  if (response.status === 401) {
    location.replace('/admin/login');
    throw new Error('登录已失效');
  }
  if (!response.ok) throw new Error(body.error || '请求失败');
  return body;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[char]);
}

function formatTime(iso) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
}

function toDateTimeLocal(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function labelFrom(options, value) {
  return options.find(([key]) => key === value)?.[1] || value;
}

function optionMarkup(options, selected) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`).join('');
}

function allRecords() {
  return [
    ...(overview.orders || []).map((item) => ({ ...item, category: 'order' })),
    ...(overview.tickets || []).map((item) => ({ ...item, category: 'ticket' }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function renderSchools(schools) {
  document.getElementById('schoolList').innerHTML = schools.map((school) => {
    const qrUrl = `/api/admin/qr/${encodeURIComponent(school.code)}`;
    const entry = `${location.origin}/q/${encodeURIComponent(school.code)}`;
    const enabled = school.status === 'active';
    const verification = { manual: '人工核验', api: '学校接口核验', none: '无需核验' }[school.verificationMode] || '人工核验';
    return `<article class="school-card">
      <img src="${qrUrl}" alt="${escapeHtml(school.name)}服务二维码" />
      <div class="school-card-main">
        <div>
          <span class="status-chip ${enabled ? 'completed' : 'cancelled'}">${enabled ? '启用中' : '已停用'}</span>
          <h3>${escapeHtml(school.name)}</h3>
          <p>${escapeHtml(entry)}</p>
          <p class="school-meta">资格核验：${verification} · 累计入口访问：${school.scans || 0}</p>
        </div>
        <div class="school-actions">
          <a class="outline-button" href="${qrUrl}" download="${escapeHtml(school.code)}-二维码.png">下载二维码</a>
          <button class="text-button" data-copy="${escapeHtml(entry)}">复制链接</button>
          <button class="text-button" data-school-status="${escapeHtml(school.code)}" data-next-status="${enabled ? 'disabled' : 'active'}">${enabled ? '停用入口' : '启用入口'}</button>
        </div>
      </div>
    </article>`;
  }).join('') || '<p class="empty-state">暂未创建学校入口。</p>';
}

function renderRecords() {
  const rows = activeFilter === 'all' ? allRecords() : allRecords().filter((record) => record.category === activeFilter);
  const table = document.getElementById('recordsTable');
  if (!rows.length) {
    table.innerHTML = '<p class="empty-state">暂无服务记录。</p>';
    return;
  }
  table.innerHTML = `<div class="record-row record-table-head"><span>学生/学校</span><span>服务事项</span><span>预约信息</span><span>状态</span><span>操作</span></div>${rows.map((record) => `
    <article class="record-row">
      <span><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.schoolName)} · ${escapeHtml(record.phone)}</small></span>
      <span><strong>${escapeHtml(record.type)}</strong><small>${escapeHtml(record.detail)}</small></span>
      <span><strong>${escapeHtml(record.appointment)}</strong><small>${formatTime(record.createdAt)}</small></span>
      <span><span class="status-chip ${escapeHtml(record.status)}">${labelFrom(statusOptions, record.status)}</span><small>${labelFrom(verificationOptions, record.verificationStatus)}</small></span>
      <span><button class="outline-button record-open" data-record="${escapeHtml(record.id)}" data-category="${record.category}">处理</button></span>
    </article>
  `).join('')}`;
}

function renderNumberOffers(offers) {
  const target = document.getElementById('numberOfferList');
  target.innerHTML = offers.map((offer) => `<article class="number-offer"><div><strong>${escapeHtml(offer.displayNumber)}</strong><small>${escapeHtml(offer.planName)} · ${escapeHtml(offer.schoolCode)}</small></div><div><strong>${escapeHtml(String(offer.monthlyFee))} 元/月</strong><span class="status-chip ${offer.status === 'available' ? 'completed' : 'pending'}">${offer.status === 'available' ? '可选' : '已预占'}</span></div></article>`).join('') || '<p class="empty-state">暂无号码资源。</p>';
}

function renderOverview(data) {
  overview = data;
  document.getElementById('metricScans').textContent = data.metrics.scans;
  document.getElementById('metricOrders').textContent = data.metrics.orders;
  document.getElementById('metricTickets').textContent = data.metrics.tickets;
  document.getElementById('metricSchools').textContent = data.metrics.activeSchools;
  document.getElementById('metricNumbers').textContent = data.metrics.availableNumbers;
  renderSchools(data.schools);
  renderNumberOffers(data.numberOffers || []);
  const schoolSelect = document.getElementById('numberOfferSchool');
  schoolSelect.innerHTML = data.schools.filter((school) => school.status === 'active').map((school) => `<option value="${escapeHtml(school.code)}">${escapeHtml(school.name)}</option>`).join('');
  renderRecords();
}

async function loadOverview() {
  renderOverview(await api('/api/admin/overview'));
}

function closeModals() {
  document.querySelectorAll('.modal-backdrop').forEach((modal) => { modal.hidden = true; });
  document.body.classList.remove('modal-open');
}

function openModal(id) {
  document.getElementById(id).hidden = false;
  document.body.classList.add('modal-open');
}

function openRecord(id, category) {
  const record = allRecords().find((item) => item.id === id && item.category === category);
  if (!record) return showToast('未找到该服务记录', true);
  document.getElementById('recordModalType').textContent = category === 'order' ? '预约订单详情' : '维修工单详情';
  document.getElementById('recordModalTitle').textContent = `${record.type} · ${record.id}`;
  const isNumberOrder = category === 'order' && record.type.includes('选号');
  document.getElementById('recordDetail').innerHTML = `
    <dl>
      <div><dt>学生</dt><dd>${escapeHtml(record.name)}（${escapeHtml(record.studentNo)}）</dd></div>
      <div><dt>手机</dt><dd>${escapeHtml(record.phone)}</dd></div>
      <div><dt>学校</dt><dd>${escapeHtml(record.schoolName)}</dd></div>
      <div><dt>服务地址</dt><dd>${escapeHtml(record.address)}</dd></div>
      <div><dt>期望时间</dt><dd>${escapeHtml(record.appointment)}</dd></div>
      <div><dt>负责人</dt><dd>${escapeHtml(record.assignee || '待派单')}</dd></div>
      <div><dt>预约服务</dt><dd>${record.scheduledAt ? formatTime(record.scheduledAt) : '待确认'}</dd></div>
      <div><dt>提交时间</dt><dd>${formatTime(record.createdAt)}</dd></div>
      <div class="wide"><dt>需求说明</dt><dd>${escapeHtml(record.detail)}</dd></div>
      <div class="wide"><dt>营销授权</dt><dd>${record.marketingConsent ? '已单独同意接收优惠信息' : '未授权营销触达'}</dd></div>
      <div class="wide"><dt>处理结果</dt><dd>${escapeHtml(record.serviceResult || '待处理')}</dd></div>
      <div class="wide"><dt>学生确认</dt><dd>${record.completionConfirmedAt ? `${formatTime(record.completionConfirmedAt)} · ${record.rating} 星${record.ratingComment ? ` · ${escapeHtml(record.ratingComment)}` : ''}` : '尚未确认'}</dd></div>
      ${isNumberOrder ? `<div><dt>意向号码</dt><dd>${escapeHtml(record.selectedNumber || '待工作人员推荐')}</dd></div><div><dt>交付方式</dt><dd>${escapeHtml(record.fulfillmentMethod || '待确认')}</dd></div>` : ''}
      ${isNumberOrder ? `<div><dt>配送信息</dt><dd>${escapeHtml(record.deliveryCarrier || '待交接')} ${escapeHtml(record.deliveryTrackingNo || '')}</dd></div><div><dt>补贴</dt><dd>${escapeHtml(record.subsidyStatus || 'not_applicable')} ${record.subsidyAmount ? `${record.subsidyAmount} 元` : ''}</dd></div>` : ''}
    </dl>
  `;
  const form = document.getElementById('recordForm');
  form.elements.id.value = record.id;
  form.elements.category.value = category;
  form.elements.status.innerHTML = optionMarkup(statusOptions, record.status);
  form.elements.verificationStatus.innerHTML = optionMarkup(verificationOptions, record.verificationStatus);
  form.querySelectorAll('.order-only').forEach((element) => { element.hidden = !isNumberOrder; });
  form.elements.deliveryStatus.value = record.deliveryStatus || 'not_applicable';
  form.elements.activationStatus.value = record.activationStatus || 'not_applicable';
  form.elements.subsidyStatus.value = record.subsidyStatus || 'not_applicable';
  form.elements.subsidyAmount.value = record.subsidyAmount || '';
  form.elements.assignee.value = record.assignee || '';
  form.elements.scheduledAt.value = toDateTimeLocal(record.scheduledAt);
  form.elements.deliveryCarrier.value = record.deliveryCarrier || '';
  form.elements.deliveryTrackingNo.value = record.deliveryTrackingNo || '';
  form.elements.serviceResult.value = record.serviceResult || '';
  form.elements.internalNote.value = record.internalNote || '';
  openModal('recordModal');
}

document.getElementById('newSchoolButton').addEventListener('click', () => openModal('schoolModal'));
document.getElementById('newNumberOfferButton').addEventListener('click', () => openModal('numberOfferModal'));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeModals));
document.querySelectorAll('.modal-backdrop').forEach((modal) => {
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModals(); });
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModals(); });

document.getElementById('logoutButton').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  location.replace('/admin/login');
});
document.getElementById('exportButton').addEventListener('click', () => { location.assign('/api/admin/export'); });
document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item === button));
    renderRecords();
  });
});

document.getElementById('schoolList').addEventListener('click', async (event) => {
  const copyButton = event.target.closest('[data-copy]');
  const statusButton = event.target.closest('[data-school-status]');
  if (copyButton) {
    try {
      await navigator.clipboard.writeText(copyButton.dataset.copy);
      showToast('学校服务链接已复制');
    } catch {
      showToast('复制失败，请手动复制链接', true);
    }
  }
  if (statusButton) {
    try {
      await api(`/api/admin/schools/${encodeURIComponent(statusButton.dataset.schoolStatus)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusButton.dataset.nextStatus })
      });
      showToast(statusButton.dataset.nextStatus === 'active' ? '学校二维码入口已启用' : '学校二维码入口已停用');
      await loadOverview();
    } catch (error) {
      showToast(error.message, true);
    }
  }
});

document.getElementById('recordsTable').addEventListener('click', (event) => {
  const button = event.target.closest('[data-record]');
  if (button) openRecord(button.dataset.record, button.dataset.category);
});

document.getElementById('schoolForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form).entries());
  const name = String(values.name || '').trim();
  const code = String(values.code || '').trim();
  const servicePhone = String(values.servicePhone || '').trim();
  if (!name) return showToast('请输入学校名称', true);
  if (!/^[A-Za-z0-9-]{3,40}$/.test(code)) return showToast('学校代码需为 3 至 40 位字母、数字或短横线', true);
  if (!servicePhone) return showToast('请输入服务电话', true);
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/admin/schools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values)
    });
    form.reset();
    closeModals();
    showToast('学校二维码已生成');
    await loadOverview();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('recordForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());
  button.disabled = true;
  try {
    await api(`/api/admin/records/${encodeURIComponent(data.category)}/${encodeURIComponent(data.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: data.status,
        verificationStatus: data.verificationStatus,
        internalNote: data.internalNote,
        deliveryStatus: data.deliveryStatus,
        activationStatus: data.activationStatus,
        subsidyStatus: data.subsidyStatus,
        subsidyAmount: data.subsidyAmount,
        assignee: data.assignee,
        scheduledAt: data.scheduledAt,
        deliveryCarrier: data.deliveryCarrier,
        deliveryTrackingNo: data.deliveryTrackingNo,
        serviceResult: data.serviceResult
      })
    });
    closeModals();
    showToast('处理结果已保存');
    await loadOverview();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('numberOfferForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/admin/number-offers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
    form.reset();
    closeModals();
    showToast('号码资源已录入');
    await loadOverview();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
  }
});

fetch('/api/auth/session')
  .then((response) => response.json())
  .then((session) => {
    if (!session.authenticated) location.replace('/admin/login');
    else loadOverview().catch((error) => showToast(error.message, true));
  })
  .catch(() => location.replace('/admin/login'));

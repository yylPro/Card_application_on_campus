const pathParts = location.pathname.split('/').filter(Boolean);
let schoolCode = (pathParts[0] === 'q' || pathParts[0] === 'service') && pathParts[1] ? decodeURIComponent(pathParts[1]) : '';
if (schoolCode === 'UNIFIED-2026') schoolCode = '';
const serviceModal = document.getElementById('serviceModal');
const lookupModal = document.getElementById('lookupModal');
const serviceForm = document.getElementById('serviceForm');
const lookupForm = document.getElementById('lookupForm');
const toast = document.getElementById('toast');
const selectedSchoolCode = document.getElementById('selectedSchoolCode');
const schoolSearch = document.getElementById('schoolSearch');
const schoolResults = document.getElementById('schoolResults');
const collegeSelect = document.getElementById('collegeSelect');
let selectedSchool = null;

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
function showToast(message, error = false) { toast.textContent = message; toast.classList.toggle('error', error); toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3200); }
function openModal(modal) { modal.hidden = false; document.body.classList.add('modal-open'); }
function closeModals() { document.querySelectorAll('.modal-backdrop').forEach((modal) => { modal.hidden = true; }); document.body.classList.remove('modal-open'); }
async function json(response, fallback) { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || fallback); return body; }

function fillSchool(school) {
  if (!school) return;
  selectedSchool = school; schoolCode = school.code; selectedSchoolCode.value = school.code; schoolSearch.value = school.name; schoolResults.replaceChildren();
  collegeSelect.innerHTML = (school.colleges || []).map((college) => `<option value="${escapeHtml(college)}">${escapeHtml(college)}</option>`).join('') || '<option value="">暂无学院信息</option>';
  document.getElementById('schoolBadge').textContent = `${school.name}服务入口`;
  document.getElementById('modalSchool').textContent = `${school.name}校园通信服务`;
}
async function loadSchool() {
  if (!schoolCode) { document.getElementById('schoolBadge').textContent = '统一服务入口'; return; }
  try { fillSchool((await (await fetch(`/api/schools/${encodeURIComponent(schoolCode)}`)).json()).school); } catch { showToast('学校入口无效，请重新选择学校', true); schoolCode = ''; }
}
let searchTimer;
schoolSearch.addEventListener('input', () => {
  selectedSchoolCode.value = ''; selectedSchool = null; clearTimeout(searchTimer);
  const query = schoolSearch.value.trim();
  if (!query) return schoolResults.replaceChildren();
  searchTimer = setTimeout(async () => {
    try { const result = await (await fetch(`/api/schools?q=${encodeURIComponent(query)}`)).json(); schoolResults.innerHTML = (result.schools || []).map((school) => `<button type="button" data-school-code="${escapeHtml(school.code)}">${escapeHtml(school.name)}</button>`).join('') || '<span>未找到匹配学校</span>'; schoolResults._schools = result.schools || []; }
    catch { schoolResults.innerHTML = '<span>学校列表加载失败</span>'; }
  }, 180);
});
schoolResults.addEventListener('click', (event) => { const button = event.target.closest('[data-school-code]'); if (button) fillSchool(schoolResults._schools.find((school) => school.code === button.dataset.schoolCode)); });
function setStudentForm() {
  const currentSchool = selectedSchool;
  serviceForm.reset();
  if (currentSchool) fillSchool(currentSchool);
  document.getElementById('modalTitle').textContent = '校园账号预约';
  document.getElementById('modalIntro').textContent = '提交后，运营商会安排线下实名核验并提供特征码。';
  document.querySelector('.submit-button').textContent = '提交预约';
  openModal(serviceModal);
}
document.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => button.dataset.kind === 'lookup' ? openModal(lookupModal) : setStudentForm()));
document.getElementById('staffEntryButton').addEventListener('click', () => { location.assign('/staff'); });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', closeModals));
document.querySelectorAll('.modal-backdrop').forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) closeModals(); }));
serviceForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!selectedSchoolCode.value) return showToast('请先选择学校', true);
  const data = Object.fromEntries(new FormData(serviceForm).entries());
  if (!data.name || !data.idCard || !data.college || !/^1\d{10}$/.test(data.phone)) return showToast('请完整填写姓名、身份证号、学院和联系电话', true);
  if (!/^[0-9]{17}[0-9Xx]$/.test(data.idCard)) return showToast('身份证号格式不正确', true);
  data.schoolCode = selectedSchoolCode.value; data.type = '校园账号预约'; data.detail = '校园账号预约'; data.marketingConsent = false;
  const button = serviceForm.querySelector('[type="submit"]'); button.disabled = true; button.textContent = '正在提交...';
  try { const result = await json(await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), '提交失败，请稍后重试'); serviceForm.reset(); closeModals(); showToast(`提交成功，服务编号：${result.record.id}`); } catch (error) { showToast(error.message, true); } finally { button.disabled = false; button.textContent = '提交预约'; }
});
function statusText(record) { return ({ pending: '待受理', contacting: '联系中', assigned: '已派单', scheduled: '已预约', processing: '处理中', completed: '已完成', cancelled: '已取消' })[record.status] || record.status; }
function renderRecords(records) {
  const target = document.getElementById('lookupResults');
  target.innerHTML = records.length ? records.map((record) => `<article class="record-item"><div><strong>${escapeHtml(record.type)}</strong><small>${escapeHtml(record.id)}</small></div><span class="status-chip">${escapeHtml(statusText(record))}</span>${record.offline ? `<div class="offline-instruction ${record.verificationStatus === 'verified' ? 'verified' : ''}"><strong>${record.verificationStatus === 'verified' ? '已完成实名核验' : '请前往线下实名核验'}</strong><span>${escapeHtml(record.offline.location || '等待运营商分配地址')}</span><code>${escapeHtml(record.offline.featureCode || '待分配')}</code></div>` : '<small>线下地址和特征码待运营商分配</small>'}<small>激活状态：${escapeHtml(record.activationStatus === 'activated' ? '已激活' : record.activationStatus === 'pending_merchant' ? '待商家激活' : '待处理')}</small></article>`).join('') : '<p class="empty-state">暂无办理记录。</p>';
}
lookupForm.addEventListener('submit', async (event) => { event.preventDefault(); const data = Object.fromEntries(new FormData(lookupForm).entries()); try { const result = await json(await fetch('/api/student/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: data.phone, password: data.password }) }), '查询失败，请稍后重试'); renderRecords(result.records || []); } catch (error) { showToast(error.message, true); } });
// 学生端与小程序一致，打开服务入口即可预约，不强制跳转学生登录页。
loadSchool();

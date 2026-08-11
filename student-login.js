const form = document.getElementById('studentAuthForm');
const registering = location.pathname === '/student/register';
const toast = document.getElementById('toast');
const confirmLabel = document.getElementById('confirmLabel');
if (registering) {
  document.getElementById('pageTitle').textContent = '注册办理账户';
  document.getElementById('submitButton').textContent = '注册并进入办理';
  confirmLabel.hidden = false;
  form.elements.confirmPassword.required = true;
  document.getElementById('switchHint').innerHTML = '已有账户？<a href="/student/login">直接登录</a>';
}
function show(message, error = false) { toast.textContent = message; toast.classList.toggle('error', error); toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3200); }
fetch('/api/student/session').then((r) => r.json()).then((data) => { if (data.authenticated) location.replace('/service'); }).catch(() => {});
form.addEventListener('submit', async (event) => {
  event.preventDefault(); const button = document.getElementById('submitButton'); button.disabled = true;
  try { const response = await fetch(registering ? '/api/student/register' : '/api/student/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '操作失败，请稍后重试'); location.replace('/service'); }
  catch (error) { show(error.message || '网络连接失败，请稍后重试', true); } finally { button.disabled = false; }
});

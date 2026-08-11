const form = document.getElementById('offlineRegisterForm');
const toast = document.getElementById('toast');

fetch('/api/offline/session').then((response) => response.json()).then((session) => { if (!session.registrationEnabled) location.replace('/offline/login'); }).catch(() => {});

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('error', 'show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  if (data.password !== data.confirmPassword) return showToast('两次输入的密码不一致');
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = '注册中...';
  try {
    const response = await fetch('/api/offline/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '注册失败');
    location.replace('/offline');
  } catch (error) {
    showToast(error.message || '网络连接失败，请稍后重试');
  } finally {
    button.disabled = false;
    button.textContent = '注册并进入实体端';
  }
});

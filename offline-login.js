const form = document.getElementById('offlineLoginForm');
const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('error', 'show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

fetch('/api/offline/session')
  .then((response) => response.json())
  .then((session) => {
    if (session.authenticated) location.replace('/offline');
    if (!session.registrationEnabled) document.querySelector('.login-hint')?.remove();
  })
  .catch(() => {});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = '登录中...';
  try {
    const response = await fetch('/api/offline/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '登录失败');
    location.replace('/offline');
  } catch (error) {
    showToast(error.message || '网络连接失败，请稍后重试');
  } finally {
    button.disabled = false;
    button.textContent = '登录实体端';
  }
});

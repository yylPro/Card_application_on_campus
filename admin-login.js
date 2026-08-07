const form = document.getElementById('loginForm');
const toast = document.getElementById('toast');

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

fetch('/api/auth/session')
  .then((response) => response.json())
  .then((session) => { if (session.authenticated) location.replace('/admin'); })
  .catch(() => {});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = '登录中...';
  try {
    let response;
    try {
      response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
    } catch {
      throw new Error('网络连接失败，请检查网络后重试');
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(response.status >= 500 ? '登录服务暂时不可用，请稍后重试' : '登录响应异常，请稍后重试');
    }
    if (!response.ok) throw new Error(result.error || '登录失败');
    location.replace('/admin');
  } catch (error) {
    showToast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = '登录后台';
  }
});

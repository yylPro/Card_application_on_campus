const token = location.pathname.split('/').filter(Boolean).pop();
const apiPath = `/api/redeem/${encodeURIComponent(token)}`;
const summary = document.getElementById('voucherSummary');
const form = document.getElementById('redeemForm');
const sendButton = document.getElementById('sendRedeemCode');
const confirmButton = document.getElementById('confirmRedeem');

async function call(path = '', options = {}) {
  const response = await fetch(`${apiPath}${path}`, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || '请求失败');
  return body;
}

async function load() {
  try {
    const voucher = await call();
    if (voucher.status !== 'issued') {
      summary.textContent = voucher.status === 'redeemed' ? '此凭证已核销，不能重复发卡。' : voucher.status === 'expired' ? '此凭证已过期。' : '此凭证不可使用。';
      return;
    }
    summary.textContent = `${voucher.schoolName} · ${voucher.operator || '校园通信服务'} · 原手机号 ${voucher.phone}`;
    form.hidden = false;
  } catch (error) { summary.textContent = error.message; }
}

sendButton.addEventListener('click', async () => {
  sendButton.disabled = true;
  try { await call('/request-code', { method: 'POST' }); sendButton.textContent = '验证码已发送'; }
  catch (error) { summary.textContent = error.message; sendButton.disabled = false; }
});

confirmButton.addEventListener('click', async () => {
  confirmButton.disabled = true;
  try {
    await call('/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: document.getElementById('redeemCode').value.trim(), redeemedBy: document.getElementById('redeemedBy').value.trim() }) });
    form.hidden = true;
    summary.textContent = '核销成功，凭证已失效。请完成电话卡交付。';
  } catch (error) { summary.textContent = error.message; confirmButton.disabled = false; }
});

load();

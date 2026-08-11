const dispatchParts = location.pathname.split('/').filter(Boolean);
const dispatchSchoolCode = dispatchParts[0] === 'q' ? decodeURIComponent(dispatchParts[1] || '') : 'UNIFIED-2026';
const isWechat = /MicroMessenger/i.test(navigator.userAgent);
const h5Entry = document.getElementById('h5Entry');
const dispatchActions = document.getElementById('dispatchActions');

function showH5Only(message) {
  document.getElementById('dispatchMessage').textContent = message;
  dispatchActions.hidden = false;
}

function openH5(entry, message) {
  h5Entry.href = entry.h5Path;
  showH5Only(`${message} 正在进入网页版服务...`);
  location.replace(entry.h5Path);
}

function loadWechatSdk() {
  return new Promise((resolve, reject) => {
    if (window.wx) return resolve(window.wx);
    const script = document.createElement('script');
    script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
    script.onload = () => resolve(window.wx);
    script.onerror = () => reject(new Error('微信组件加载失败'));
    document.head.appendChild(script);
  });
}

async function offerMiniProgram(entry) {
  const configResponse = await fetch(`/api/dispatch/${encodeURIComponent(dispatchSchoolCode)}/wechat-config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pageUrl: location.href.split('#')[0] })
  });
  const configPayload = await configResponse.json();
  if (!configResponse.ok) throw new Error(configPayload.error || '小程序暂不可用');
  const wx = await loadWechatSdk();
  wx.config({ ...configPayload.config, jsApiList: [], openTagList: ['wx-open-launch-weapp'] });
  wx.ready(() => {
    const launch = document.createElement('wx-open-launch-weapp');
    launch.setAttribute('username', entry.miniProgram.appId);
    launch.setAttribute('path', entry.miniProgram.path);
    launch.innerHTML = '<template><style>.launch{display:block;padding:11px 18px;border-radius:6px;background:#0b6cb7;color:#fff;text-align:center;font-size:15px;font-weight:700}</style><div class="launch">打开微信小程序办理</div></template>';
    launch.addEventListener('error', () => showH5Only('小程序未能打开，您可以继续使用网页版服务。'));
    document.getElementById('miniProgramLaunch').replaceChildren(launch);
    document.getElementById('dispatchMessage').textContent = '推荐使用微信小程序办理；网页端也可独立完成全部服务。';
    dispatchActions.hidden = false;
  });
  wx.error(() => showH5Only('小程序服务暂不可用，网页端仍可独立办理全部服务。'));
}

async function initDispatch() {
  if (!dispatchSchoolCode) return showH5Only('统一二维码入口无效，请联系工作人员。');
  try {
    const response = await fetch(`/api/dispatch/${encodeURIComponent(dispatchSchoolCode)}`);
    const entry = await response.json();
    if (!response.ok) throw new Error(entry.error || '学校二维码无效或已停用');
    const entryName = entry.school?.name || '统一服务入口';
    document.title = `${entryName} · 校园通信服务`;
    document.getElementById('dispatchEyebrow').textContent = entry.school ? `${entryName}专属服务入口` : '统一服务入口';
    document.getElementById('dispatchTitle').textContent = entry.school ? `${entryName}校园通信服务` : '扫码后选择学校办理';
    h5Entry.href = entry.h5Path;
    if (!isWechat) return openH5(entry, '当前环境不支持直接拉起小程序，网页端可独立办理全部服务。');
    if (!entry.miniProgram.enabled) return openH5(entry, '小程序服务尚未配置，网页端可独立办理全部服务。');
    await offerMiniProgram(entry);
  } catch (error) {
    document.getElementById('dispatchMessage').textContent = error.message;
    dispatchActions.hidden = false;
  }
}

initDispatch();

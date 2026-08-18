const cloud = require('wx-server-sdk');
const crypto = require('crypto');
let XLSX = null;
try { XLSX = require('xlsx'); } catch (error) { XLSX = null; }
let QRCode = null;
try { QRCode = require('qrcode'); } catch (error) { QRCode = null; }
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const schools = JSON.parse(Buffer.from('W3siY29kZSI6IkdYLTZCRDkwMTMyIiwibmFtZSI6IuWNl+WugeW4iOiMg+Wkp+Wtpu+8iOS6lOWQiOagoeWMuu+8iSIsImNvbGxlZ2VzIjpbIuaWh+WtpumZoiIsIuWIneetieaVmeiCsuWtpumZoiIsIue7j+a1juS4jueuoeeQhuWtpumZoiIsIuaWsOmXu+S4juS8oOaSreWtpumZoiIsIuaVmeiCsuenkeWtpuWtpumZoiIsIumprOWFi+aAneS4u+S5ieWtpumZoiIsIuazleWtpuS4juekvuS8muWtpumZoiJdLCJzdGF0dXMiOiJhY3RpdmUiLCJzZXJ2aWNlUGhvbmUiOiIxMDA4NiJ9LHsiY29kZSI6IkdYLUMyMTJGNEZDIiwibmFtZSI6IuW5v+ilv+S4reWMu+iNr+Wkp+Wtpu+8iOS6lOWQiOagoeWMuu+8iSIsImNvbGxlZ2VzIjpbIuesrOS4gOS4tOW6iiIsIuesrOS6jOS4tOW6iiIsIuaKpOeQhiIsIumSiOeBuOaOqOaLvyIsIumqqOS8pCIsIuWjruWMu+iNryIsIuWFrOWFseWNq+eUn+S4jueuoeeQhiIsIuiNr+WtpumZoiJdLCJzdGF0dXMiOiJhY3RpdmUiLCJzZXJ2aWNlUGhvbmUiOiIxMDA4NiJ9LHsiY29kZSI6IkdYLUREN0NFMDU0IiwibmFtZSI6IuW5v+ilv+itpuWvn+WtpumZou+8iOS7meiRq+agoeWMuu+8iSIsImNvbGxlZ2VzIjpbIuS+puafpeWtpumZoiIsIuWIkeS6i+enkeWtpuaKgOacr+WtpumZoiIsIuayu+WuieWtpumZoiIsIuS6pOmAmueuoeeQhuW3peeoi+WtpumZoiIsIuitpuWKoeWunuaImOWtpumZoiIsIuWPuOazleW6lOeUqOWtpumZoiIsIuazleWtpumZoiIsIuWFrOWFseeuoeeQhuWtpumZoiJdLCJzdGF0dXMiOiJhY3RpdmUiLCJzZXJ2aWNlUGhvbmUiOiIxMDA4NiJ9LHsiY29kZSI6IkdYLTAxQkQ3Mzk4IiwibmFtZSI6IuW5v+ilv+itpuWvn+WtpumZou+8iOS6lOWQiOagoeWMuu+8iSIsImNvbGxlZ2VzIjpbIuS/oeaBr+aKgOacr+WtpumZoiIsIuWPuOazleW6lOeUqOWtpumZoiIsIuazleWtpumZoiIsIuWFrOWFseeuoeeQhuWtpumZoiIsIuWkluWbveivreWtpumZoiJdLCJzdGF0dXMiOiJhY3RpdmUiLCJzZXJ2aWNlUGhvbmUiOiIxMDA4NiJ9LHsiY29kZSI6IkdYLTg1NURBNTQyIiwibmFtZSI6IuW5v+ilv+S4reWMu+iNr+Wkp+Wtpui1m+aBqeaWr+aWsOWMu+iNr+WtpumZoiIsImNvbGxlZ2VzIjpbIuWMu+WtpuezuyIsIuWMu+WtpuaKgOacr+ezuyIsIuaKpOeQhuezuyIsIuiNr+WtpuezuyIsIuWFrOWFseeuoeeQhuezuyIsIumprOWFi+aAneS4u+S5ieWtpumZoiJdLCJzdGF0dXMiOiJhY3RpdmUiLCJzZXJ2aWNlUGhvbmUiOiIxMDA4NiJ9LHsiY29kZSI6IkdYLTk4MDlGNjdCIiwibmFtZSI6IuW5v+ilv+WkluWbveivreWtpumZoiIsImNvbGxlZ2VzIjpbIuaWh+WtpumZoiIsIuaVsOWtl+enkeaKgOWtpumZoiIsIuS6uuW3peaZuuiDveWtpumZoiIsIuaVsOWtl+e7j+a1jueuoeeQhuWtpumZoiIsIuaVmeiCsuWtpumZoiIsIuS4nOWNl+S6muivreiogOaWh+WMluWtpumZoiIsIuasp+e+juivreiogOaWh+WMluWtpumZoiIsIuWkp+WBpeW6t+WtpumZoiIsIuS4nOebn+W6t+WFu+S6p+S4muWtpumZoiIsIuWbvemZheaVmeiCsuWtpumZoiIsIuS8muiuoeWtpumZoiIsIuS4nOebn+i0oueojuWtpumZoiIsIuWbvemZheS8oOWqkuWtpumZoiJdLCJzdGF0dXMiOiJhY3RpdmUiLCJzZXJ2aWNlUGhvbmUiOiIxMDA4NiJ9LHsiY29kZSI6IkdYLTE4NTNERTlDIiwibmFtZSI6IuW5v+ilv+WMu+enkeWkp+WtpiIsImNvbGxlZ2VzIjpbIuWfuuehgOWMu+WtpumZoiIsIuWFrOWFseWNq+eUn+WtpumZoiIsIuaKpOeQhuWtpumZoiIsIuiNr+WtpumZoiIsIuWbvemZheaVmeiCsuWtpumZoiIsIuWkluWbveivreWtpumZoiIsIue7p+e7reaVmeiCsuWtpumZoiIsIuiCv+eYpOWMu+WtpumZoiIsIumrmOetieiBjOS4muaKgOacr+WtpumZoiIsIuWFqOenkeWMu+WtpumZoiIsIuS9k+iCsuS4juWBpeW6t+WtpumZoiIsIuWPo+iFlOWMu+WtpumZoiIsIuS6uuaWh+ekvuS8muenkeWtpuWtpumZoiIsIuS/oeaBr+S4jueuoeeQhuWtpumZoiIsIuesrOS4gOS4tOW6iuWMu+WtpumZoiIsIuatpum4o+S4tOW6iuWMu+WtpumZoiIsIumprOWFi+aAneS4u+S5ieWtpumZoiIsIueUn+WRveenkeWtpueglOeptumZoiIsIuesrOS6jOS4tOW6iuWMu+WtpumZoiIsIueglOeptueUn+mZoiJdLCJzdGF0dXMiOiJhY3RpdmUiLCJzZXJ2aWNlUGhvbmUiOiIxMDA4NiJ9LHsiY29kZSI6IkdYLUI1MkY4RTFCIiwibmFtZSI6IuW5v+ilv+iJuuacr+WtpumZou+8iOWNl+a5luagoeWMuu+8iSIsImNvbGxlZ2VzIjpbIumfs+S5kOWtpumZoiIsIumfs+S5kOaVmeiCsuWtpumZoiIsIuiInui5iOWtpumZoiIsIuW9seinhuS4juS8oOWqkuWtpumZoiIsIumprOWFi+aAneS4u+S5ieWtpumZoiJdLCJzdGF0dXMiOiJhY3RpdmUiLCJzZXJ2aWNlUGhvbmUiOiIxMDA4NiJ9LHsiY29kZSI6IkdYLUYyRDlBRTQ5IiwibmFtZSI6IuW5v+ilv+e7j+i0uOiBjOS4muaKgOacr+WtpumZoijpnZLlsbHmoKHljLopIiwiY29sbGVnZXMiOlsi6LSi5Lya6YeR6J6N5a2m6ZmiIiwi5ZWG6LS4566h55CG5a2m6ZmiIiwi5paH5YyW5peF5ri45a2m6ZmiIiwi6Im65pyv6K6+6K6h5LiO5bu6562R5a2m6ZmiIiwi5pm66IO95LiO5L+h5oGv5bel56iL5a2m6ZmiIl0sInN0YXR1cyI6ImFjdGl2ZSIsInNlcnZpY2VQaG9uZSI6IjEwMDg2In0seyJjb2RlIjoiR1gtQkJEQTJFN0YiLCJuYW1lIjoi5bm/6KW/57uP6LS46IGM5Lia5oqA5pyv5a2m6Zmi77yI5LqU5ZCI5qCh5Yy677yJIiwiY29sbGVnZXMiOlsi6Im65pyv6K6+6K6h5LiO5bu6562R5a2m6ZmiIiwi5paH5YyW5peF5ri45a2m6ZmiIiwi5pm66IO95LiO5L+h5oGv5bel56iL5a2m6ZmiIiwi5ZWG6LS4566h55CG5a2m6ZmiIiwi6LSi5Lya6YeR6J6N5a2m6ZmiIiwi6ams5YWL5oCd5Li75LmJ5a2m6ZmiIiwi6YCa6K+G5pWZ6IKy5a2m6ZmiIiwi5pm65oWn5ZWG5Yqh5Lqn5Lia5a2m6ZmiIl0sInN0YXR1cyI6ImFjdGl2ZSIsInNlcnZpY2VQaG9uZSI6IjEwMDg2In0seyJjb2RlIjoiR1gtOTQ0MEMyMkUiLCJuYW1lIjoi5bm/6KW/5Lqk6YCa6IGM5Lia5oqA5pyv5a2m6ZmiIiwiY29sbGVnZXMiOlsi6Lev5qGl5bel56iL5a2m6ZmiIiwi5rG96L2m5bel56iL5a2m6ZmiIiwi57uP5rWO566h55CG5a2m6ZmiIiwi5Lqk6YCa6L+Q6L6T5a2m6ZmiIiwi5Lq65bel5pm66IO95a2mIiwi5pm66IO95bu66YCg5LiO5L2O56m65oqA5pyv5a2mIiwi6Iiq5rW35bel56iL5a2m6ZmiIiwi5Lic55uf5Zu96ZmF5a2m6ZmiIiwi57un57ut5pWZ6IKy5a2m6ZmiIiwi6ams5YWL5oCd5Li75LmJ5a2m6ZmiIl0sInN0YXR1cyI6ImFjdGl2ZSIsInNlcnZpY2VQaG9uZSI6IjEwMDg2In0seyJjb2RlIjoiR1gtMUE5MjEzMUYiLCJuYW1lIjoi5bm/6KW/5Y2r55Sf6IGM5Lia5oqA5pyv5a2m6Zmi77yI5qGD5rqQ5qCh5Yy677yJIiwiY29sbGVnZXMiOlsi6IGM5Lia5oqA6IO95Z+56K6t5a2m6ZmiIiwi6ams5YWL5oCd5Li75LmJ5a2m6ZmiIiwi5Yy75a2m5Z+656GA6YOoIiwi5YWs5YWx5Z+656GA6YOoIl0sInN0YXR1cyI6ImFjdGl2ZSIsInNlcnZpY2VQaG9uZSI6IjEwMDg2In0seyJjb2RlIjoiR1gtNkM1RUI1QUMiLCJuYW1lIjoi5bm/6KW/5py655S15bel5Lia5a2m5qChIiwiY29sbGVnZXMiOlsi5py655S15bel56iL57O7Iiwi55S15a2Q5L+h5oGv57O7Iiwi5Lqk6YCa5bel56iL57O7Iiwi546w5Luj5pyN5Yqh57O7Iiwi6Ieq54S26LWE5rqQ57O7Iiwi5YWs5YWx5Z+656GA6YOoIl0sInN0YXR1cyI6ImFjdGl2ZSIsInNlcnZpY2VQaG9uZSI6IjEwMDg2In0seyJjb2RlIjoiR1gtM0QyQjlBRUQiLCJuYW1lIjoi5bm/6KW/5LqM6L276auY57qn5oqA5bel5a2m5qChKOW5v+ilv+S6jOi9u+aKgOW4iOWtpumZoikiLCJjb2xsZWdlcyI6WyLmnLrnlLXlt6XnqIvns7siLCLmsb3ovablt6XnqIvns7siLCLnjrDku6PmnI3liqHns7siLCLoibrmnK/mlZnogrLns7siLCLkv6Hmga/lt6XnqIvpg6giLCLlhazlhbHln7rnoYDpg6giXSwic3RhdHVzIjoiYWN0aXZlIiwic2VydmljZVBob25lIjoiMTAwODYifSx7ImNvZGUiOiJHWC0yNjZCQjY5RSIsIm5hbWUiOiLljZflroHluILnrKzlha3ogYzkuJrlrabmoKHvvIjmoYPmupDmoKHljLrvvIkiLCJjb2xsZWdlcyI6WyLkv6Hmga/mioDmnK/kuJPkuJrpg6giLCLotKLnu4/llYbotLjkuJPkuJrpg6giLCLlhazlhbHln7rnoYDpg6giXSwic3RhdHVzIjoiYWN0aXZlIiwic2VydmljZVBob25lIjoiMTAwODYifSx7ImNvZGUiOiJHWC1CMTFFQTM0MyIsIm5hbWUiOiLljZflroHluILnrKzlha3ogYzkuJrlrabmoKHvvIjkupTlkIjmoKHljLrvvIkiLCJjb2xsZWdlcyI6WyLmnLrnlLXmioDmnK/kuJPkuJrpg6giLCLmlofljJboibrmnK/kuJPkuJrpg6giLCLlhazlhbHln7rnoYDpg6giXSwic3RhdHVzIjoiYWN0aXZlIiwic2VydmljZVBob25lIjoiMTAwODYifSx7ImNvZGUiOiJHWC03QTEyMjcxNCIsIm5hbWUiOiLljZflroHluILnrKzlm5vogYzkuJrmioDmnK/lrabmoKHvvIjnq7nmuqrmoKHljLrvvIkiLCJjb2xsZWdlcyI6WyLmsb3ovabovajpgZPkuqTpgJrkuJPkuJrpg6giLCLmmbrog73liLbpgKDkuJPkuJrpg6giLCLkv6Hmga/lt6XnqIvkuJPkuJrpg6giLCLlhazlhbHln7rnoYDpg6giXSwic3RhdHVzIjoiYWN0aXZlIiwic2VydmljZVBob25lIjoiMTAwODYifSx7ImNvZGUiOiJHWC03NTRFQzJBMiIsIm5hbWUiOiLlub/opb/msLTkuqfnlZzniaflrabmoKEiLCJjb2xsZWdlcyI6WyLliqjnp5HnsbvkuJPkuJrpg6giLCLmnLrnlLXnsbvkuJPkuJrpg6giLCLlt6XllYbnsbvkuJPkuJrpg6giLCLkvZPogrLnsbvkuJPkuJrpg6giLCLlhazlhbHmlZnlrabpg6giXSwic3RhdHVzIjoiYWN0aXZlIiwic2VydmljZVBob25lIjoiMTAwODYifSx7ImNvZGUiOiJHWC04MjNBQjFGMyIsIm5hbWUiOiLlub/opb/oibrmnK/lrabmoKEiLCJjb2xsZWdlcyI6WyLoiJ7ouYjooajmvJTkuJPkuJrpg6giLCLpn7PkuZDooajmvJTkuJPkuJrpg6giLCLmiI/mm7LmnYLmioDkuJPkuJrpg6giLCLnvo7mnK/kuI7kvKDlqpLkuJPkuJrpg6giLCLmlofljJbln7rnoYDmlZnlrabpg6giXSwic3RhdHVzIjoiYWN0aXZlIiwic2VydmljZVBob25lIjoiMTAwODYifSx7ImNvZGUiOiJHWC00OThBQURDMiIsIm5hbWUiOiLlub/opb/kuK3ljLvoja/lpKflrabpmYTorr7kuK3ljLvlrabmoKEiLCJjb2xsZWdlcyI6WyLmiqTnkIbkuJPkuJrpg6giLCLkuK3ljLvoja/kuJPkuJrpg6giLCLoja/lrabkuJPkuJrpg6giLCLlhazlhbHln7rnoYDpg6giXSwic3RhdHVzIjoiYWN0aXZlIiwic2VydmljZVBob25lIjoiMTAwODYifSx7ImNvZGUiOiJHWC1EQTgxQzdCRSIsIm5hbWUiOiLliqjlipvmioDlt6UiLCJjb2xsZWdlcyI6WyLmnLrnlLXmtojpmLLlt6XnqIvns7siLCLmsb3ovablt6XnqIvns7siLCLkv6Hmga/llYbotLjns7siLCLlhazlhbHln7rnoYDpg6giXSwic3RhdHVzIjoiYWN0aXZlIiwic2VydmljZVBob25lIjoiMTAwODYifSx7ImNvZGUiOiJHWC1GNTE5Q0NBOSIsIm5hbWUiOiLpooboiKrmioDlt6UiLCJjb2xsZWdlcyI6WyLmmbrog73liLbpgKDns7siLCLmsb3ovabkuqTpgJrns7siLCLnjrDku6PmnI3liqHns7siLCLlhazlhbHln7rnoYDpg6giXSwic3RhdHVzIjoiYWN0aXZlIiwic2VydmljZVBob25lIjoiMTAwODYifV0=', 'base64').toString('utf8'));
for (let i = 0; i < schools.length; i += 1) {
  if (schools[i].name === '动力技工') schools[i].name = '广西动力技工学校';
  if (schools[i].name === '领航技工') schools[i].name = '广西领航技工学校';
}
const schoolCodes = {};
const schoolNames = {};
for (let i = 0; i < schools.length; i += 1) { schoolCodes[schools[i].code] = true; schoolNames[schools[i].name] = true; }
const operators = ['\u4e2d\u56fd\u79fb\u52a8', '\u4e2d\u56fd\u8054\u901a', '\u4e2d\u56fd\u7535\u4fe1'];
const testOfferTemplates = [
  { id: 'TEST-CM-0001', operator: '\u4e2d\u56fd\u79fb\u52a8', displayNumber: '138****0001', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 A' },
  { id: 'TEST-CM-0002', operator: '\u4e2d\u56fd\u79fb\u52a8', displayNumber: '139****0002', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 B' },
  { id: 'TEST-CM-0003', operator: '\u4e2d\u56fd\u79fb\u52a8', displayNumber: '158****0003', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 C' },
  { id: 'TEST-CU-0001', operator: '\u4e2d\u56fd\u8054\u901a', displayNumber: '186****0001', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 A' },
  { id: 'TEST-CU-0002', operator: '\u4e2d\u56fd\u8054\u901a', displayNumber: '185****0002', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 B' },
  { id: 'TEST-CU-0003', operator: '\u4e2d\u56fd\u8054\u901a', displayNumber: '130****0003', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 C' },
  { id: 'TEST-CT-0001', operator: '\u4e2d\u56fd\u7535\u4fe1', displayNumber: '189****0001', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 A' },
  { id: 'TEST-CT-0002', operator: '\u4e2d\u56fd\u7535\u4fe1', displayNumber: '181****0002', planName: '\u6821\u56ed\u53f7\u7801\u5957\u9910 B' },
  { id: 'TEST-CT-0003', operator: '\u4e2d\u56fd\u7535\u4fe1', displayNumber: '133****0003', planName: '\u6821\u56ed\u53f7\u5957\u9910 C' }
];
function ok(data) { return { success: true, data: data }; }
function fail(error) { return { success: false, error: error }; }
function hashPassword(password, salt) { return crypto.createHash('sha256').update(salt + ':' + password).digest('hex'); }
function validPassword(password) { return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{9,15}$/.test(password); }
function validIdCard(value) {
  const id = String(value || '').trim().toUpperCase();
  if (!/^\d{17}[\dX]$/.test(id)) return false;
  const provinceCodes = new Set(['11', '12', '13', '14', '15', '21', '22', '23', '31', '32', '33', '34', '35', '36', '37', '41', '42', '43', '44', '45', '46', '50', '51', '52', '53', '54', '61', '62', '63', '64', '65', '71', '81', '82']);
  if (!provinceCodes.has(id.slice(0, 2)) || id.slice(14, 17) === '000') return false;
  const year = Number(id.slice(6, 10));
  const month = Number(id.slice(10, 12));
  const day = Number(id.slice(12, 14));
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (birthDate.getUTCFullYear() !== year || birthDate.getUTCMonth() !== month - 1 || birthDate.getUTCDate() !== day) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const checks = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'];
  let sum = 0;
  for (let i = 0; i < 17; i += 1) sum += Number(id[i]) * weights[i];
  return checks[sum % 11] === id[17];
}
function featureCode() { return 'CAMPUS-' + crypto.randomBytes(4).toString('hex').toUpperCase(); }
const BUILTIN_STAFF_PHONE_HASHES = new Set([
  '5d8c1379cdc1549ad2f4b0c8d80f9b3d0cdb48c2e305d32b450334160885a6d9',
  '91bfb9037b45bca2c94ad62c883acd6cb5a1f992a0e6d37366d7f7a7a63f8a88',
  '7b7720561af334aa42fe0a08fbdcba2fc01e7ffde472c53248db8aaf51af90d1',
  'c8552b94751a59c2243a8812ac7cc5e7504c62a3bfbc2ce2432af33f800f638b',
  '6efbd11efcd61924e412d31fe87917b4b88b3b6183967fda5d064efef669759a',
  '322c34aaa620caddd6b08ac38ba81dfe5b1118474aae1051ac19c6dd850bede3'
]);
const BUILTIN_BRANCH_PHONE_HASHES = new Set([
  '5d8c1379cdc1549ad2f4b0c8d80f9b3d0cdb48c2e305d32b450334160885a6d9',
  '91bfb9037b45bca2c94ad62c883acd6cb5a1f992a0e6d37366d7f7a7a63f8a88',
  '7b7720561af334aa42fe0a08fbdcba2fc01e7ffde472c53248db8aaf51af90d1',
  'c8552b94751a59c2243a8812ac7cc5e7504c62a3bfbc2ce2432af33f800f638b',
  '6efbd11efcd61924e412d31fe87917b4b88b3b6183967fda5d064efef669759a',
  '322c34aaa620caddd6b08ac38ba81dfe5b1118474aae1051ac19c6dd850bede3'
]);
const BUILTIN_GRID_OPERATOR_PHONE_HASHES = new Set([
  'e842f8731cb1f25ff74243c3e5f5952f99cede75e1978917bce90f74868ad1c3'
]);
function authorizedStaffPhone(phone, role) {
  const envName = role === 'offline' ? 'CAMPUS_OUTLET_PHONE_HASHES' : role === 'merchant' ? 'CAMPUS_MERCHANT_PHONE_HASHES' : 'CAMPUS_OPERATOR_PHONE_HASHES';
  const raw = [process.env[envName] || '', role === 'operator' ? (process.env.CAMPUS_OPERATOR_BRANCH_PHONE_HASHES || '') : ''].filter(Boolean).join(',');
  const hash = crypto.createHash('sha256').update(phone).digest('hex');
  if (BUILTIN_GRID_OPERATOR_PHONE_HASHES.has(hash) && role !== 'operator') return false;
  const builtinAuthorized = BUILTIN_BRANCH_PHONE_HASHES.has(hash) || (role === 'operator' && BUILTIN_GRID_OPERATOR_PHONE_HASHES.has(hash));
  if (!raw.trim()) return true;
  const configured = raw.split(',').map(function (item) { return item.trim().toLowerCase(); }).filter(Boolean);
  return builtinAuthorized || (BUILTIN_STAFF_PHONE_HASHES.has(hash) && role === 'operator') || configured.indexOf(hash) >= 0;
}
function normalizedGrid(value) { return String(value || '').trim(); }
function isBranchStaffPhone(phone) {
  const hash = crypto.createHash('sha256').update(String(phone || '')).digest('hex');
  if (BUILTIN_BRANCH_PHONE_HASHES.has(hash)) return true;
  const raw = process.env.CAMPUS_OPERATOR_BRANCH_PHONE_HASHES || '';
  if (!raw.trim()) return false;
  return raw.split(',').map(function (item) { return item.trim().toLowerCase(); }).filter(Boolean).indexOf(hash) >= 0;
}
function isBranchOperatorPhone(phone) { return isBranchStaffPhone(phone); }
function operatorScope(account) { return account && account.operatorScope === 'grid' ? 'grid' : 'branch'; }
function filterOperatorRecords(records, account, requestedGrid) {
  const scope = operatorScope(account);
  const grid = normalizedGrid(requestedGrid);
  if (scope === 'grid') return records.filter(function (item) { return normalizedGrid(item.gridName) === normalizedGrid(account.gridName); });
  if (grid && grid !== '全部网格') return records.filter(function (item) { return normalizedGrid(item.gridName) === grid; });
  return records;
}
async function staffAccount(data, role) {
  const accountId = String(data.accountId || '').trim();
  if (!accountId) return null;
  const found = await db.collection('campus_accounts').where({ _id: accountId, role: role, status: 'active' }).limit(1).get();
  return found.data[0] || null;
}
async function listAllRecords() {
  return (await db.collection('campus_records').limit(1000).get()).data;
}
function normalizeCampusNumber(value) { return String(value || '').trim().replace(/\s+/g, ''); }
async function findCampusNumberRecord(value) {
  var campusNumber = normalizeCampusNumber(value);
  if (!campusNumber) return null;
  var direct = (await db.collection('campus_records').where({ selectedNumber: campusNumber }).limit(1).get()).data[0];
  if (direct) return direct;
  var selectedPhone = (await db.collection('campus_records').where({ selectedPhone: campusNumber }).limit(1).get()).data[0];
  if (selectedPhone) return selectedPhone;
  var offer = (await db.collection('campus_offers').where({ phone: campusNumber }).limit(1).get()).data[0];
  if (offer) return (await db.collection('campus_records').where({ selectedOfferId: offer.id }).limit(1).get()).data[0] || null;
  var records = await listAllRecords();
  return records.find(function (item) { return normalizeCampusNumber(item.selectedNumber) === campusNumber || normalizeCampusNumber(item.selectedPhone) === campusNumber; }) || null;
}
async function seed() {
  const names = ['campus_schools', 'campus_offers', 'campus_records', 'campus_accounts', 'campus_settings'];
  for (let i = 0; i < names.length; i += 1) { try { await db.createCollection(names[i]); } catch (e) {} }
  for (let i = 0; i < schools.length; i += 1) {
    const school = schools[i];
    const found = await db.collection('campus_schools').where({ code: school.code }).limit(1).get();
    if (!found.data.length) await db.collection('campus_schools').add({ data: school });
    else {
      const current = found.data[0];
      const needsUpdate = current.name !== school.name || current.status !== school.status || current.servicePhone !== school.servicePhone || JSON.stringify(current.colleges || []) !== JSON.stringify(school.colleges || []);
      if (needsUpdate) await db.collection('campus_schools').doc(current._id).update({ data: {
        name: school.name,
        colleges: school.colleges,
        status: school.status,
        servicePhone: school.servicePhone
      } });
    }
  }
}
var seedPromise = null;
async function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = seed().catch(function (error) { seedPromise = null; throw error; });
  }
  return seedPromise;
}
async function getOfflineSettings() {
  try {
    const result = await db.collection('campus_settings').where({ key: 'offline' }).limit(1).get();
    return result.data[0] || { key: 'offline', verificationAddress: '', updatedAt: '' };
  } catch (error) { return { key: 'offline', verificationAddress: '', updatedAt: '' }; }
}
async function saveOfflineSettings(settings) {
  const data = { key: 'offline', verificationAddress: String(settings.verificationAddress || ''), updatedAt: settings.updatedAt || new Date().toISOString() };
  try {
    const current = await db.collection('campus_settings').where({ key: 'offline' }).limit(1).get();
    if (current.data.length) await db.collection('campus_settings').doc(current.data[0]._id).update({ data });
    else await db.collection('campus_settings').add({ data });
  } catch (error) { await db.collection('campus_settings').add({ data }); }
  return data;
}
function isNumberOrderRecord(record) { return Boolean(record && (record.selectedOfferId || String(record.type || '').indexOf('选号') >= 0)); }
function exportDateTime(value) {
  if (!value) return '';
  var raw = value;
  if (typeof value === 'object') raw = value.$date || value.date || value.value || value._date || value.toISOString && value.toISOString();
  if (raw && typeof raw === 'object') raw = raw.$numberLong || raw.value || raw.date || raw;
  var date = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw || '');
  var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  var fields = {}; parts.forEach(function (part) { fields[part.type] = part.value; });
  return fields.year + '-' + fields.month + '-' + fields.day + ' ' + fields.hour + ':' + fields.minute + ':' + fields.second;
}
function activationTimeForExport(record) { return record.activationAt || record.verifiedAt || (record.activationStatus === 'activated' ? record.updatedAt : ''); }
const OPERATOR_EXPORT_HEADERS = ['服务编码', '学校', '学院', '学号', '姓名', '身份证号码', '特征码', '地址', '线下实名地址', '创建时间', '核验时间', '实名人员姓名', '实名人员电话', '商家姓名', '商家电话'];
const OFFLINE_EXPORT_HEADERS = ['服务编码', '学校', '学院', '学号', '姓名', '身份证号码', '特征码', '地址'];
function operatorExportRows(records) {
  return records.map(function (record) {
    return {
      服务编码: record.serviceCode || record._id || record.id || '', 学校: record.schoolName || '', 学院: record.college || '', 学号: record.studentNo || '', 姓名: record.name || '', 身份证号码: record.idCard || '', 特征码: record.featureCode || '', 地址: record.address || record.shippingAddress || '', 线下实名地址: record.outletAddress || '', 创建时间: exportDateTime(record.createdAt), 核验时间: exportDateTime(record.verifiedAt || activationTimeForExport(record)), 实名人员姓名: record.verifiedByName || '', 实名人员电话: record.verifiedByPhone || '', 商家姓名: record.merchantName || '', 商家电话: record.merchantPhone || ''
    };
  });
}
function offlineExportRows(records) {
  return records.map(function (record) {
    return {
      服务编码: record.serviceCode || record._id || record.id || '', 学校: record.schoolName || '', 学院: record.college || '', 学号: record.studentNo || '', 姓名: record.name || '', 身份证号码: record.idCard || '', 特征码: record.featureCode || '', 地址: record.address || record.shippingAddress || ''
    };
  });
}
function csvEscape(value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; }
function exportFile(records, sheetName, baseName, headers, rows) {
  if (XLSX) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows, { header: headers }), sheetName);
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return { fileName: baseName + '.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: buffer.toString('base64'), count: rows.length };
  }
  const csv = '\uFEFF' + [headers, ...rows.map(function (row) { return headers.map(function (header) { return row[header]; }); })].map(function (row) { return row.map(csvEscape).join(','); }).join('\r\n');
  return { fileName: baseName + '.csv', mimeType: 'text/csv;charset=utf-8', base64: Buffer.from(csv, 'utf8').toString('base64'), count: rows.length };
}
function validExportDate(value) { return !value || /^\d{4}-\d{2}-\d{2}$/.test(value); }
async function featureQrDataUrl(code) {
  if (!QRCode || !code) return '';
  try { return await QRCode.toDataURL(String(code), { errorCorrectionLevel: 'M', margin: 1, width: 360 }); } catch (error) { return ''; }
}
async function ensureOffers(schoolCode) {
  const existing = await db.collection('campus_offers').where({ schoolCode: schoolCode }).limit(100).get();
  const existingIds = {};
  for (let i = 0; i < existing.data.length; i += 1) existingIds[existing.data[i].id] = true;
  for (let i = 0; i < testOfferTemplates.length; i += 1) {
    const template = testOfferTemplates[i];
    const offerId = schoolCode + '-' + template.id;
    if (existingIds[offerId]) continue;
    await db.collection('campus_offers').add({ data: {
      id: offerId,
      schoolCode: schoolCode,
      operator: template.operator,
      displayNumber: template.displayNumber,
      planName: template.planName,
      monthlyFee: 0,
      status: 'available',
      reservedBy: ''
    } });
  }
}
function requestData(event) { var data = {}; var raw = String(event.path || '/'); var q = raw.indexOf('?'); if (q >= 0) { var query = raw.slice(q + 1).split('&'); raw = raw.slice(0, q); for (var i = 0; i < query.length; i += 1) { var pair = query[i].split('='); if (pair[0]) data[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || ''); } } var extra = event.data || {}; for (var key in extra) data[key] = extra[key]; return { path: raw, data: data }; }
exports.main = async function (event) {
  try {
    if (!event || event.action === 'health') return { success: true, service: 'campusService', version: '20260818-6', cloudEnv: cloud.getWXContext().ENV };
    if (event.action !== 'proxy') return fail('不支持的操作');
    var parsed = requestData(event); var path = parsed.path; var data = parsed.data; var method = String(event.method || 'GET').toUpperCase();
    await ensureSeeded();
    if (method === 'GET' && path === '/api/schools') {
      var all = (await db.collection('campus_schools').limit(1000).get()).data.filter(function (item) { return schoolCodes[item.code] && schoolNames[item.name]; });
      var query = String(data.q || '').trim(); if (query) all = all.filter(function (item) { return item.name.indexOf(query) >= 0; }).slice(0, 20); return ok({ schools: all });
    }
    var match = path.match(/^\/api\/schools\/([^/]+)$/);
    if (method === 'GET' && match) { var code = decodeURIComponent(match[1]); if (!schoolCodes[code]) return fail('学校不存在'); var detail = await db.collection('campus_schools').where({ code: code }).limit(1).get(); return detail.data.length ? ok({ school: detail.data[0] }) : fail('学校不存在'); }
    var numbers = path.match(/^\/api\/schools\/([^/]+)\/numbers/);
    if (method === 'GET' && numbers) {
      var schoolCode = decodeURIComponent(numbers[1]); if (!schoolCodes[schoolCode]) return fail('学校不存在'); await ensureOffers(schoolCode);
      var allOfferRecords = (await db.collection('campus_offers').where({ operator: data.operator || operators[0] }).limit(1000).get()).data;
      var reservedDisplayNumbers = {};
      allOfferRecords.forEach(function (item) { if (item.status !== 'available' && item.displayNumber) reservedDisplayNumbers[item.displayNumber] = true; });
      var seenDisplayNumbers = {};
      var visibleOffers = allOfferRecords.filter(function (item) {
        if (item.status !== 'available' || (item.schoolCode && item.schoolCode !== schoolCode)) return false;
        if (item.displayNumber && (reservedDisplayNumbers[item.displayNumber] || seenDisplayNumbers[item.displayNumber])) return false;
        if (item.displayNumber) seenDisplayNumbers[item.displayNumber] = true;
        return true;
      });
      var offerPageSize = Math.min(Math.max(Number(data.pageSize) || 30, 1), 50); var offerPage = Math.max(Number(data.page) || 1, 1); var offerStart = (offerPage - 1) * offerPageSize;
      return ok({ offers: visibleOffers.slice(offerStart, offerStart + offerPageSize), total: visibleOffers.length, totalPages: Math.max(Math.ceil(visibleOffers.length / offerPageSize), 1), page: offerPage });
    }
    if (method === 'POST' && (path === '/api/orders' || path === '/api/tickets')) {
      var numberOrder = path === '/api/orders' && String(data.type || '').indexOf('选号') >= 0;
      if (!data.name || !data.idCard || !data.college || !data.phone) return fail('请完整填写姓名、身份证、学院和手机号');
      if (!/^1\d{10}$/.test(String(data.phone))) return fail('请输入有效手机号码');
      if (data.backupPhone && !/^1\d{10}$/.test(String(data.backupPhone))) return fail('备用联系电话格式不正确');
      if (!validIdCard(data.idCard)) return fail('身份证号格式或校验位不正确，请核对后重试');
      if (numberOrder && (!data.idCardFrontFile || !data.idCardBackFile)) return fail('请上传身份证正面和反面照片');
      if (!data.type) return fail('请选择服务项目');
      if (data.serviceConsent !== true && data.serviceConsent !== 'true' && data.serviceConsent !== 'on') return fail('请先同意信息收集和后续联系说明');
      var selectedSchool = schools.find(function (item) { return item.code === String(data.schoolCode || ''); });
      if (!selectedSchool || !selectedSchool.colleges || selectedSchool.colleges.indexOf(String(data.college)) < 0) return fail('学校或二级学院信息无效，请重新选择');
      if (!numberOrder && data.selectedOfferId) return fail('非选号服务不能提交号码资源');
      var offer = null;
      if (numberOrder) {
        if (!data.selectedOfferId) return fail('请选择意向号码');
        if (!data.address || !data.deliveryRecipient || !/^1\d{10}$/.test(String(data.deliveryPhone || ''))) return fail('请完整填写收货地址、收货人和收货电话');
        var matchingOffers = (await db.collection('campus_offers').where({ id: data.selectedOfferId, status: 'available' }).limit(10).get()).data;
        offer = matchingOffers.find(function (item) { return !item.schoolCode || item.schoolCode === String(data.schoolCode || ''); });
        if (!offer) return fail('所选号码已被预占，请返回重新选择');
      }
      var record = {}; for (var field in data) record[field] = data[field];
      record.idCard = String(record.idCard || '').trim().toUpperCase();
      record.recordType = path === '/api/orders' ? 'order' : 'ticket';
      record.status = 'pending';
      record.createdAt = db.serverDate();
      record.openid = cloud.getWXContext().OPENID || '';
      record.gridName = normalizedGrid(record.gridName);
      if (!numberOrder) {
        record.schoolName = selectedSchool.name || '';
        if (path === '/api/orders' && String(data.type || '') === '校园网账号预约') {
          record.featureCode = featureCode();
          record.verificationStatus = 'pending_manual';
          record.activationStatus = 'pending';
        } else {
          record.verificationStatus = 'not_required';
          record.activationStatus = 'not_applicable';
        }
      }
      if (numberOrder) {
        record.selectedNumber = offer.displayNumber;
        record.selectedPhone = offer.phone || '';
        record.operator = offer.operator;
        record.planName = offer.planName || '';
        record.monthlyFee = Number(offer.monthlyFee) || 0;
        record.schoolName = selectedSchool.name || '';
        record.idCardLast4 = String(data.idCard).slice(-4).toUpperCase();
        record.shippingRecipient = record.shippingRecipient || record.deliveryRecipient || '';
        record.shippingPhone = record.shippingPhone || record.deliveryPhone || '';
        record.shippingAddress = record.shippingAddress || record.address || '';
        record.deliveryStatus = 'pending';
        record.activationStatus = 'pending';
        record.verificationStatus = 'pending_manual';
        var offlineSettings = await getOfflineSettings();
        record.outletAddress = offlineSettings.verificationAddress || offer.outletAddress || '';
        record.featureCode = record.outletAddress ? featureCode() : '';
        record.offlineAssignedAt = record.outletAddress ? new Date().toISOString() : '';
      }
      var added = await db.collection('campus_records').add({ data: record });
      if (numberOrder) {
        var reservation = await db.collection('campus_offers').where({ _id: offer._id, status: 'available' }).update({ data: { status: 'reserved', reservedBy: added._id } });
        if (!reservation.stats || reservation.stats.updated !== 1) {
          await db.collection('campus_records').doc(added._id).remove();
          return fail('所选号码已被预占，请返回重新选择');
        }
      }
      record.id = added._id;
      return ok({ record: record });
    }
    if (method === 'POST' && path === '/api/student/records') {
      var currentOpenId = cloud.getWXContext().OPENID || '';
      var requestedPhone = String(data.phone || '').trim();
      var schoolQuery = data.schoolCode ? db.collection('campus_records').where({ schoolCode: data.schoolCode }) : db.collection('campus_records');
      var storedRecords = (await schoolQuery.limit(1000).get()).data;
      var records = storedRecords.filter(function (item) { return currentOpenId ? item.openid === currentOpenId && (!requestedPhone || item.phone === requestedPhone) : Boolean(requestedPhone) && item.phone === requestedPhone; });
      var recordList = await Promise.all(records.slice(-50).map(async function (item) {
        item.id = item._id;
        item.deliveryRecipient = item.deliveryRecipient || item.shippingRecipient || '';
        item.deliveryPhone = item.deliveryPhone || item.shippingPhone || '';
        item.address = item.address || item.shippingAddress || '';
        item.schoolName = item.schoolName || ((schools.find(function (school) { return school.code === item.schoolCode; }) || {}).name || '');
        item.featureQrDataUrl = item.featureCode ? await featureQrDataUrl(item.featureCode) : '';
        return item;
      }));
      return ok({ records: recordList });
    }
    if (method === 'POST' && path === '/api/student/confirm-completion') { await db.collection('campus_records').doc(data.recordId).update({ data: { completionConfirmedAt: db.serverDate(), rating: Number(data.rating) || 5, ratingComment: String(data.ratingComment || '') } }); return ok({}); }
    if (method === 'POST' && path === '/api/operator/import-numbers') {
      if (!await staffAccount(data, 'operator')) return fail('运营商账号未登录');
      var rows = Array.isArray(data.rows) ? data.rows : []; var imported = 0; var skipped = 0; var errors = [];
      for (var r = 0; r < rows.length; r += 1) {
        var row = rows[r] || {}; var operator = String(row.operator || '').trim(); var phone = String(row.phone || row.number || '').replace(/\s+/g, '');
        if (operators.indexOf(operator) < 0 || !/^1\d{10}$/.test(phone)) { errors.push({ row: r + 1, message: '运营商或号码格式错误' }); continue; }
        var duplicate = await db.collection('campus_offers').where({ phone: phone }).limit(1).get();
        if (duplicate.data.length) { skipped += 1; continue; }
        await db.collection('campus_offers').add({ data: { id: 'IMP-' + crypto.randomBytes(6).toString('hex').toUpperCase(), phone: phone, schoolCode: String(row.schoolCode || ''), operator: operator, displayNumber: row.displayNumber || (phone.slice(0, 3) + '****' + phone.slice(-4)), planName: String(row.planName || '校园号码套餐'), monthlyFee: Number(row.monthlyFee) || 0, outletAddress: String(row.outletAddress || data.addressText || ''), status: 'available', reservedBy: '' } });
        imported += 1;
      }
      return ok({ imported: imported, skipped: skipped, errors: errors });
    }
    if (method === 'POST' && path === '/api/operator/orders') {
      var orderOperator = await staffAccount(data, 'operator');
      if (!orderOperator) return fail('运营商账号未登录');
      var allOperatorRecords = (await listAllRecords()).filter(function (item) { return item.selectedOfferId || item.type === '校园网账号预约'; });
      var operatorRecords = filterOperatorRecords(allOperatorRecords, orderOperator, data.gridName);
      var operatorOffers = (await db.collection('campus_offers').limit(1000).get()).data; var operatorSchools = (await db.collection('campus_schools').limit(1000).get()).data;
      var schoolMap = {}; operatorSchools.forEach(function (s) { schoolMap[s.code] = s.name; }); var offerMap = {}; operatorOffers.forEach(function (o) { offerMap[o.id] = o; });
      operatorRecords = operatorRecords.map(function (item) { var offerItem = offerMap[item.selectedOfferId] || {}; item.id = item._id; item.displayNumber = item.selectedNumber || offerItem.displayNumber || ''; item.schoolName = schoolMap[item.schoolCode] || ''; item.outletAddress = item.outletAddress || offerItem.outletAddress || ''; item.deliveryRecipient = item.deliveryRecipient || item.shippingRecipient || ''; item.deliveryPhone = item.deliveryPhone || item.shippingPhone || ''; item.address = item.address || item.shippingAddress || ''; item.verifiedByName = item.verifiedByName || ''; item.verifiedByPhone = item.verifiedByPhone || ''; item.merchantName = item.merchantName || ''; item.merchantPhone = item.merchantPhone || ''; return item; });
      var grids = {}; allOperatorRecords.forEach(function (item) { var grid = normalizedGrid(item.gridName); if (grid) grids[grid] = true; });
      return ok({ orders: operatorRecords, total: operatorRecords.length, gridName: operatorScope(orderOperator) === 'grid' ? normalizedGrid(orderOperator.gridName) : normalizedGrid(data.gridName), scope: operatorScope(orderOperator), accountGrid: normalizedGrid(orderOperator.gridName), gridOptions: Object.keys(grids).sort() });
    }
    if (method === 'POST' && path === '/api/operator/assign-outlet') {
      if (!await staffAccount(data, 'operator')) return fail('运营商账号未登录');
      var address = String(data.outletAddress || '').trim(); if (!address) return fail('请输入线下办理地址');
      var target = (await db.collection('campus_records').where({ _id: String(data.recordId || '') }).limit(1).get()).data[0]; if (!target) return fail('订单不存在');
      await db.collection('campus_records').doc(target._id).update({ data: { outletAddress: address, featureCode: target.featureCode || featureCode(), offlineAssignedAt: target.offlineAssignedAt || new Date().toISOString() } }); return ok({});
    }
    if (method === 'PATCH' && path === '/api/operator/offline-settings') {
      var settingsOperator = await staffAccount(data, 'operator');
      if (!settingsOperator) return fail('运营商账号未登录');
      if (operatorScope(settingsOperator) !== 'branch') return fail('网格运营商账号不能修改分公司统一地址');
      var action = data.action === 'clear' ? 'clear' : 'set';
      var verificationAddress = String(data.verificationAddress || '').trim();
      if (action === 'set' && !verificationAddress) return fail('请输入可办理线下实名认证的地址');
      var updatedAt = new Date().toISOString();
      var savedSettings = await saveOfflineSettings({ verificationAddress: action === 'clear' ? '' : verificationAddress, updatedAt: updatedAt });
      var affectedOrders = 0;
      var allRecords = await listAllRecords();
      for (var a = 0; a < allRecords.length; a += 1) {
        var pending = allRecords[a];
        if (!isNumberOrderRecord(pending) || pending.status === 'cancelled' || pending.activationStatus === 'activated') continue;
        if (action === 'set' && (!pending.outletAddress || !pending.featureCode)) {
          await db.collection('campus_records').doc(pending._id).update({ data: { outletAddress: verificationAddress, featureCode: pending.featureCode || featureCode(), offlineAssignedAt: pending.offlineAssignedAt || updatedAt, updatedAt: updatedAt } });
          affectedOrders += 1;
        }
      }
      return ok({ verificationAddress: savedSettings.verificationAddress, updatedAt: savedSettings.updatedAt, affectedOrders });
    }
    if (method === 'POST' && path === '/api/operator/offline-settings') {
      if (!await staffAccount(data, 'operator')) return fail('运营商账号未登录');
      return ok({ settings: await getOfflineSettings() });
    }
    if (method === 'POST' && (path === '/api/operator/export-number-pending' || path === '/api/operator/export-activated')) {
      var exportOperator = await staffAccount(data, 'operator');
      if (!exportOperator) return fail('运营商账号未登录');
      var exportRecords = filterOperatorRecords((await listAllRecords()).filter(isNumberOrderRecord).filter(function (item) { return item.status !== 'cancelled'; }), exportOperator, data.gridName);
      if (path === '/api/operator/export-number-pending') exportRecords = exportRecords.filter(function (item) { return item.activationStatus !== 'activated'; });
      else {
        var from = String(data.from || '').trim(); var to = String(data.to || '').trim();
        if (!validExportDate(from) || !validExportDate(to)) return fail('日期格式必须为 YYYY-MM-DD');
        if (from && to && from > to) return fail('开始日期不能晚于结束日期');
        exportRecords = exportRecords.filter(function (item) { var date = String(activationTimeForExport(item) || '').slice(0, 10); return item.activationStatus === 'activated' && (!from || (date && date >= from)) && (!to || (date && date <= to)); });
      }
      exportRecords.sort(function (left, right) { return String(left.schoolName || '').localeCompare(String(right.schoolName || ''), 'zh-CN') || String(left.college || '').localeCompare(String(right.college || ''), 'zh-CN') || String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN'); });
      var activatedExport = path.indexOf('activated') >= 0;
       return ok(exportFile(exportRecords, activatedExport ? '已实名激活名单' : '未激活选号', activatedExport ? '校园号码订单-已激活' : '校园号码订单-待激活', OPERATOR_EXPORT_HEADERS, operatorExportRows(exportRecords)));
    }
    if (method === 'POST' && path === '/api/offline/export-verified') {
      var verifiedAccount = await staffAccount(data, 'offline');
      if (!verifiedAccount) return fail('线下实体端账号未登录');
      var verifiedRecords = (await listAllRecords()).filter(function (item) {
        return item.verificationStatus === 'verified' && item.verifiedByAccountId === verifiedAccount._id;
      }).sort(function (left, right) { return String(left.verifiedAt || '').localeCompare(String(right.verifiedAt || '')); });
      return ok(exportFile(verifiedRecords, '已核验名单', '线下已核验名单', OFFLINE_EXPORT_HEADERS, offlineExportRows(verifiedRecords)));
    }
    if (method === 'POST' && path === '/api/offline/import-verification') {
      var verifyingAccount = await staffAccount(data, 'offline');
      if (!verifyingAccount) return fail('线下实体端账号未登录');
      var messages = Array.isArray(data.messages) ? data.messages : []; var results = [];
      for (var m = 0; m < messages.length; m += 1) {
        var message = messages[m] || {}; var code = String(message.featureCode || '').trim(); var campusNumber = normalizeCampusNumber(message.campusNumber || message.selectedNumber || '');
        var candidate = code ? (await db.collection('campus_records').where({ featureCode: code }).limit(1).get()).data[0] : await findCampusNumberRecord(campusNumber);
        if (!candidate) { results.push({ featureCode: code, campusNumber: campusNumber, success: false, message: '校园号码或特征码不存在' }); continue; }
        if (campusNumber && normalizeCampusNumber(candidate.selectedNumber) !== campusNumber && normalizeCampusNumber(candidate.selectedPhone) !== campusNumber) {
          var candidateOffer = candidate.selectedOfferId ? (await db.collection('campus_offers').where({ id: candidate.selectedOfferId }).limit(1).get()).data[0] : null;
          if (!candidateOffer || normalizeCampusNumber(candidateOffer.phone) !== campusNumber) { results.push({ featureCode: code, campusNumber: campusNumber, success: false, message: '校园号码与订单不匹配' }); continue; }
        }
        if (candidate.activationStatus === 'activated') { results.push({ featureCode: code, campusNumber: campusNumber, success: true, message: '该订单已经被商家确认激活' }); continue; }
        if (!String(message.activationProofFile || data.activationProofFile || '').trim()) { results.push({ featureCode: code, campusNumber: campusNumber, success: false, message: '请先提交套卡实名已激活页面' }); continue; }
        var passed = ['verified', 'success', 'passed', 'ok', '通过', '成功'].indexOf(String(message.result || 'verified').toLowerCase()) >= 0;
        if (!passed) { results.push({ featureCode: code, campusNumber: campusNumber, success: false, message: '实名验证未通过' }); continue; }
        await db.collection('campus_records').doc(candidate._id).update({ data: { verificationStatus: 'verified', activationStatus: 'pending_merchant', status: 'completed', gridName: normalizedGrid(verifyingAccount.gridName), verifiedAt: db.serverDate(), verifiedByAccountId: verifyingAccount._id, verifiedByName: verifyingAccount.name || '', verifiedByPhone: verifyingAccount.phone || '', activationProofFile: String(message.activationProofFile || data.activationProofFile || '').trim() } });
        results.push({ featureCode: code, campusNumber: campusNumber, success: true, message: '实名验证成功，等待商家确认激活', displayNumber: candidate.selectedNumber, schoolName: candidate.schoolName, college: candidate.college });
      }
      return ok({ results: results });
    }
    if (method === 'POST' && path === '/api/merchant/query') {
      var merchantAccount = await staffAccount(data, 'merchant');
      if (!merchantAccount) return fail('商家兑换端账号未登录');
      var merchantCampusNumber = normalizeCampusNumber(data.campusNumber || data.selectedNumber || '');
      if (!merchantCampusNumber) return fail('请输入校园号码');
      var merchantRecord = await findCampusNumberRecord(merchantCampusNumber);
      if (!merchantRecord) return ok({ found: false, status: 'unverified', message: '未找到对应订单，暂未核验', canConfirm: false });
      var merchantVerified = merchantRecord.verificationStatus === 'verified';
      return ok({ found: true, status: merchantVerified ? 'verified' : 'unverified', message: merchantVerified ? (merchantRecord.activationStatus === 'activated' ? '已核验并完成激活' : '已核验') : '未核验', canConfirm: merchantVerified && merchantRecord.activationStatus !== 'activated', record: { id: merchantRecord._id, name: merchantRecord.name || '', campusNumber: merchantRecord.selectedNumber || merchantRecord.selectedPhone || merchantCampusNumber, schoolName: merchantRecord.schoolName || '', college: merchantRecord.college || '', merchantName: merchantRecord.merchantName || '', merchantPhone: merchantRecord.merchantPhone || '' } });
    }
    if (method === 'POST' && path === '/api/merchant/confirm-activation') {
      var confirmingMerchant = await staffAccount(data, 'merchant');
      if (!confirmingMerchant) return fail('商家兑换端账号未登录');
      var confirmCampusNumber = normalizeCampusNumber(data.campusNumber || data.selectedNumber || '');
      if (!confirmCampusNumber) return fail('请输入校园号码');
      var confirmRecord = await findCampusNumberRecord(confirmCampusNumber);
      if (!confirmRecord) return fail('未找到对应订单');
      if (confirmRecord.verificationStatus !== 'verified') return fail('订单尚未在线下端核验，不能确认激活');
      if (confirmRecord.activationStatus === 'activated') return ok({ message: '该订单已经激活' });
      await db.collection('campus_records').doc(confirmRecord._id).update({ data: { activationStatus: 'activated', status: 'completed', activatedAt: db.serverDate(), merchantAccountId: confirmingMerchant._id, merchantName: confirmingMerchant.name || '', merchantPhone: confirmingMerchant.phone || '', merchantActivatedAt: db.serverDate() } });
      if (confirmRecord.selectedOfferId) { var merchantOffer = (await db.collection('campus_offers').where({ id: confirmRecord.selectedOfferId }).limit(1).get()).data[0]; if (merchantOffer) await db.collection('campus_offers').doc(merchantOffer._id).update({ data: { status: 'activated' } }); }
      return ok({ message: '商家确认激活成功' });
    }
    if (method === 'POST' && (path === '/api/staff/register' || path === '/api/staff/login')) { var role = ['offline', 'operator', 'merchant'].indexOf(data.role) >= 0 ? data.role : ''; var phone = String(data.phone || '').trim(); var password = String(data.password || ''); var staffName = String(data.name || '').trim(); var staffGrid = normalizedGrid(data.gridName); var branchStaff = isBranchStaffPhone(phone); var branchOperator = role === 'operator' && branchStaff; if (!role || !/^1\d{10}$/.test(phone)) return fail('请输入有效手机号码'); if (!authorizedStaffPhone(phone, role)) return fail('该手机号未获本端授权'); if (path === '/api/staff/register') { if (role === 'merchant' && !staffName) return fail('请输入商家姓名'); if ((role === 'offline' || role === 'operator') && !branchStaff && !staffGrid) return fail('请填写所属网格'); if (password !== String(data.confirmPassword || '')) return fail('两次密码不一致'); if (!validPassword(password)) return fail('密码需为9-15位，并同时包含大小写字母和数字'); var exists = await db.collection('campus_accounts').where({ phone: phone, role: role }).limit(1).get(); if (exists.data.length) return fail('该手机号已注册，请直接登录'); var salt = crypto.randomBytes(16).toString('hex'); var account = await db.collection('campus_accounts').add({ data: { phone: phone, role: role, name: staffName, gridName: staffGrid, operatorScope: role === 'operator' ? (branchOperator ? 'branch' : 'grid') : '', salt: salt, passwordHash: hashPassword(password, salt), status: 'active' } }); return ok({ accountId: account._id, message: '注册成功，请登录' }); } var found = await db.collection('campus_accounts').where({ phone: phone, role: role, status: 'active' }).limit(1).get(); var login = found.data[0]; if (!login || hashPassword(password, login.salt) !== login.passwordHash) return fail('手机号或密码错误'); return ok({ accountId: login._id, role: role, phone: phone, name: login.name || '', gridName: login.gridName || '', operatorScope: role === 'operator' ? (login.operatorScope || 'branch') : (login.operatorScope || ''), message: '登录成功' }); }
    return fail('未实现的接口: ' + method + ' ' + path);
  } catch (error) { console.error('campusService error', error); return fail(error && error.message ? error.message : '云函数执行失败'); }
};

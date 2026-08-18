# 校园通信服务

校园通信服务同时支持微信小程序云开发和 Node.js 服务器部署。当前正式小程序包含学生端、运营商端、线下办理端和商家兑换端；服务器版 H5 和 API 仍保留，用于独立部署、迁移和备用。

## 部署方式

### 微信云开发

不需要服务器和域名，使用以下目录：

- `miniprogram/`
- `cloudfunctions/campusService/`

小程序环境 ID 在 `miniprogram/app.js` 中配置。微信开发者工具打开项目根目录后，选择 `cloudfunctions/campusService`，执行“上传并部署：云端安装依赖”。云函数使用 `campus_schools`、`campus_offers`、`campus_records`、`campus_accounts`、`campus_settings` 集合。

云函数支持 `CAMPUS_OPERATOR_PHONE_HASHES`、`CAMPUS_OPERATOR_BRANCH_PHONE_HASHES`、`CAMPUS_OUTLET_PHONE_HASHES` 和 `CAMPUS_MERCHANT_PHONE_HASHES` 环境变量。变量只填写手机号 SHA-256 摘要，不填写明文手机号。

### Node.js 服务器

服务器版使用根目录的 `server.js`、H5 页面、`backend/` 和 `database/`：

```powershell
npm ci
npm test
npm run dev
```

正式环境使用 Node.js 18+、HTTPS 和 SQL Server 或 MySQL。`.env.example` 是配置模板，生产环境必须配置 `ADMIN_AUTHORIZED_PHONE_HASHES`、`OFFLINE_AUTHORIZED_PHONE_HASHES`、`ACTIVATION_EXPORT_KEY` 和 `ID_IMAGE_ENCRYPTION_KEY`。

服务器版保留旧代码的安全保存方式：工作人员手机号 SHA-256 摘要、密码加盐摘要、身份证图片 AES-256-GCM 加密、已激活名单独立 AES-256-GCM 归档。密钥、`.env`、数据库备份、身份证图片和导出文件不得上传 GitHub。

## 当前业务

- 学生首页为“校园号码预约”，支持指定学校、二级学院和本机订单查询。
- 学生订单核销二维码默认隐藏，已核验订单显示“已核销”和“已完成”。
- 运营商按网格或青秀区分公司权限查看订单、统计和导出名单。
- 线下办理端按校园号码和特征码核验，并可导出当前账号的已核验名单。
- 商家兑换端只能查询订单，线下核验成功后才允许确认激活。
- 导出名单包含创建时间、核验时间以及实名人员和商家人员信息。

## 授权账号

授权手机号不以明文保存在代码中。云函数使用 `CAMPUS_*_PHONE_HASHES`，服务器使用 `ADMIN_AUTHORIZED_PHONE_HASHES` 和 `OFFLINE_AUTHORIZED_PHONE_HASHES`。服务器版可使用：

云函数内置权限为：六个分公司账号可登录运营商端、线下办理端和商家兑换端，并拥有全部网格权限；一个开发测试账号仅作为低权限网格运营商使用，不能登录线下办理端或商家兑换端。号码原文不写入仓库，实际授权台账应单独保存。

```powershell
npm run auth-phone -- admin add 13800138000
npm run auth-phone -- offline add 13900139000
```

脚本只写入 SHA-256 摘要，并在修改前生成 `.env.backup.<时间戳>`。

## 文档

- [正式版执行手册](./正式版执行手册.md)
- [云函数部署说明](./cloudfunctions/README.md)
- [服务器配置模板](./.env.example)

旧的“内测执行手册”已移除，正式部署、验收、备份和回滚以《正式版执行手册》为准。

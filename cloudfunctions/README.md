# 云函数目录

这里放校园通信服务的 `campusService` 云函数。它负责学校/学院查询、学生校园号码预约和本机订单、网格权限过滤、运营商统一线下实名地址、名单导出、线下实名核验和商家兑换激活。

部署前：

1. 在微信开发者工具创建云环境并取得环境 ID。
2. 将环境 ID 填入 `miniprogram/app.js` 的 `cloudEnvId`。
3. 选中 `campusService`，在开发者工具中“上传并部署：云端安装依赖”。
4. 云函数会直接使用当前云环境的 `campus_schools`、`campus_offers`、`campus_records`、`campus_accounts` 集合，不需要服务器或域名。

权限已按账号类型区分：六个分公司账号可以注册和登录运营商端、线下端、商家兑换端，并自动拥有分公司运营商的全部网格权限；开发测试账号只允许作为低权限网格运营商账号使用，不能登录线下端或商家兑换端。号码原文不写入仓库，代码只保存 SHA-256 摘要。

正式授权手机号可通过 `CAMPUS_OPERATOR_PHONE_HASHES`、`CAMPUS_OUTLET_PHONE_HASHES`、`CAMPUS_MERCHANT_PHONE_HASHES` 追加 SHA-256 白名单；分公司账号摘要可通过 `CAMPUS_OPERATOR_BRANCH_PHONE_HASHES` 追加。普通运营商和线下账号注册时需要填写网格；未配置环境变量时保持开发模式，允许测试注册。

调用方式：`wx.cloud.callFunction({ name: 'campusService', data: { action: 'proxy', path: '/api/schools?q=校园', method: 'GET' } })`。

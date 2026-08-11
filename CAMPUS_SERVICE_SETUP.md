# 校园通信三端配置

当前项目新增了三个业务入口，同时保留原有的 `pages/index/index` 和 `pages/example/index` QuickStart 页面。

## 上线前配置

1. 在 `miniprogram/app.js` 的 `globalData.env` 填入微信云开发环境 ID。
2. 上传并部署 `cloudfunctions/quickstartFunctions` 云函数，部署时安装 `package.json` 中的依赖。
3. 分别配置 `CAMPUS_OPERATOR_PHONE_HASHES`、`CAMPUS_OUTLET_PHONE_HASHES`，填写已授权工作人员手机号的 SHA-256 摘要，多个摘要用英文逗号分隔。运营商端和线下实体端必须使用已授权手机号注册/登录，未授权手机号无法注册或登录。密码只保存为加盐摘要；不要把手机号原文、密码或学生特征码写入代码或提交到仓库。
4. 在云开发数据库中确认云函数具备创建和读写 `campus_numbers`、`campus_orders`、`campus_staff_accounts`、`campus_staff_sessions` 集合的权限。首次注册工作人员账号会自动尝试创建集合。
5. 生产环境使用 HTTPS、最小权限的云环境，并根据运营商要求配置实名验证消息的安全传输和审计。

## 三端流程

- 学生端从可用号码中选择号码，填写姓名、学号、联系电话和收货信息。成功后会得到唯一特征码和线下地址，订单进入“待实名”。
- 运营商端使用授权手机号注册/登录。号码导入文本每行五列：`运营商，号码，套餐名称，月费，线下地址`。运营商可刷新订单并修改线下办理地址。
- 线下实体端由已授权实体店工作人员使用本人手机号注册/登录。实名导入文本每行三列：`特征码，身份证号码，验证结果`，也可追加第四列姓名。学生特征码只用于匹配订单，不用于登录。验证结果支持 `verified`、`success`、`passed`、`ok`、`通过`、`成功`。

实名导入成功后，服务端只保存身份证哈希和后四位，不保存身份证明文；订单和号码会一起变为“已激活”。特征码不存在、身份证格式错误、姓名不匹配或重复处理都会被拒绝，不会激活号码。

手机号摘要可用以下命令生成，然后把输出配置到对应云函数环境变量：

```powershell
node -e "console.log(require('crypto').createHash('sha256').update('13800138000').digest('hex'))"
```

## 云函数动作

新增动作全部位于原有 `quickstartFunctions` 中：`campusListOffers`、`campusReserveNumber`、`campusStudentOrders`、`campusStaffLogin`、`campusImportNumbers`、`campusListOrders`、`campusAssignOutlet`、`campusImportVerification`。原有 QuickStart 动作未删除。

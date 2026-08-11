# 校园通信三端配置

当前项目新增了三个业务入口，同时保留原有的 `pages/index/index` 和 `pages/example/index` QuickStart 页面。

## 上线前配置

1. 在 `miniprogram/app.js` 的 `globalData.env` 填入微信云开发环境 ID。
2. 上传并部署 `cloudfunctions/quickstartFunctions` 云函数，部署时安装 `package.json` 中的依赖。
3. 在云函数环境变量中设置 `CAMPUS_OPERATOR_KEY` 和 `CAMPUS_OUTLET_KEY` 两个不同的管理口令。运营商端和线下实体端按角色分别校验，不能把口令写进小程序代码或提交到仓库。为兼容旧部署，仍支持临时使用 `CAMPUS_STAFF_KEY`，但正式环境应删除该共享口令。
4. 在云开发数据库中确认云函数具备创建和读写 `campus_numbers`、`campus_orders` 集合的权限。首次登录运营商端会自动尝试创建集合。
5. 生产环境使用 HTTPS、最小权限的云环境，并根据运营商要求配置实名验证消息的安全传输和审计。

## 三端流程

- 学生端从可用号码中选择号码，填写姓名、学号和联系电话。成功后会得到唯一特征码和线下地址，订单进入“待实名”。
- 运营商端使用 `CAMPUS_STAFF_KEY` 登录。号码导入文本每行五列：`运营商，号码，套餐名称，月费，线下地址`。运营商可刷新订单并修改线下办理地址。
- 线下实体端使用同一个管理口令。实名导入文本每行三列：`特征码，身份证号码，验证结果`，也可追加第四列姓名。验证结果支持 `verified`、`success`、`passed`、`ok`、`通过`、`成功`。

实名导入成功后，服务端只保存身份证哈希和后四位，不保存身份证明文；订单和号码会一起变为“已激活”。特征码不存在、身份证格式错误、姓名不匹配或重复处理都会被拒绝，不会激活号码。

## 云函数动作

新增动作全部位于原有 `quickstartFunctions` 中：`campusListOffers`、`campusReserveNumber`、`campusStudentOrders`、`campusStaffLogin`、`campusImportNumbers`、`campusListOrders`、`campusAssignOutlet`、`campusImportVerification`。原有 QuickStart 动作未删除。

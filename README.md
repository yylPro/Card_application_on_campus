# 校园通信服务信息收集平台

面向高校校园场景的信息收集、服务预约和运营商选号平台。学生可以通过 H5 或微信小程序提交资料、选择脱敏号码、查询进度并确认服务；运营商人员在后台管理学校入口、号码库存和服务记录；线下实体工作人员负责核验学生身份并确认号码激活。

当前版本适合本机、受控内网和功能内测。公网正式上线前，必须完成 HTTPS、短信/身份能力、生产数据库、密钥管理和访问审计配置，不能直接使用开发默认值。

## 功能概览

- 统一 `/entry` 二维码入口，也兼容 `/q/<学校代码>` 学校专属入口。
- H5 与微信小程序共用同一套 Node.js API 和数据存储。
- 学校、学院搜索与选择，学生资料、身份证号码和身份证正反面图片收集。
- 校园网账号预约、宽带故障报修等普通服务工单。
- 中国移动、中国联通、中国电信脱敏号码的筛选、分页、预占和取消释放。
- 运营商后台的订单/工单处理、学校二维码、号码资源、线下实名地址和服务总开关管理。
- 线下实体端按“学生特征码 + 完整身份证号码”二次核对并激活号码，支持单条确认和 Excel 批量导入。
- CSV/Excel 导出、待处理导出、未激活选号导出和按日期筛选的已激活选号导出。
- JSON、SQL Server、MySQL 三种存储驱动；敏感图片和已激活名单使用 AES-256-GCM 加密。

## 技术栈

- Node.js 18+、原生 HTTP/HTTPS 服务
- 原生 HTML/CSS/JavaScript 前端
- 微信小程序原生页面（`miniprogram/`）
- `xlsx`：Excel 读写；`qrcode`：二维码生成；`mssql`/`mysql2`：数据库适配

## 快速开始

```powershell
npm ci
npm test
npm run dev
```

默认监听 `http://127.0.0.1:4173`。项目依赖后端 API，不能直接双击 HTML 文件，也不能只部署到 GitHub Pages。

不创建 `.env` 时，服务使用开发模式和 `data/db.json`：

- 自动创建 `data/db.json` 和 `data/id-images/`。
- 初始化 `XX大学` 及开发专用的 `校园通信服务示范大学（TEST-2026）`。
- 为测试学校提供 9 个脱敏测试号码；另有 3 个 `XX大学` 示例号码。
- 开发环境允许学生、运营商和线下实体端自助注册，并保留测试白名单。

开发入口：

- 统一入口：`http://127.0.0.1:4173/entry`
- 测试学校 H5：`http://127.0.0.1:4173/service/TEST-2026`
- 开发测试数据：`http://127.0.0.1:4173/api/dev/test-fixtures`（生产环境不存在）
- 健康检查：`http://127.0.0.1:4173/api/health`

开发测试手机号和测试号码只用于隔离环境，不要连接真实短信网关，也不要录入真实身份证资料。密码要求为 9-15 位，并同时包含大写字母、小写字母和数字。

## 三端入口

| 角色 | 地址 | 主要操作 |
| --- | --- | --- |
| 学生 | `/entry`、`/service`、`/student/login`、`/student/register` | 选学校/学院、提交预约或选号订单、上传证件图片、查询进度、确认完成并评价 |
| 运营商 | `/admin/login`、`/admin/register` | 管理学校入口、导入号码、处理订单、设置线下实名地址、导出数据、签发领卡凭证 |
| 线下实体 | `/offline/login`、`/offline/register` | 输入特征码和身份证号、核对学生信息、确认实名激活、批量导入实名结果 |

微信内的 `/entry` 页面会在配置完整时尝试拉起小程序，否则回退到 H5。小程序入口为 `miniprogram/pages/home/home`，流程包含选学校、选择服务、选号分页和进度查询。

## 业务流程

### 学生选号

1. 学生登录或注册，搜索并选择学校、学院。
2. 选择运营商和脱敏号码，填写姓名、学号、身份证号、联系电话、收货人、收货联系电话和收货地址。
3. 服务端校验身份证号、号码资源和必填同意项，并把号码状态改为“已预占”。
4. 运营商设置线下实名地址后，待激活订单会获得稳定的线下地址和 8 位特征码。
5. 学生在进度查询中查看特征码，在线下实体端核验身份证原件后完成激活。

学生原联系电话用于查询和实名匹配，收货联系电话仅用于号码卡配送；两者在订单中分别保存。

### 普通服务

校园网预约、宽带报修等记录走 `/api/tickets`，运营商可依次维护待联系、已派单、已预约、处理中、已完成或已取消等状态，学生完成后可以提交星级评价。

### 线下实名和领卡凭证

运营商可以导入包含“服务编号”的实名结果 Excel，系统为记录签发默认 30 天有效的二维码凭证。学生打开凭证页面后请求并填写验证码完成线下核销；号码激活仍以线下实体端的实名确认流程为准。

## 数据导入与导出

### 学校资料

服务启动时会读取 `data/imports/` 下第一个 `.xlsx`/`.xls` 文件：第一列为学校名称，第二列为学院列表（可使用顿号、逗号、分号或斜杠分隔）。仓库提供的默认文件为 `data/imports/青秀区高校.xlsx`。替换文件后重启服务即可同步，缺少学院时前端允许填写“其他学院”。也可以在运营商后台手工创建学校入口。

### 号码库存

运营商后台支持逐条录入或批量导入 `.xlsx`、`.xls`、`.csv`。导入时先选择学校，首行至少包含以下列：

```text
运营商,可选号码,套餐名称,月费
中国移动,138****0001,校园畅享套餐,39
```

号码必须为 `1XX****XXXX` 脱敏格式，只保存脱敏号码，不要把完整生产号码导入本系统。学生提交后号码进入“已预占”，取消未激活订单后回到“可选”。

### 实名结果

运营商导入实名结果时，首行必须包含 `服务编号`（也接受 `订单编号`、`recordId`、`serviceId`），可选 `运营商`、`运营商返回码`、`有效期至`。线下实体端批量导入时，首行必须包含 `特征码` 和 `身份证号码`，可选 `实名验证消息` 或 `验证流水号`。

### 导出接口

以下接口都要求运营商后台登录：

| 接口 | 内容 |
| --- | --- |
| `/api/admin/export` | CSV；可用 `?type=order` 或 `?type=ticket` 筛选记录 |
| `/api/admin/export.xlsx` | Excel“信息收集”和“学校学院汇总”两个工作表 |
| `/api/admin/export-pending.xlsx` | 所有待处理预约和工单 |
| `/api/admin/export-number-pending.xlsx` | 未取消且尚未激活的选号订单 |
| `/api/admin/export-activated.xlsx` | 已激活选号订单；支持 `from=YYYY-MM-DD&to=YYYY-MM-DD` |

## 配置

`.env.example` 是配置模板。开发时不要直接启用其中的 HTTPS 和生产数据库配置；生产环境应通过安全渠道单独创建 `.env`。

常用配置如下：

```dotenv
PORT=4173
NODE_ENV=development
DB_DRIVER=json
DATA_FILE=./data/db.json

# 生产环境必须替换为强密码；密码需为 9-15 位并包含大小写字母和数字
ADMIN_USER=operator
ADMIN_PASSWORD=替换为独立强密码
ADMIN_AUTHORIZED_PHONE_HASHES=
OFFLINE_AUTHORIZED_PHONE_HASHES=

# 生产环境必须配置两把不同的 32 字节 Base64 密钥
ACTIVATION_EXPORT_KEY=
ID_IMAGE_ENCRYPTION_KEY=
```

数据库驱动：

- `json`：默认开发模式，数据写入 `DATA_FILE`，适合单机演示和自动化测试。
- `sqlserver`：使用 `DB_HOST`、`DB_PORT`、`DB_NAME`、`DB_USER`、`DB_PASSWORD`、`DB_TRUST_CERT`，结构脚本为 `database/sqlserver.sql`。
- `mysql`：使用同名连接变量，结构脚本为 `database/mysql.sql`。

SQL Server 和 MySQL 适配器当前把应用状态保存为 `campus_snapshot` 快照表。生产环境只能选择一个主库，不能让两个数据库同时接受写入。

微信小程序和外部服务为可选配置：

- `WECHAT_OFFICIAL_APP_ID`、`WECHAT_OFFICIAL_APP_SECRET`、`WECHAT_MINIPROGRAM_APP_ID`、`WECHAT_MINIPROGRAM_HOME`
- `SMS_WEBHOOK_URL`、`SMS_WEBHOOK_TOKEN`
- `SCHOOL_VERIFY_URL`、`SCHOOL_VERIFY_TOKEN`
- `IMPORT_DIR`、`TEST_PHONE_NUMBERS`

## 安全边界

- 生产环境（`NODE_ENV=production`）默认关闭三端自助注册、移除内置测试白名单、禁止 JSON 存储，并强制配置 `ACTIVATION_EXPORT_KEY` 和 `ID_IMAGE_ENCRYPTION_KEY`。
- 运营商和线下实体账号使用授权手机号的 SHA-256 摘要进行注册和登录校验；配置项只接受摘要。手机号原文、密码、密钥和 `.env` 不得提交到 Git 或导出文件，审计日志中的参与者标识也应按敏感信息保护。
- 密码使用加盐摘要保存，登录有失败限流；会话使用 HttpOnly、SameSite=Strict Cookie。
- 身份证号校验 18 位居民身份证的行政区前缀、出生日期、顺序码和 GB 11643 校验位。
- 身份证图片只接受 PNG/JPEG，服务端检查声明格式与文件签名，单张不超过 5MB，随后使用 AES-256-GCM 加密为 `.enc` 文件。当前代码未执行图片尺寸或身份证真伪核验；现场仍必须核验原件。
- 已激活名单归档使用独立 AES-256-GCM 密文；密钥丢失或更换后历史归档无法解密。
- 请求体上限为 16MB；静态资源采用白名单，`data/`、源码、配置、数据库和测试目录不会作为静态文件公开；响应包含 CSP、`X-Frame-Options` 等安全头，生产模式附带 HSTS。

公网部署前至少应完成：受信任 CA 证书、HTTPS 强制访问、SQL Server/MySQL 最小权限账号、独立密钥备份与恢复演练、短信/身份能力接入、日志和文件访问审计，以及测试数据清理。

## 测试与项目结构

```powershell
npm ci
npm test
```

主要目录和文件：

```text
server.js                 Node.js API、鉴权、静态资源和导出
backend/storage.js        JSON/SQL Server/MySQL 存储适配器
index.html / app.js       学生 H5
operator.html / operator.js 运营商后台
offline.html / offline.js    线下实体端
dispatch.html / dispatch.js 统一入口和微信分流
miniprogram/              微信小程序
data/imports/             学校 Excel
database/                 SQL Server/MySQL 建表脚本
test/service.test.js      Node.js 内置测试
```

## 尚未接入

当前代码不包含真实短信网关、微信登录态、权威学生资格/身份证核验、运营商 CRM/开卡接口和正式对象存储。`SMS_WEBHOOK_*`、`SCHOOL_VERIFY_*` 等配置只在获得对应服务授权并完成联调后启用。

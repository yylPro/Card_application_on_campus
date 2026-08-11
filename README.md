# 校园通信服务信息收集平台

这是一个面向高校学生的信息收集与运营商选号系统。学生可通过 H5 页面或微信小程序独立进入办理流程；运营商人员通过后台查看、筛选、导出和处理信息。当前核心范围是收集学生资料、身份证正反面、学校与学院、联系电话，以及移动、联通、电信的可选号码，不依赖学校的查询接口。

## 主要入口

- 统一二维码入口：`http://127.0.0.1:4173/entry`
- 学生登录/注册：`http://127.0.0.1:4173/student/login`、`http://127.0.0.1:4173/student/register`
- 学生 H5：`http://127.0.0.1:4173/service`
- 运营商登录/注册：`http://127.0.0.1:4173/admin/login`、`http://127.0.0.1:4173/admin/register`
- 线下实体端登录/注册：`http://127.0.0.1:4173/offline/login`、`http://127.0.0.1:4173/offline/register`
- Excel 导出：后台登录后访问 `http://127.0.0.1:4173/api/admin/export.xlsx`

正式推广使用同一个 `/entry` 二维码，不在二维码中写入学校编码。微信内优先尝试拉起小程序，其他环境或小程序未配置时进入 H5；两端都会先让学生搜索并选择学校、学院，再进入后续办理。H5 和小程序共用同一个后端接口与号码库存，但任一端不依赖另一端运行。旧的 `/q/<学校编码>` 链接仍兼容，用于已有学校专属二维码。

## 本地运行

全新下载仓库后必须启动 Node.js 服务，不能直接双击 `index.html`，也不能只用 GitHub Pages；号码、登录、订单和学校查询都依赖后端 API。

```powershell
npm ci
npm test
npm run dev
```

不创建 `.env` 时，开发服务默认使用 `http://127.0.0.1:4173` 和本地 JSON 数据库。首次启动会自动创建 `data/db.json`、开发测试学校和 12 个测试号码，无需连接作者电脑上的 SQL Server。打开统一入口后搜索“校园通信”，必须点击下拉结果中的“校园通信服务示范大学”，再进入“在线选号”；也可以直接访问 `http://127.0.0.1:4173/service/TEST-2026`。

`.env.example` 是生产配置模板，不要为了本机快速测试直接复制后原样启动。只有显式配置 `HTTPS=true` 和本地证书后才使用 HTTPS；正式部署必须使用受信任 CA 证书，并配置 `TLS_KEY_FILE`/`TLS_CERT_FILE` 或 `TLS_PFX_FILE`。

首次启动后，学生先注册/登录办理账户；运营商和线下实体工作人员分别使用各自白名单中的授权手机号注册/登录对应后台。密码必须为 9-15 位，并同时包含大写字母、小写字母和数字；服务端只保存加盐摘要。

运营商授权手机号不保存明文：服务端内置多个 SHA-256 手机号摘要，登录和注册前先对输入手机号计算 SHA-256，再与摘要集合比对；未命中的手机号一律返回未授权。需要追加授权手机号时，只在服务器 `.env` 的 `ADMIN_AUTHORIZED_PHONE_HASHES` 中填写新的 SHA-256 摘要，不要把手机号原文提交到 GitHub。当前内置授权测试手机号为 `13987654321`、`18600000001`。

后台配置使用 `.env` 中的 `ADMIN_PASSWORD` 和 `ADMIN_AUTHORIZED_PHONE_HASHES`。授权手机号摘要不要写入前端、Excel 或 GitHub；密码也必须在部署前替换为独立强密码。

线下实体端使用独立的 `OFFLINE_AUTHORIZED_PHONE_HASHES` 白名单。当前开发环境内置实体端测试手机号 `18500000001`；生产部署应追加正式工作人员手机号的 SHA-256 摘要，并按人员变更及时停用授权。学生特征码仅用于现场实名记录匹配，不用于任何端的登录。

选号激活流程：学生选择号码并填写号码卡收货地址后提交订单，订单保持“待线下实名、待激活”；运营商维护一个适用于全部选号订单的线下实名地址，系统为每个学生生成独立特征码。收货地址只用于号码卡配送，线下实名地址用于学生到店核验，两者分别保存和展示。学生从进度查询中查看线下实名地址和本人特征码；实体端工作人员使用授权手机号登录，输入特征码和学生身份证号码，系统先显示姓名、原联系电话、运营商和选号号码；工作人员现场核对并二次确认后，订单实名状态、激活状态、订单状态和号码资源状态统一更新为已完成/已激活。全局线下实名地址更新会同步至所有尚未激活的选号订单，已激活记录不再变更。

已实名激活名单会另外使用 AES-256-GCM 加密归档。生产环境必须在 `.env` 配置 `ACTIVATION_EXPORT_KEY`（32 字节随机密钥的 Base64 编码），并将密钥纳入独立备份；密钥丢失或更换后历史归档无法解密。运营商登录后台后可点击“导出已激活”，生成包含学校、学院、姓名、身份证号、选号号码、联系电话、备选联系电话和激活状态的 Excel。

身份证号按 18 位居民身份证规则校验行政区前缀、出生日期、顺序码和 GB 11643 校验位；身份证图片会核对 PNG/JPEG 文件签名、文件结构、MIME 类型、最小 300×180 尺寸及 2MB 上限，再使用独立的 `ID_IMAGE_ENCRYPTION_KEY` 进行 AES-256-GCM 加密，落盘文件扩展名为 `.enc`。这些校验只能拦截明显乱填和伪装文件，不能证明身份证真实存在或属于提交人；激活时必须由线下工作人员核验身份证原件，正式自动核验需另接权威身份接口。生产模式默认关闭三端自助注册、移除内置特权测试号码、禁止 JSON 数据库，并在缺少任一加密密钥时拒绝启动。位于反向代理之后时，只有确认代理会覆盖客户端传入的转发头后才能设置 `TRUST_PROXY=true`。

## 学校 Excel

高校资料固定放在：`data/imports/青秀区高校.xlsx`。

后端启动时会读取其中的学校名称和二级学院并同步到系统。以后高校资料更新时，直接用新文件替换该路径下的同名 Excel，然后重启服务即可。没有二级学院数据的学校会显示“其他学院”，允许学生手工填写。

号码库存应由运营商导入，最少包含两列：`运营商`、`号码`。号码被学生提交后会从可选池中锁定；运营商在后台取消该记录后，号码会自动回到原运营商的可选池。选号接口支持按运营商、号码关键词分页查询，适用于几千条以上号码库存。

## 数据库配置

开发时可以使用 JSON 文件；只要需要多人同时办理、号码占用不能冲突、运营商后台要长期保存和导出数据，就应使用数据库。本机已为本项目创建独立 SQL Server 数据库，不会使用或修改电脑中已有的其他库。

### 已创建的 SQL Server 本地库

- 数据库名：`CampusService`
- 数据文件目录：`D:\CampusServiceData`
- 数据文件：`CampusService.mdf`
- 日志文件：`CampusService_log.ldf`
- 应用登录名：`campus_app`
- 应用配置：项目根目录 `.env`（已被 Git 忽略，绝不提交）

启动服务前，`.env` 应包含：

```dotenv
DB_DRIVER=sqlserver
DB_HOST=localhost
DB_PORT=1433
DB_NAME=CampusService
DB_USER=campus_app
DB_PASSWORD=填写本机 .env 中已经生成的密码
DB_TRUST_CERT=true
```

执行 `npm run dev` 后，后端会连接 SQL Server。可用以下命令确认当前使用的是 SQL Server，而不是 JSON：

```powershell
$env:DB_DRIVER='sqlserver'
npm run dev
```

数据库结构脚本在 `database/sqlserver.sql`。首次在另一台 Windows 电脑部署时：

1. 安装 SQL Server，并确认服务账号有权写入 `D:\CampusServiceData`。
2. 以管理员 PowerShell 创建目录：`New-Item -ItemType Directory -Force D:\CampusServiceData`。
3. 使用 SSMS 或 `sqlcmd` 以管理员身份执行 `database/sqlserver.sql`，创建 `CampusService` 与 `campus_snapshot` 表。
4. 在 `master` 中创建只供应用使用的 SQL 登录，并在 `CampusService` 中创建同名用户，授予最小权限：

```sql
USE [master];
GO
CREATE LOGIN [campus_app] WITH PASSWORD = '请生成一条随机长密码';
GO
USE [CampusService];
GO
CREATE USER [campus_app] FOR LOGIN [campus_app];
ALTER ROLE [db_datareader] ADD MEMBER [campus_app];
ALTER ROLE [db_datawriter] ADD MEMBER [campus_app];
GO
```

5. 把同一密码填入服务器的 `.env`，设置 `DB_DRIVER=sqlserver`，再启动 Node 服务。

当前适配器将系统状态作为一个受事务保护的快照写入 `campus_snapshot`，以保持现有 JSON 业务逻辑与 SQL Server/MySQL 的兼容。它可用于当前部署和 Excel 导出；当接入多台应用服务器或需要更复杂的运营统计时，应把学生、学校、号码、订单、操作日志拆为独立的规范化表，并把每一次写入改为等待数据库提交成功。

### MySQL 选项

系统同时支持 MySQL。先在 MySQL 中创建数据库并执行 `database/mysql.sql`，然后在 `.env` 中配置：

```dotenv
DB_DRIVER=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=CampusService
DB_USER=campus_app
DB_PASSWORD=你的 MySQL 应用密码
```

建议在 SQL Server 和 MySQL 中二选一作为同一生产环境的唯一主库，不能让两个库同时接受写入。迁移时应先停止写入、备份和校验导出数据，再切换 `DB_DRIVER`。

### JSON 开发模式

不配置数据库时使用：

```dotenv
DB_DRIVER=json
DATA_FILE=./data/db.json
```

JSON 仅适用于单机演示和自动化测试，不适合真实多人并发办理或长期保存身份证资料。

## 导出、备份与安全

- 运营商后台可下载 `/api/admin/export.xlsx`，包含按“学校、学院”排序的明细表，以及“学校学院汇总”统计表，便于按院校和学院分派处理。
- 生产环境应每天备份数据库，并定期演练恢复；Excel 只作业务导出，不替代数据库备份。
- 请求体限制为 5MB，图片单张限制为 2MB；密码登录有失败次数限制，号码查询和分页参数也有上限，避免超大请求和高频密码尝试。
- `.env` 包含数据库与后台密码，已在 `.gitignore` 中排除，不能上传 GitHub、微信或截图。
- 身份证图片属于敏感个人信息：当前新上传图片会使用 AES-256-GCM 加密落盘，静态服务不提供 `data/` 目录；生产环境仍应迁移到受访问控制的对象存储或加密磁盘，并为后台查看建立鉴权和审计。
- 对外部署必须使用 HTTPS、独立后台账号、最小数据库权限，以及数据库和文件的访问审计。

## 已实现与待对接

已实现：学生两步信息收集、学校与学院匹配、三运营商分页选号、号码锁定与取消释放；运营商端号码导入、订单管理、线下地址与随机特征码分配；线下实体端授权手机号注册登录、实名验证消息 Excel 导入，以及按“特征码 + 完整身份证号”双重匹配激活；同时支持 JSON/SQL Server/MySQL 存储适配。

待真实上线对接：运营商正式号码导入格式、真实短信或微信身份能力、身份证图片的安全对象存储、正式域名和 HTTPS、运营商 CRM/开卡接口，以及更细的权限分级和完整审计。公网部署前还必须配置 `ACTIVATION_EXPORT_KEY`、`ID_IMAGE_ENCRYPTION_KEY`，使用 SQL Server/MySQL，并完成静态路径和历史明文图片清理验收。

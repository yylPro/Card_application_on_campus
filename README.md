# 校园通信服务信息收集平台

这是一个面向高校学生的信息收集与运营商选号系统。学生可通过 H5 页面或微信小程序独立进入办理流程；运营商人员通过后台查看、筛选、导出和处理信息。当前核心范围是收集学生资料、身份证正反面、学校与学院、联系电话，以及移动、联通、电信的可选号码，不依赖学校的查询接口。

## 主要入口

- 统一二维码入口：`http://127.0.0.1:4173/entry`
- 学生登录/注册：`https://127.0.0.1:4173/student/login`、`https://127.0.0.1:4173/student/register`
- 学生 H5：`https://127.0.0.1:4173/service`
- 运营商登录/注册：`https://127.0.0.1:4173/admin/login`、`https://127.0.0.1:4173/admin/register`
- Excel 导出：后台登录后访问 `http://127.0.0.1:4173/api/admin/export.xlsx`

正式推广使用同一个 `/entry` 二维码，不在二维码中写入学校编码。微信内优先尝试拉起小程序，其他环境或小程序未配置时进入 H5；两端都会先让学生搜索并选择学校、学院，再进入后续办理。H5 和小程序共用同一个后端接口与号码库存，但任一端不依赖另一端运行。旧的 `/q/<学校编码>` 链接仍兼容，用于已有学校专属二维码。

## 本地运行

```powershell
npm install
npm test
npm run dev
```

首次启动后，学生先注册/登录办理账户，运营商使用已授权手机号注册/登录后台。密码必须为 9-15 位，并同时包含大写字母、小写字母和数字；服务端只保存加盐摘要。开发环境使用 `certs/localhost.pfx` 自签名证书，浏览器首次访问需要接受安全提示；正式部署必须替换为受信任 CA 证书，并配置 `TLS_KEY_FILE`/`TLS_CERT_FILE` 或 `TLS_PFX_FILE`。

运营商授权手机号不保存明文：服务端内置多个 SHA-256 手机号摘要，登录和注册前先对输入手机号计算 SHA-256，再与摘要集合比对；未命中的手机号一律返回未授权。需要追加授权手机号时，只在服务器 `.env` 的 `ADMIN_AUTHORIZED_PHONE_HASHES` 中填写新的 SHA-256 摘要，不要把手机号原文提交到 GitHub。当前内置授权测试手机号为 `13987654321`、`18600000001`。

后台配置使用 `.env` 中的 `ADMIN_PASSWORD` 和 `ADMIN_AUTHORIZED_PHONE_HASHES`。授权手机号摘要不要写入前端、Excel 或 GitHub；密码也必须在部署前替换为独立强密码。

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
- 身份证图片属于敏感个人信息：生产环境应使用受访问控制的对象存储或加密磁盘，后台下载必须经过登录鉴权，并记录导出和查看日志。
- 对外部署必须使用 HTTPS、独立后台账号、最小数据库权限，以及数据库和文件的访问审计。

## 已实现与待对接

已实现：学生两步信息收集、可选学号与备用电话、身份证正反面上传、学校与学院匹配、三运营商分页选号、号码锁定与取消释放、运营商后台和 Excel 导出，以及 JSON/SQL Server/MySQL 存储适配。

待真实上线对接：运营商正式号码导入格式、真实短信或微信身份能力、身份证图片的安全对象存储、正式域名和 HTTPS、运营商 CRM/开卡接口，以及权限分级和完整审计。

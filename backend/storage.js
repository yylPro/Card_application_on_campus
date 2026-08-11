const fs = require('node:fs');
const path = require('node:path');

class Storage {
  constructor(options) {
    this.driver = options.driver || 'json';
    this.file = options.file;
    this.initial = options.initial;
    this.normalize = options.normalize;
    this.pool = null;
  }

  async init() {
    if (this.driver === 'json') return this.normalize(JSON.parse(fs.readFileSync(this.file, 'utf8')));
    if (this.driver === 'sqlserver') {
      const sql = require('mssql');
      const instanceName = String(process.env.DB_INSTANCE || '').trim();
      const port = Number(process.env.DB_PORT || 0);
      const config = {
        server: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'CampusService',
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        options: {
          encrypt: process.env.DB_ENCRYPT === 'true',
          trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
          ...(instanceName ? { instanceName } : {})
        }
      };
      if (!instanceName && Number.isInteger(port) && port > 0) config.port = port;
      this.pool = await sql.connect(config);
      await this.pool.request().query("IF OBJECT_ID(N'dbo.campus_snapshot', N'U') IS NULL CREATE TABLE dbo.campus_snapshot (id tinyint NOT NULL PRIMARY KEY, payload nvarchar(max) NOT NULL, updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME())");
      const result = await this.pool.request().query('SELECT payload FROM dbo.campus_snapshot WHERE id=1');
      if (!result.recordset.length) { await this.save(this.initial); return this.normalize(this.initial); }
      return this.normalize(JSON.parse(result.recordset[0].payload));
    }
    if (this.driver === 'mysql') {
      const mysql = require('mysql2/promise');
      this.pool = mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), database: process.env.DB_NAME || 'CampusService', user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectionLimit: 10 });
      await this.pool.query('CREATE TABLE IF NOT EXISTS campus_snapshot (id TINYINT PRIMARY KEY, payload JSON NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)');
      const [rows] = await this.pool.query('SELECT payload FROM campus_snapshot WHERE id=1');
      if (!rows.length) { await this.save(this.initial); return this.normalize(this.initial); }
      return this.normalize(typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload);
    }
    throw new Error(`不支持的数据库类型: ${this.driver}`);
  }

  async save(db) {
    if (this.driver === 'json') { const tmp = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8'); fs.renameSync(tmp, this.file); return; }
    const payload = JSON.stringify(db);
    if (this.driver === 'sqlserver') { await this.pool.request().input('payload', payload).query("MERGE dbo.campus_snapshot AS target USING (SELECT CAST(1 AS tinyint) AS id, @payload AS payload) AS source ON target.id=source.id WHEN MATCHED THEN UPDATE SET payload=source.payload, updated_at=SYSUTCDATETIME() WHEN NOT MATCHED THEN INSERT(id,payload) VALUES(source.id,source.payload);"); return; }
    await this.pool.query('INSERT INTO campus_snapshot (id,payload) VALUES (1,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload)', [payload]);
  }
}

module.exports = { Storage };

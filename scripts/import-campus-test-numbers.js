const fs = require('node:fs');
const sql = require('mssql');

function loadEnv() {
  const values = {};
  for (const raw of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[line.slice(0, separator).trim()] = value;
  }
  return values;
}

const env = loadEnv();
const config = {
  server: env.DB_HOST || 'localhost',
  database: env.DB_NAME || 'CampusService',
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: {
    encrypt: env.DB_ENCRYPT === 'true',
    trustServerCertificate: env.DB_TRUST_CERT !== 'false',
    ...(env.DB_INSTANCE ? { instanceName: env.DB_INSTANCE } : {}),
  },
};
if (!env.DB_INSTANCE && env.DB_PORT) config.port = Number(env.DB_PORT);

const testOffers = [
  ['INTERNAL-CM-0001', '中国移动', '138****0001', '校园号码套餐 A'],
  ['INTERNAL-CM-0002', '中国移动', '139****0002', '校园号码套餐 B'],
  ['INTERNAL-CM-0003', '中国移动', '158****0003', '校园号码套餐 C'],
  ['INTERNAL-CU-0001', '中国联通', '186****0001', '校园号码套餐 A'],
  ['INTERNAL-CU-0002', '中国联通', '185****0002', '校园号码套餐 B'],
  ['INTERNAL-CU-0003', '中国联通', '130****0003', '校园号码套餐 C'],
  ['INTERNAL-CT-0001', '中国电信', '189****0001', '校园号码套餐 A'],
  ['INTERNAL-CT-0002', '中国电信', '181****0002', '校园号码套餐 B'],
  ['INTERNAL-CT-0003', '中国电信', '133****0003', '校园号码套餐 C'],
];

async function main() {
  const pool = await sql.connect(config);
  try {
    const result = await pool.request().query('SELECT payload FROM dbo.campus_snapshot WHERE id=1');
    if (!result.recordset.length) throw new Error('campus_snapshot is empty');
    const database = JSON.parse(result.recordset[0].payload);
    database.numberOffers = Array.isArray(database.numberOffers) ? database.numberOffers : [];
    let added = 0;
    for (const [id, operator, displayNumber, planName] of testOffers) {
      if (database.numberOffers.some((offer) => offer.id === id || offer.displayNumber === displayNumber)) continue;
      database.numberOffers.push({ id, schoolCode: 'XXU-2026', operator, displayNumber, planName, monthlyFee: 0, status: 'available', reservedBy: '' });
      added += 1;
    }
    const payload = JSON.stringify(database);
    await pool.request().input('payload', payload).query("MERGE dbo.campus_snapshot AS target USING (SELECT CAST(1 AS tinyint) AS id, @payload AS payload) AS source ON target.id=source.id WHEN MATCHED THEN UPDATE SET payload=source.payload, updated_at=SYSUTCDATETIME() WHEN NOT MATCHED THEN INSERT(id,payload) VALUES(source.id,source.payload);");
    console.log(JSON.stringify({ added, total: database.numberOffers.length }));
  } finally {
    await pool.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

#!/usr/bin/env node
'use strict';

/**
 * Add an authorized staff phone number to .env without storing the number.
 * Usage: node scripts/manage-authorized-phone.js [admin|offline] [phone]
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const KEYS = {
  admin: 'ADMIN_AUTHORIZED_PHONE_HASHES',
  offline: 'OFFLINE_AUTHORIZED_PHONE_HASHES'
};

function usage() {
  console.error('用法: node scripts/manage-authorized-phone.js [admin|offline] [手机号]');
  console.error('示例: node scripts/manage-authorized-phone.js admin');
  console.error('      node scripts/manage-authorized-phone.js offline 13800138000');
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'admin' || role === 'operator' || role === '运营商') return 'admin';
  if (role === 'offline' || role === '实体' || role === '线下') return 'offline';
  return '';
}

function normalizePhone(value) {
  const phone = String(value || '').trim().replace(/[\s-]/g, '');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error('请输入有效的中国大陆 11 位手机号（以 1 开头）');
  return phone;
}

function hashPhone(phone) {
  return crypto.createHash('sha256').update(phone, 'utf8').digest('hex');
}

function question(prompt, hidden = false) {
  return new Promise((resolve) => {
    const input = process.stdin;
    const output = process.stdout;
    let masked = false;
    if (hidden && process.platform !== 'win32' && input.isTTY) {
      try {
        spawnSync('stty', ['-echo'], { stdio: 'inherit' });
        masked = true;
      } catch { /* fall back to normal input */ }
    }
    const rl = readline.createInterface({ input, output });
    rl.question(prompt, (answer) => {
      rl.close();
      if (masked) {
        spawnSync('stty', ['echo'], { stdio: 'inherit' });
        output.write('\n');
      }
      resolve(answer);
    });
  });
}

async function getInputs() {
  const args = process.argv.slice(2);
  let role = normalizeRole(args[0]);
  if (!role) {
    role = normalizeRole(await question('端类型（admin=运营商，offline=线下实体端）: '));
  }
  if (!role) throw new Error('端类型只能是 admin 或 offline');
  const phone = normalizePhone(args[1] || await question('工作人员手机号（只用于计算摘要，不会写入文件）: ', true));
  return { role, phone };
}

function updateEnv(role, digest) {
  if (!fs.existsSync(ENV_FILE)) throw new Error(`找不到 ${ENV_FILE}，请先创建 .env`);
  const key = KEYS[role];
  const original = fs.readFileSync(ENV_FILE, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    if (!line.trim() || line.trim().startsWith('#')) return line;
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match || match[2] !== key) return line;
    found = true;
    const values = match[4].split(',').map((value) => value.trim()).filter(Boolean);
    if (!values.includes(digest)) values.push(digest);
    return `${match[1]}${key}=${values.join(',')}`;
  });
  if (!found) {
    while (updated.length && updated[updated.length - 1] === '') updated.pop();
    updated.push(`${key}=${digest}`, '');
  }
  const content = updated.join(newline);
  const backup = `${ENV_FILE}.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(ENV_FILE, backup);
  fs.writeFileSync(ENV_FILE, content, { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(ENV_FILE, 0o600); } catch { /* Windows has no POSIX mode */ }
  return { backup, added: !original.includes(`${key}=${digest}`) };
}

async function main() {
  try {
    const { role, phone } = await getInputs();
    const digest = hashPhone(phone);
    const result = updateEnv(role, digest);
    // Do not print the phone number. The digest is safe to use in .env but is
    // intentionally not printed either, so terminal logs do not become an
    // authorization list.
    console.log(result.added ? '授权手机号摘要已添加。' : '该手机号摘要已存在，未重复添加。');
    console.log(`已更新 ${KEYS[role]}，备份文件：${path.basename(result.backup)}`);
    console.log('下一步：确认配置后执行 pm2 restart campus-service --update-env');
  } catch (error) {
    console.error(`错误：${error.message}`);
    usage();
    process.exitCode = 1;
  }
}

main();

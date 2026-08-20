#!/usr/bin/env node
'use strict';

// Add or remove authorized staff phone numbers from the server .env file.
// Usage: node scripts/manage-authorized-phone.js [admin|offline] [add|remove] [phone ...]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = process.env.AUTHORIZED_PHONE_ENV_FILE
  ? path.resolve(process.env.AUTHORIZED_PHONE_ENV_FILE)
  : path.join(ROOT, '.env');
const KEYS = { admin: 'ADMIN_AUTHORIZED_PHONE_HASHES', offline: 'OFFLINE_AUTHORIZED_PHONE_HASHES', merchant: 'MERCHANT_AUTHORIZED_PHONE_HASHES' };

function usage() {
  console.error('Usage: node scripts/manage-authorized-phone.js [admin|offline] [add|remove] [phone1 phone2 ...]');
  console.error('Examples:');
  console.error('  node scripts/manage-authorized-phone.js admin add 13800138000,13900139000');
  console.error('  node scripts/manage-authorized-phone.js offline remove 13800138000');
  console.error('  node scripts/manage-authorized-phone.js');
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (['admin', 'operator', '运营商'].includes(role)) return 'admin';
  if (['offline', '实体', '线下'].includes(role)) return 'offline';
  if (['merchant', '商家', '兑换'].includes(role)) return 'merchant';
  return '';
}

function normalizeAction(value) {
  const action = String(value || '').trim().toLowerCase();
  if (['add', 'write', 'append', '新增', '写入'].includes(action)) return 'add';
  if (['remove', 'delete', 'del', '删', '删除'].includes(action)) return 'remove';
  return '';
}

function splitPhones(value) {
  return String(value || '').split(/[\s,，;；]+/).map((item) => item.trim()).filter(Boolean);
}

function normalizePhone(value) {
  const phone = String(value || '').replace(/[\s-]/g, '');
  if (!/^1[3-9]\d{9}$/.test(phone)) throw new Error(`Invalid mainland China mobile number: ${value}`);
  return phone;
}

function phoneHash(phone) {
  return crypto.createHash('sha256').update(phone, 'utf8').digest('hex');
}

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => { rl.close(); resolve(answer); });
  });
}

async function inputs() {
  const args = process.argv.slice(2);
  const role = normalizeRole(args.shift() || await ask('端类型（admin=运营商，offline=线下实体端，merchant=商家兑换端）: '));
  if (!role) throw new Error('端类型只能是 admin、offline 或 merchant');

  // Keep the old "role phone..." form as an add operation.
  let action = normalizeAction(args[0]);
  if (action) args.shift();
  else if (args.length) action = 'add';
  else action = normalizeAction(await ask('操作（add=新增，remove=删除）: '));
  if (!action) throw new Error('操作只能是 add 或 remove');

  const raw = args.join(' ') || await ask('手机号（多个号码用逗号、空格、分号分隔）: ');
  const phones = [...new Set(splitPhones(raw).map(normalizePhone))];
  if (!phones.length) throw new Error('至少输入一个手机号');
  return { role, action, phones };
}

function updateEnv(role, action, hashes) {
  if (!fs.existsSync(ENV_FILE)) throw new Error(`Missing ${ENV_FILE}`);
  const key = KEYS[role];
  const original = fs.readFileSync(ENV_FILE, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  let found = false;
  let previous = [];
  let next = [];
  const requested = new Set(hashes);
  const updated = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match || match[2] !== key) return line;
    found = true;
    previous = [...new Set(match[4].split(',').map((value) => value.trim()).filter(Boolean))];
    next = action === 'add'
      ? [...previous, ...hashes.filter((hash) => !previous.includes(hash))]
      : previous.filter((hash) => !requested.has(hash));
    return `${match[1]}${key}=${next.join(',')}`;
  });
  if (!found) {
    if (action === 'remove') return { changed: false, previous: [], next: [], removed: 0 };
    next = [...new Set(hashes)];
    while (updated.length && updated[updated.length - 1] === '') updated.pop();
    updated.push(`${key}=${next.join(',')}`, '');
  }
  const removed = action === 'remove' ? previous.filter((hash) => requested.has(hash)).length : 0;
  const changed = !found || previous.length !== next.length || previous.some((hash, index) => hash !== next[index]);
  if (!changed) return { changed: false, previous, next, removed };

  const backup = `${ENV_FILE}.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(ENV_FILE, backup);
  fs.writeFileSync(ENV_FILE, updated.join(newline), 'utf8');
  try { fs.chmodSync(ENV_FILE, 0o600); } catch { /* Windows */ }
  return { changed: true, backup, previous, next, removed };
}

async function main() {
  try {
    const { role, action, phones } = await inputs();
    const hashes = phones.map(phoneHash);
    const result = updateEnv(role, action, hashes);
    const added = action === 'add' ? result.next.length - result.previous.length : 0;
    const removed = action === 'remove' ? result.removed : 0;
    console.log(`${action === 'add' ? 'Added' : 'Removed'} ${action === 'add' ? added : removed} phone hash(es); ${action === 'add' ? phones.length - added : phones.length - removed} unchanged.`);
    console.log(`${KEYS[role]} now contains ${result.next.length} configured hash(es).`);
    if (result.changed) {
      console.log(`Backup: ${path.basename(result.backup)}`);
      console.log('Restart with: pm2 restart campus-service --update-env');
    } else {
      console.log('No file change was needed; restart is not required.');
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    usage();
    process.exitCode = 1;
  }
}

main();

#!/usr/bin/env node
'use strict';

// Add one or more authorized staff phone numbers to .env.
// Usage: node scripts/manage-authorized-phone.js [admin|offline] [phone ...]

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const KEYS = { admin: 'ADMIN_AUTHORIZED_PHONE_HASHES', offline: 'OFFLINE_AUTHORIZED_PHONE_HASHES' };

function usage() {
  console.error('Usage: node scripts/manage-authorized-phone.js [admin|offline] [phone1 phone2 ...]');
  console.error('Example: node scripts/manage-authorized-phone.js admin 13800138000,13900139000');
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (['admin', 'operator', '运营商'].includes(role)) return 'admin';
  if (['offline', '实体', '线下'].includes(role)) return 'offline';
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
  const role = normalizeRole(args[0] || await ask('端类型（admin=运营商，offline=线下实体端）: '));
  if (!role) throw new Error('端类型只能是 admin 或 offline');
  const raw = args.slice(1).join(' ') || await ask('手机号（多个号码用逗号、空格、分号分隔）: ');
  const phones = [...new Set(splitPhones(raw).map(normalizePhone))];
  if (!phones.length) throw new Error('至少输入一个手机号');
  return { role, phones };
}

function updateEnv(role, hashes) {
  if (!fs.existsSync(ENV_FILE)) throw new Error(`Missing ${ENV_FILE}`);
  const key = KEYS[role];
  const original = fs.readFileSync(ENV_FILE, 'utf8');
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  let found = false;
  const updated = lines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match || match[2] !== key) return line;
    found = true;
    const values = match[4].split(',').map((value) => value.trim()).filter(Boolean);
    for (const hash of hashes) if (!values.includes(hash)) values.push(hash);
    return `${match[1]}${key}=${values.join(',')}`;
  });
  if (!found) {
    while (updated.length && updated[updated.length - 1] === '') updated.pop();
    updated.push(`${key}=${hashes.join(',')}`, '');
  }
  const backup = `${ENV_FILE}.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(ENV_FILE, backup);
  fs.writeFileSync(ENV_FILE, updated.join(newline), 'utf8');
  try { fs.chmodSync(ENV_FILE, 0o600); } catch { /* Windows */ }
  return backup;
}

async function main() {
  try {
    const { role, phones } = await inputs();
    const backup = updateEnv(role, phones.map(phoneHash));
    console.log(`Processed ${phones.length} phone hash(es); duplicates were skipped.`);
    console.log(`Updated ${KEYS[role]}. Backup: ${path.basename(backup)}`);
    console.log('Restart with: pm2 restart campus-service --update-env');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    usage();
    process.exitCode = 1;
  }
}

main();

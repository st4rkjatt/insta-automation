/**
 * CLI User Interface & Terminal Prompts
 */

const fs = require('fs');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const CONFIG = require('../config');

function banner(title) {
  const line = '═'.repeat(60);
  console.log(`\n╔${line}╗`);
  console.log(`║  ${title.padEnd(58)}║`);
  console.log(`╚${line}╝\n`);
}

function divider() {
  console.log('─'.repeat(60));
}

function logInfo(msg) {
  console.log(`ℹ️  [INFO] ${msg}`);
  appendLog(`[INFO] ${msg}`);
}

function logSuccess(msg) {
  console.log(`✅ [SUCCESS] ${msg}`);
  appendLog(`[SUCCESS] ${msg}`);
}

function logWarn(msg) {
  console.log(`⚠️  [WARN] ${msg}`);
  appendLog(`[WARN] ${msg}`);
}

function logError(msg) {
  console.error(`❌ [ERROR] ${msg}`);
  appendLog(`[ERROR] ${msg}`);
}

function appendLog(text) {
  try {
    fs.appendFileSync(CONFIG.logFile, `[${new Date().toISOString()}] ${text}\n`);
  } catch {}
}

let activeRl = null;

function getRL() {
  if (!activeRl || activeRl.closed) {
    activeRl = readline.createInterface({ input, output });
  }
  return activeRl;
}

function closeReadline() {
  if (activeRl && !activeRl.closed) {
    activeRl.close();
    activeRl = null;
  }
}

async function promptInput(message, defaultValue = '') {
  const rl = getRL();
  const hint = defaultValue ? ` (default: ${defaultValue})` : '';
  const answer = await rl.question(`${message}${hint}: `);
  const trimmed = answer.trim();
  return trimmed === '' ? defaultValue : trimmed;
}

async function promptEnter(message = 'Press [ENTER] to continue...') {
  const rl = getRL();
  await rl.question(`\n${message}`);
}

async function promptConfirm(message, defaultYes = true) {
  const suffix = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = (await promptInput(`${message} ${suffix}`, defaultYes ? 'y' : 'n')).toLowerCase();
  return answer === 'y' || answer === 'yes';
}

module.exports = {
  banner,
  divider,
  logInfo,
  logSuccess,
  logWarn,
  logError,
  promptInput,
  promptEnter,
  promptConfirm,
  closeReadline,
  appendLog,
};


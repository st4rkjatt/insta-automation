/**
 * Account Manager
 * Parses, manages, and saves credentials from accounts.txt
 */

const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');

/**
 * Loads all parsed accounts from accounts.txt
 * @returns {Array<{ index: number, email: string, username: string, password: string }>}
 */
function loadAccounts() {
  const filePath = CONFIG.accountsFile;
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const accounts = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Email |') || trimmed.startsWith('---')) continue;

    const userMatch = trimmed.match(/Username:\s*([^\s|]+)/i);
    const passMatch = trimmed.match(/Password:\s*([^\s|]+)/i);
    const emailMatch = trimmed.match(/Email:\s*([^\s|]+)/i);

    if (userMatch && passMatch) {
      accounts.push({
        index: accounts.length + 1,
        email: emailMatch ? emailMatch[1] : 'N/A',
        username: userMatch[1].trim(),
        password: passMatch[1].trim(),
      });
    }
  }

  return accounts;
}

/**
 * Gets the most recently added account
 */
function getLatestAccount() {
  const accounts = loadAccounts();
  return accounts.length > 0 ? accounts[accounts.length - 1] : null;
}

/**
 * Appends a new account to accounts.txt
 */
function saveAccount({ email = '', username, password }) {
  const line = `Email: ${email} | Username: ${username} | Password: ${password}\n`;
  fs.appendFileSync(CONFIG.accountsFile, line, 'utf8');
}

module.exports = {
  loadAccounts,
  getLatestAccount,
  saveAccount,
};


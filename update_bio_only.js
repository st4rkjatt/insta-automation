/**
 * Quick Helper: Update Instagram Bio & Profile Photo on the latest account
 * Run: node update_bio_only.js
 */

const CONFIG = require('./config');
const { getLatestAccount } = require('./lib/accountManager');
const { initBrowser, login, updateBioAndPhoto } = require('./lib/instagram');
const { logInfo, logSuccess, logError } = require('./lib/ui');

(async () => {
  const account = getLatestAccount();
  if (!account) {
    logError('No account found in accounts.txt');
    process.exit(1);
  }

  logInfo(`Testing Bio update with account: @${account.username}`);
  const { browser, context, page } = await initBrowser();

  try {
    const loginResult = await login(page, account.username, account.password);
    if (!loginResult.success) {
      logError(`Login failed: ${loginResult.reason}`);
      return;
    }

    const result = await updateBioAndPhoto(page, {
      bioText: CONFIG.bioText,
      profilePhotoPath: CONFIG.profilePhoto,
      username: account.username,
    });

    if (result.success) {
      logSuccess('Bio & Profile Photo updated successfully!');
    } else {
      logError(`Bio update failed: ${result.reason}`);
    }

    await page.waitForTimeout(5000);
  } catch (err) {
    logError(`Error during bio update: ${err.message}`);
  } finally {
    await browser.close().catch(() => {});
  }
})();

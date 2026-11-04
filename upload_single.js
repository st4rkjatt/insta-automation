/**
 * Quick Test: Upload 1 Reel to Instagram using the latest account
 * Run: node upload_single.js
 */

const path = require('path');
const CONFIG = require('./config');
const { getLatestAccount } = require('./lib/accountManager');
const { initBrowser, login, uploadReel, logout } = require('./lib/instagram');
const { logInfo, logSuccess, logError } = require('./lib/ui');

(async () => {
  const account = getLatestAccount();
  if (!account) {
    logError('No account found in accounts.txt');
    process.exit(1);
  }

  logInfo(`Testing 1 Reel upload with account: @${account.username}`);
  const { browser, context, page } = await initBrowser();

  try {
    const loginResult = await login(page, account.username, account.password);
    if (!loginResult.success) {
      logError(`Login failed: ${loginResult.reason}`);
      return;
    }

    const reelPath = path.join(CONFIG.reelsFolder, 'R1.mp4');
    logInfo(`Uploading ${reelPath}...`);

    const uploadResult = await uploadReel(page, {
      reelPath: reelPath,
      caption: CONFIG.reelCaption,
      coverPhotoPath: CONFIG.coverPhoto,
      label: 'R1.mp4',
    });

    if (uploadResult.success) {
      logSuccess('Reel uploaded successfully!');
    } else {
      logError(`Reel upload failed: ${uploadResult.reason}`);
    }

    logInfo('Keeping browser open for 15 seconds to observe...');
    await page.waitForTimeout(15000);
  } catch (err) {
    logError(`Error during single upload: ${err.message}`);
  } finally {
    await browser.close().catch(() => {});
  }
})();

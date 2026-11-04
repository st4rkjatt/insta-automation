#!/usr/bin/env node
/**
 * Instagram Account Automation Manager
 * Production-ready interactive CLI tool.
 *
 * Workflow:
 * 1. Select / Log into an account from accounts.txt or manual entry.
 * 2. Post-login Interactive Menu:
 *    [1] Update Bio & Profile Photo
 *    [2] Upload Single Reel
 *    [3] Batch Upload Reels (Pipeline)
 *    [4] Full Account Setup (Bio + 20 Reels)
 *    [5] Switch Account
 *    [6] Logout & Exit
 */

const fs = require('fs');
const path = require('path');
const CONFIG = require('./config');
const { loadAccounts, getLatestAccount } = require('./lib/accountManager');
const {
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
} = require('./lib/ui');
const {
  initBrowser,
  checkLoginState,
  login,
  updateBioAndPhoto,
  uploadReel,
  logout,
} = require('./lib/instagram');
const { runFourBatchesUpload, runBatchReelsPipeline } = require('./lib/pipeline');

/**
 * Account Selection Prompt
 */
async function selectAccount() {
  const accounts = loadAccounts();

  banner('INSTAGRAM AUTOMATION: ACCOUNT SELECTION');

  if (accounts.length === 0) {
    logWarn(`No saved accounts found in ${path.basename(CONFIG.accountsFile)}.`);
    console.log('You can enter credentials manually.\n');
  } else {
    console.log(`Saved Accounts (${accounts.length} found):`);
    accounts.forEach((acc) => {
      console.log(`  [${acc.index}] @${acc.username.padEnd(20)} (${acc.email})`);
    });
    console.log('');
    console.log('  [L] Use Latest Account');
  }

  console.log('  [M] Enter Custom Credentials Manually');
  console.log('  [Q] Quit');
  divider();

  while (true) {
    const rawChoice = await promptInput('Select an option');
    const choice = rawChoice.toUpperCase();

    if (choice === 'Q') {
      return null;
    }

    if (choice === 'L') {
      const latest = getLatestAccount();
      if (!latest) {
        logError('No accounts available. Please enter credentials manually (M).');
        continue;
      }
      return latest;
    }

    if (choice === 'M') {
      const user = await promptInput('Enter Instagram Username');
      const pass = await promptInput('Enter Instagram Password');
      if (!user || !pass) {
        logWarn('Username and password cannot be empty.');
        continue;
      }
      return { username: user.trim(), password: pass.trim(), email: 'manual' };
    }

    const num = parseInt(choice, 10);
    if (!isNaN(num) && num >= 1 && num <= accounts.length) {
      return accounts[num - 1];
    }

    logWarn(`Invalid choice: "${rawChoice}". Please enter a valid number, L, M, or Q.`);
  }
}

/**
 * Single Reel Upload Sub-menu
 */
async function handleSingleReelUpload(page) {
  banner('UPLOAD SINGLE REEL');
  console.log(`Reels directory: ${CONFIG.reelsFolder}`);

  // Scan available reels
  const files = fs.existsSync(CONFIG.reelsFolder)
    ? fs.readdirSync(CONFIG.reelsFolder).filter((f) => f.endsWith('.mp4'))
    : [];

  if (files.length === 0) {
    logError(`No .mp4 video files found in ${CONFIG.reelsFolder}`);
    return;
  }

  console.log('\nAvailable Video Files:');
  files.forEach((f, idx) => console.log(`  [${idx + 1}] ${f}`));
  console.log('');

  const fileChoice = await promptInput('Select video number to upload', '1');
  const index = parseInt(fileChoice, 10);
  const selectedFile = (!isNaN(index) && index >= 1 && index <= files.length)
    ? files[index - 1]
    : files[0];

  const videoPath = path.join(CONFIG.reelsFolder, selectedFile);
  logInfo(`Selected reel: ${selectedFile}`);

  const caption = CONFIG.reelCaption;
  logInfo(`Loaded caption from ${CONFIG.captionFile} (${caption.length} characters):`);
  console.log(`\n────────────────────────────────────────────────────────────\n${caption}\n────────────────────────────────────────────────────────────\n`);

  const result = await uploadReel(page, {
    reelPath: videoPath,
    caption: caption,
    coverPhotoPath: CONFIG.coverPhoto,
    label: selectedFile,
  });

  if (result.success) {
    logSuccess(`Reel ${selectedFile} uploaded and shared successfully!`);
  } else {
    logError(`Reel upload failed: ${result.reason}`);
  }
}

/**
 * Bio and Photo Update Sub-menu
 */
async function handleBioUpdate(page, account) {
  banner('UPDATE BIO & PROFILE PHOTO');
  console.log(`Current Bio Text configured:\n"${CONFIG.bioText}"\n`);
  console.log(`Profile photo path: ${CONFIG.profilePhoto} (${fs.existsSync(CONFIG.profilePhoto) ? 'Found ✅' : 'Not found ⚠️'})\n`);

  const proceed = await promptConfirm('Apply this Bio and Profile Photo to profile?', true);
  if (!proceed) {
    logInfo('Bio update cancelled.');
    return;
  }

  const result = await updateBioAndPhoto(page, {
    bioText: CONFIG.bioText,
    profilePhotoPath: CONFIG.profilePhoto,
    username: account.username,
  });

  if (result.success) {
    logSuccess('Profile updated successfully!');
  } else {
    logError(`Profile update failed: ${result.reason}`);
  }
}

/**
 * 4-Batch 20 Reels Automated Pipeline (R1-R5 x 4)
 */
async function handleFourBatchesUpload(context) {
  banner('4-BATCH AUTOMATED REEL UPLOAD (20 REELS)');
  console.log('Select upload speed mode:');
  console.log('  [1] ⚡ Fast Non-Blocking Mode (Recommended: Opens next tab immediately after Share)');
  console.log('  [2] 🚶 Sequential Safe Mode (Waits for each reel to finish uploading before opening next)');
  divider();

  const mode = await promptInput('Enter mode [1-2]', '1');

  if (mode === '1') {
    const { uploadAllReelsPipeline } = require('./signup');
    await uploadAllReelsPipeline(context, CONFIG.reelCaption);
  } else {
    logInfo('Starting automated 4-batch upload: (R1 → R5) x 4 times...');
    const result = await runFourBatchesUpload(context, {
      caption: CONFIG.reelCaption,
      coverPhotoPath: CONFIG.coverPhoto,
    });
    logSuccess(`4-Batch pipeline finished: ${result.successful}/${result.total} reels uploaded successfully.`);
  }
}

/**
 * Custom Batch Upload Sub-menu
 */
async function handleCustomBatchUpload(context) {
  banner('CUSTOM BATCH REEL PIPELINE');
  const countStr = await promptInput('How many total reels to upload?', String(CONFIG.totalBatchReels));
  const count = parseInt(countStr, 10) || CONFIG.totalBatchReels;

  const result = await runBatchReelsPipeline(context, {
    totalCount: count,
    caption: CONFIG.reelCaption,
    coverPhotoPath: CONFIG.coverPhoto,
  });

  logSuccess(`Custom batch finished: ${result.successful}/${result.total} completed.`);
}

/**
 * Post-Login Interactive Action Menu Loop
 */
async function runActionMenu(page, context, account) {
  let stayOnAccount = true;

  while (stayOnAccount) {
    banner(`LOGGED IN AS: @${account.username}`);
    console.log('Select an action to perform:');
    console.log('  [1] 📝 Update Bio & Profile Photo');
    console.log('  [2] 🎬 Upload a Single Reel');
    console.log('  [3] 🔁 Upload 4 Batches (R1–R5 x 4 = 20 Reels Total)');
    console.log('  [4] 🚀 Custom Batch Pipeline (Choose custom count)');
    console.log('  [5] ✨ Complete Setup (Bio + 20 Reels Total)');
    console.log('  [6] 🔄 Switch Account');
    console.log('  [7] 🚪 Logout & Exit');
    divider();

    const choice = await promptInput('Enter action [1-7]');

    switch (choice) {
      case '1':
      case '2':
      case '3':
      case '4':
      case '5': {
        const verifyState = await checkLoginState(page);
        if (!verifyState.loggedIn) {
          logWarn(`Session check: Browser is not logged in yet. Logging in as @${account.username}...`);
          const loginRes = await login(page, account.username, account.password);
          if (!loginRes.success) {
            logError(`Login required to proceed: ${loginRes.reason}`);
            break;
          }
        }
        if (choice === '1') await handleBioUpdate(page, account);
        else if (choice === '2') await handleSingleReelUpload(page);
        else if (choice === '3') await handleFourBatchesUpload(context);
        else if (choice === '4') await handleCustomBatchUpload(context);
        else if (choice === '5') {
          logInfo('Starting Complete Setup: Bio first, then 4 Batches of 20 Reels...');
          await handleBioUpdate(page, account);
          await handleFourBatchesUpload(context);
        }
        break;
      }

      case '6':
        logInfo('Switching account...');
        await logout(page, context);
        stayOnAccount = false;
        break;

      case '7':
        logInfo('Exiting automation...');
        await logout(page, context);
        return false; // Signals complete exit

      default:
        logWarn('Invalid option. Please choose between 1 and 7.');
        break;
    }

    // Automatically loops right back to display the action menu!
  }

  return true; // Signals continue to account selection
}

/**
 * Main Application Entry Point
 */
async function main() {
  banner('INSTAGRAM AUTOMATION MANAGER');
  logInfo('Initializing system...');

  let browserBundle = null;

  try {
    browserBundle = await initBrowser();
  } catch (err) {
    logError(`Could not launch browser: ${err.message}`);
    logInfo('Tip: Verify that Brave or Google Chrome is installed, or run: npx playwright install');
    process.exit(1);
  }

  const { browser, context, page } = browserBundle;

  let continueRunning = true;
  try {
    while (continueRunning) {
      const account = await selectAccount();
      if (!account) {
        logInfo('Goodbye!');
        break;
      }

      logInfo(`Selected: @${account.username}`);
      const loginResult = await login(page, account.username, account.password);

      if (!loginResult.success) {
        logWarn(`Login notice: ${loginResult.reason}`);
        console.log('\n────────────────────────────────────────────────────────────');
        console.log('👀 PLEASE CHECK THE BROWSER WINDOW');
        console.log('────────────────────────────────────────────────────────────');
        console.log('What would you like to do?');
        console.log('  [1] I am already logged in / on the feed -> Continue to Action Menu');
        console.log('  [2] Retry automated login for this account');
        console.log('  [3] Choose a different account');
        console.log('  [4] Exit & Close');
        console.log('────────────────────────────────────────────────────────────');

        const recoveryChoice = await promptInput('Enter option [1-4]', '1');

        if (recoveryChoice === '1') {
          continueRunning = await runActionMenu(page, context, account);
          continue;
        } else if (recoveryChoice === '2') {
          // Re-attempt login with the same account
          const retryResult = await login(page, account.username, account.password);
          if (retryResult.success) {
            continueRunning = await runActionMenu(page, context, account);
          }
          continue;
        } else if (recoveryChoice === '3') {
          // Select another account
          continue;
        } else {
          break;
        }
      }

      // Enter action menu loop
      continueRunning = await runActionMenu(page, context, account);
    }
  } catch (err) {
    logError(`Runtime notice: ${err.message}`);
    console.error(err.stack);
  } finally {
    logInfo('Closing browser and cleaning up...');
    closeReadline();
    await browser.close().catch(() => {});
    logSuccess('Instagram Automation Manager terminated cleanly.');
  }
}

if (require.main === module) {
  main();
}


/**
 * Instagram End-to-End Autonomous Sign-Up & 20 Reels Fast Automation Loop
 *
 * Exact 5-Step Process:
 * 1. Create account (User provides only Email & OTP; script automates username, password, birthday, name, submit, and popups).
 * 2. Upload profile photo (profile.jpg) & Japanese bio.
 * 3. Upload all 20 reels (R1-R5 x 4) in fast non-blocking mode:
 *    - Opens Tab 1 -> attaches R1 -> sets Cover.jpg -> sets CAPTION.txt -> clicks Share.
 *    - Waits 2.5s for upload to initiate over network.
 *    - Immediately opens Tab 2 for R2 without waiting for Tab 1 to finish uploading.
 *    - Repeats for all 20 reels across open tabs (all uploading concurrently in background).
 * 4. Shows "Done" or "Not Done" verification pop-up (both on browser screen and terminal):
 *    - User inspects tabs/profile manually.
 *    - If "Not Done": Keeps tabs open, waits, and re-prompts.
 *    - If "Done": Closes all 20 upload tabs cleanly.
 * 5. Logs out of account and restarts Step 1 to create the next account in an infinite loop!
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

function resolveBrowserPath() {
  if (process.platform === 'darwin') {
    const macBrave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
    if (fs.existsSync(macBrave)) return macBrave;
    const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (fs.existsSync(macChrome)) return macChrome;
  } else if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const winBrave = path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe');
    if (fs.existsSync(winBrave)) return winBrave;
  }
  return undefined;
}

// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
  signupUrl: 'https://www.instagram.com/accounts/emailsignup/',
  editProfileUrl: 'https://www.instagram.com/accounts/edit/',
  homeUrl: 'https://www.instagram.com/',
  fullName: 'Ayesha',
  baseUsername: 'link.in.bio.',
  bioText: `TVアニメ『紫禁城・御猫房』10月10日放送開始! 宮廷に隠された秘密とは? みんなは観たい?\nコメントで教えてね`,
  browserPath: resolveBrowserPath(),
  headless: false,
  slowMo: 60,

  // File paths
  reelsFolder: path.join(__dirname, 'Reels'),
  reelPrefix: 'R',
  reelExtension: '.mp4',
  numUniqueReels: 5,
  totalReelsToUpload: 20,
  coverPhoto: path.join(__dirname, 'Reels', 'Cover.jpg'),
  captionFile: path.join(__dirname, 'Reels', 'CAPTION.txt'),
  profilePhoto: path.join(__dirname, 'profile.jpg'),
  accountsFile: path.join(__dirname, 'accounts.txt'),
  logFile: path.join(__dirname, 'automation.log'),
};

/**
 * Loads reel caption dynamically from Reels/CAPTION.txt
 */
function loadReelCaption() {
  if (fs.existsSync(CONFIG.captionFile)) {
    try {
      const text = fs.readFileSync(CONFIG.captionFile, 'utf8').trim();
      if (text.length > 0) return text;
    } catch { }
  }
  return `! TVアニメ『紫禁・御猫房』10月10日放送開始宮廷に隠された秘密とは? みんなは観たい? コメントで教えてね!\n\n#紫禁御猫房 #新作アニメ\n\n#拡散希望 #猫\n\n《紫禁・御猫房》\n\n#紫禁御猫房\n\n新作アニメ\n\n拡散希望\n\n猫`;
}

// ==========================================
// TERMINAL READLINE HELPER (Persistent)
// ==========================================
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

async function promptTerminalInput(message) {
  const rl = getRL();
  const val = await rl.question(message);
  return (val || '').trim();
}

function logMessage(text) {
  console.log(text);
  try {
    fs.appendFileSync(CONFIG.logFile, `[${new Date().toISOString()}] ${text}\n`);
  } catch { }
}

/** Generates a random 6-digit numeric password e.g. 482736 */
function generateDynamicPassword() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Generates usernames like link.in.bio.427 or link.in.bio.8293 (3–4 digits) */
function generateDynamicUsername(base = 'link.in.bio.') {
  const use4digits = Math.random() > 0.5;
  const suffix = use4digits
    ? Math.floor(1000 + Math.random() * 9000)
    : Math.floor(100 + Math.random() * 900);
  return `${base}${suffix}`;
}

async function debugScreenshot(page, label) {
  try {
    const screenshotDir = path.join(__dirname, 'debug_screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const filename = `${label}_${Date.now()}.png`;
    await page.screenshot({ path: path.join(screenshotDir, filename) });
  } catch { }
}

// ==========================================
// POPUP DISMISSAL
// ==========================================
async function dismissAllPopups(page, maxRounds = 6) {
  for (let r = 0; r < maxRounds; r++) {
    let closedAny = false;

    // Direct DOM evaluate (most reliable in modern Chromium)
    try {
      const clickedText = await page.evaluate(() => {
        const dismissTargets = [
          'not now', '後で', '今はしない',
          'save info', 'save information', '情報を保存',
          'skip', 'スキップ',
          'cancel', 'キャンセル',
          'close', '閉じる',
        ];

        const candidates = Array.from(document.querySelectorAll('button, [role="button"], a[role="button"], span[role="button"]'));
        for (const el of candidates) {
          const text = (el.innerText || el.textContent || '').trim().toLowerCase();
          if (dismissTargets.includes(text)) {
            el.click();
            return text;
          }
        }

        const dialogs = document.querySelectorAll('div[role="dialog"]');
        for (const dlg of dialogs) {
          const buttons = dlg.querySelectorAll('button, div[role="button"], span[role="button"]');
          for (const b of buttons) {
            const text = (b.innerText || b.textContent || '').trim().toLowerCase();
            if (dismissTargets.some(dt => text === dt || text.startsWith(dt))) {
              b.click();
              return text;
            }
          }
        }
        return null;
      });

      if (clickedText) {
        await page.waitForTimeout(1000);
        closedAny = true;
        continue;
      }
    } catch { }

    // Fallback locator for Not Now
    const notNow = page.locator([
      'button:has-text("Not Now")',
      'button:has-text("Not now")',
      'button:has-text("後で")',
      'button:has-text("今はしない")',
      'div[role="dialog"] button:has-text("Not Now")',
      'div[role="dialog"] button:has-text("Not now")',
      'button:has-text("Skip")',
      'button:has-text("スキップ")',
    ].join(', ')).first();

    if (await notNow.isVisible({ timeout: 600 }).catch(() => false)) {
      await notNow.click({ force: true }).catch(() => { });
      await page.waitForTimeout(1000);
      closedAny = true;
      continue;
    }

    if (!closedAny) break;
  }
}

async function handleCookieConsent(page) {
  try {
    const cookieBtn = page.locator(
      'button:has-text("Allow all cookies"), button:has-text("Allow essential and optional cookies"), button:has-text("Decline optional cookies")'
    ).first();
    if (await cookieBtn.isVisible({ timeout: 2500 })) {
      await cookieBtn.click();
      await page.waitForTimeout(1000);
    }
  } catch { }
}

async function checkAndHandleSuspendedCheckpoint(page) {
  const currentUrl = page.url();
  const isSuspended =
    currentUrl.includes('/suspended') ||
    currentUrl.includes('/challenge') ||
    (await page.locator('text="Confirm that you\'re human"').isVisible({ timeout: 1000 }).catch(() => false));

  if (!isSuspended) return false;

  console.log('\n🚨 [CHECKPOINT DETECTED] Instagram suspended or challenge screen.');
  try {
    await page.goto('https://www.instagram.com/accounts/logout/', { waitUntil: 'domcontentloaded' }).catch(() => { });
  } catch { }
  return true;
}

// ==========================================
// STEP 1: ACCOUNT CREATION HELPERS
// ==========================================

/**
 * Prompts user for email via in-browser popup OR terminal input concurrently
 */
async function promptForEmail(page, cycleNumber = 1) {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log(`📧 [EMAIL REQUIRED] Instagram Account #${cycleNumber}`);
  console.log('   Please enter the email in the browser popup OR terminal below:');
  console.log('════════════════════════════════════════════════════════════');

  // 1. Browser popup promise
  const browserPromise = page.evaluate((cycleNum) => {
    return new Promise((resolve) => {
      const old = document.getElementById('automation-email-overlay');
      if (old) old.remove();

      const overlay = document.createElement('div');
      overlay.id = 'automation-email-overlay';
      overlay.style.cssText =
        'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.75);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

      overlay.innerHTML = `
        <div style="background:#fff;padding:32px;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.35);width:450px;max-width:90%;text-align:center;border:1px solid #e0e0e0;">
          <div style="font-size:32px;margin-bottom:8px;">📧</div>
          <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#111;">Instagram Account #${cycleNum}</h2>
          <p style="margin:0 0 20px 0;font-size:14px;color:#555;line-height:1.4;">Enter the email address for this new account:</p>
          <input id="automation-email-input" type="email" placeholder="name@example.com" autofocus style="width:100%;box-sizing:border-box;padding:14px 16px;font-size:16px;border:2px solid #0095f6;border-radius:10px;outline:none;margin-bottom:16px;" />
          <button id="automation-email-submit-btn" style="width:100%;background:#0095f6;color:white;border:none;padding:14px;font-size:15px;font-weight:600;border-radius:10px;cursor:pointer;">Continue Sign-Up</button>
        </div>
      `;

      document.body.appendChild(overlay);
      const inp = document.getElementById('automation-email-input');
      const btn = document.getElementById('automation-email-submit-btn');
      setTimeout(() => inp && inp.focus(), 250);

      function submit() {
        const val = (inp.value || '').trim();
        if (val && val.includes('@')) {
          overlay.remove();
          resolve(val);
        } else {
          inp.style.borderColor = '#ed4956';
          inp.placeholder = 'Please enter a valid email address';
        }
      }
      btn.addEventListener('click', submit);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
    });
  }, cycleNumber).catch(() => null);

  // 2. Terminal input promise
  const rl = getRL();
  const terminalPromise = rl.question(`>> Enter email for Account #${cycleNumber}: `).then((val) => {
    return (val || '').trim();
  });

  const winner = await Promise.race([
    browserPromise.then((email) => (email ? { source: 'browser', email } : new Promise(() => { }))),
    terminalPromise.then((email) => ({ source: 'terminal', email })),
  ]);

  // Clean up browser popup if answered via terminal
  await page.evaluate(() => {
    const old = document.getElementById('automation-email-overlay');
    if (old) old.remove();
  }).catch(() => { });

  return winner.email;
}

/**
 * Birthday selection (Jan 15, 1998)
 */
async function fillBirthdayIfPresent(page) {
  console.log('[INFO] Selecting Birthday (Day: 15, Month: January, Year: 1998)...');
  const dayBox = page.locator('div[role="combobox"][aria-label*="Day"], div[role="combobox"]:has-text("Day")').first();
  if (await dayBox.isVisible({ timeout: 2500 })) {
    await dayBox.click();
    await page.waitForTimeout(200);
    await page.getByRole('option', { name: '15', exact: true }).click().catch(() => { });
    await page.waitForTimeout(200);
  }

  const monthBox = page.locator('div[role="combobox"][aria-label*="Month"], div[role="combobox"]:has-text("Month")').first();
  if (await monthBox.isVisible({ timeout: 2500 })) {
    await monthBox.click();
    await page.waitForTimeout(200);
    await page.getByRole('option', { name: 'January', exact: true }).click().catch(() => { });
    await page.waitForTimeout(200);
  }

  const yearBox = page.locator('div[role="combobox"][aria-label*="Year"], div[role="combobox"]:has-text("Year")').first();
  if (await yearBox.isVisible({ timeout: 2500 })) {
    await yearBox.click();
    await page.waitForTimeout(200);
    await page.getByRole('option', { name: '1998', exact: true }).click().catch(() => { });
    await page.waitForTimeout(200);
  }
}

/**
 * Submits sign-up form and auto-changes username if taken
 */
async function submitWithUsernameVerification(page, usernameInput, submitBtn, base, maxRetries = 10, currentUsername) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (await checkAndHandleSuspendedCheckpoint(page)) return null;

    console.log(`[SUBMIT] Attempt ${attempt}/${maxRetries}: Submitting sign-up form...`);
    if (!page.url().includes('emailsignup')) {
      console.log('[INFO] Form accepted! Moved past sign-up page.');
      return currentUsername;
    }

    const isSubmitVisible = await submitBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (!isSubmitVisible) {
      console.log('[INFO] Submit button no longer visible - form accepted.');
      return currentUsername;
    }

    await submitBtn.click().catch(() => { });
    await page.waitForTimeout(3000);

    if (await checkAndHandleSuspendedCheckpoint(page)) return null;

    const usernameError = page.locator(
      'span:has-text("is not available"), span:has-text("already taken"), [role="alert"]:has-text("not available")'
    ).first();
    const isTaken = await usernameError.isVisible({ timeout: 2000 }).catch(() => false);

    if (isTaken) {
      currentUsername = generateDynamicUsername(base);
      console.log(`⚠️ [WARN] Username taken! Auto-changing to: ${currentUsername}`);
      await usernameInput.click({ clickCount: 3 });
      await usernameInput.fill('');
      await usernameInput.fill(currentUsername);
      await page.waitForTimeout(1000);
      continue;
    }

    if (!page.url().includes('emailsignup')) {
      console.log('[INFO] Form accepted! Navigated to next screen.');
      return currentUsername;
    }
  }
  return currentUsername;
}

/**
 * Handles OTP verification: user can enter on Instagram screen OR in terminal
 */
async function handleOtpVerification(page) {
  const otpSelector = [
    'input[name="email_confirmation_code"]',
    'input[name="verificationCode"]',
    'input[autocomplete="one-time-code"]',
    'input[placeholder*="confirmation code" i]',
    'input[placeholder*="Code" i]',
    'input[maxlength="6"]',
  ].join(', ');

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  🔑 OTP VERIFICATION REQUIRED                             ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  Enter the OTP directly on the browser screen,             ║');
  console.log('║  OR enter the 6-digit OTP in the terminal below.          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Terminal input listener
  const rl = getRL();
  rl.question('>> Enter 6-digit OTP (or enter directly in browser): ').then(async (code) => {
    const cleanCode = (code || '').trim();
    if (cleanCode && cleanCode.length >= 4) {
      console.log(`[INFO] Submitting OTP "${cleanCode}" into Instagram form...`);
      const otpInput = page.locator(otpSelector).first();
      if (await otpInput.isVisible({ timeout: 2500 }).catch(() => false)) {
        await otpInput.fill(cleanCode);
        await page.waitForTimeout(400);
        const nextBtn = page.locator('button:has-text("Next"), button[type="submit"], div[role="button"]:has-text("Next")').first();
        if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await nextBtn.click({ force: true });
        }
      }
    }
  }).catch(() => { });

  // Polling loop: checks if user completed OTP and reached Instagram feed
  for (let w = 0; w < 180; w++) {
    await dismissAllPopups(page, 1);

    const currentUrl = page.url();
    const isPastSignup =
      !currentUrl.includes('emailsignup') ||
      currentUrl === 'https://www.instagram.com/' ||
      currentUrl.includes('instagram.com/?') ||
      (await page.locator('text="Turn on Notifications"').isVisible().catch(() => false)) ||
      (await page.locator('svg[aria-label="Home"], svg[aria-label="ホーム"]').isVisible().catch(() => false));

    if (isPastSignup) {
      console.log('✅ [SUCCESS] OTP verified and logged into Instagram!');
      return true;
    }

    if (await checkAndHandleSuspendedCheckpoint(page)) {
      return false;
    }

    await page.waitForTimeout(1000);
  }
  return false;
}

// ==========================================
// STEP 2: PROFILE PHOTO & BIO
// ==========================================
async function addBioToProfile(page, bioText, username) {
  console.log('\n==============================================');
  console.log('📝 [STEP 2] Setting Bio & Profile Photo...');
  console.log(`📝 [BIO TEXT] "${bioText}"`);
  console.log('==============================================');

  try {
    await dismissAllPopups(page);

    console.log('[INFO] Navigating to Edit Profile page...');
    await page.goto(CONFIG.editProfileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    await dismissAllPopups(page);

    if (!page.url().includes('edit') && username) {
      console.log(`[INFO] Navigating to profile: https://www.instagram.com/${username}/`);
      await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await dismissAllPopups(page);

      const editBtn = page.locator(
        'a:has-text("Edit Profile"), a:has-text("Edit profile"), button:has-text("Edit Profile"), button:has-text("Edit profile"), a:has-text("プロフィールを編集")'
      ).first();
      if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(3000);
        await dismissAllPopups(page);
      }
    }

    // 1. Upload Profile Photo
    if (fs.existsSync(CONFIG.profilePhoto)) {
      console.log(`[INFO] Uploading Profile Photo from ${path.basename(CONFIG.profilePhoto)}...`);
      try {
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
          await fileInput.setInputFiles(CONFIG.profilePhoto);
          await page.waitForTimeout(3000);
          console.log('✅ [SUCCESS] Profile photo uploaded via file input.');
        } else {
          const changeBtn = page.locator(
            'text="Change profile photo", text="Change Profile Photo", button:has-text("Change photo"), button:has-text("プロフィール写真を変更")'
          ).first();
          if (await changeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 6000 }).catch(() => null),
              changeBtn.click(),
            ]);
            if (fileChooser) {
              await fileChooser.setFiles(CONFIG.profilePhoto);
              await page.waitForTimeout(3500);
              console.log('✅ [SUCCESS] Profile photo uploaded via file chooser.');
            }
          }
        }
      } catch (err) {
        console.log(`⚠️ [WARN] Could not upload profile photo: ${err.message}`);
      }
    }

    // 2. Locate Bio textarea
    console.log('[INFO] Locating Bio textarea...');
    const bioTextarea = page.locator(
      'textarea#pepBio, textarea[id*="bio" i], textarea[aria-label*="Bio" i], textarea[aria-label*="自己紹介" i], textarea[placeholder*="Bio" i], textarea'
    ).first();

    await bioTextarea.waitFor({ state: 'visible', timeout: 15000 });
    await bioTextarea.scrollIntoViewIfNeeded().catch(() => { });
    await bioTextarea.click();
    await bioTextarea.focus();

    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+A' : 'Control+A');
    await page.waitForTimeout(150);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(200);

    // Insert multiline text without truncation
    await page.keyboard.insertText(bioText);
    await page.waitForTimeout(400);

    const val = await bioTextarea.inputValue().catch(() => '');
    if (!val || val.trim() === '') {
      await bioTextarea.fill(bioText);
      await page.waitForTimeout(300);
    }

    // 3. Click Submit / Save button
    console.log('[INFO] Clicking Submit/Save button...');
    const saveBtn = page.locator(
      'button[type="submit"], div[role="button"]:has-text("Submit"), button:has-text("Submit"), div[role="button"]:has-text("Save"), button:has-text("Save"), div[role="button"]:has-text("送信"), button:has-text("送信"), div[role="button"]:has-text("保存"), button:has-text("保存")'
    ).first();

    await saveBtn.scrollIntoViewIfNeeded().catch(() => { });
    if (await saveBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      await saveBtn.click({ force: true });
      await page.waitForTimeout(3500);
      console.log('🎉 [SUCCESS] Bio updated and saved!');
    }
  } catch (error) {
    console.error('❌ [ERROR updating bio]:', error.message);
    await debugScreenshot(page, 'bio_update_error');
  }
}

// ==========================================
// STEP 3: FAST NON-BLOCKING REEL UPLOAD
// ==========================================

/**
 * Uploads a single reel on the provided page up to clicking Share.
 * DOES NOT wait for upload completion — returns immediately after Share is triggered
 * so the tab can continue uploading in the background while the next tab starts!
 */
async function uploadSingleReelFast(page, reelNum, caption, tabIndex) {
  const videoPath = path.join(
    CONFIG.reelsFolder,
    `${CONFIG.reelPrefix}${reelNum}${CONFIG.reelExtension}`
  );

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  const log = (msg) => {
    const text = `  [TAB ${String(tabIndex).padStart(2, '0')}] ${msg}`;
    logMessage(text);
  };

  log(`▶ Starting fast upload: R${reelNum}.mp4`);

  await dismissAllPopups(page);

  // 1. Click "Create" in sidebar
  log('Step 1: Clicking Create button...');
  const createBtn = page.locator([
    'svg[aria-label="New post"]',
    'svg[aria-label="Create"]',
    'svg[aria-label="新規投稿"]',
    'svg[aria-label="作成"]',
    'a:has(svg[aria-label="New post"])',
    'a:has(svg[aria-label="Create"])',
    'span:text-is("Create")',
    'span:text-is("作成")',
    'div[role="button"]:has-text("Create")',
    'div[role="button"]:has-text("作成")',
  ].join(', ')).first();

  await createBtn.waitFor({ state: 'visible', timeout: 18000 });
  await createBtn.click({ force: true });
  await page.waitForTimeout(2000);

  // 2. Select "Post" from dropdown if visible
  const postItem = page.locator(
    '[role="menuitem"]:has-text("Post"), [role="menuitem"]:has-text("投稿"), a:has-text("Post"), span:text-is("Post")'
  ).first();
  if (await postItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    log('Step 2: Selecting "Post" from dropdown...');
    await postItem.evaluate((el) => el.click()).catch(() => postItem.click({ force: true }));
    await page.waitForTimeout(2000);
  }

  // 3. Attach Video file
  log(`Step 3: Attaching video R${reelNum}.mp4...`);
  const dialog = page.locator('div[role="dialog"]').first();
  await dialog.waitFor({ state: 'visible', timeout: 25000 });
  await page.waitForTimeout(1500);

  let videoAttached = false;
  const selectBtn = page.locator('div[role="dialog"]').locator([
    'button:has-text("Select from computer")',
    'button:has-text("Select From Computer")',
    'button:has-text("コンピューターから選択")',
    '[role="button"]:has-text("Select from computer")',
  ].join(', ')).first();

  if (await selectBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
    try {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        selectBtn.click({ force: true }),
      ]);
      await fileChooser.setFiles(videoPath);
      videoAttached = true;
      log('  ✅ Video attached via file chooser!');
    } catch { }
  }

  if (!videoAttached) {
    const inputs = page.locator('input[type="file"]');
    if (await inputs.count() > 0) {
      await inputs.last().setInputFiles(videoPath);
      videoAttached = true;
      log('  ✅ Video attached via file input!');
    }
  }

  // Fast check: Dismiss reels info OK prompt if present (NO long wait/play for video preview!)
  log('  Dismissing any reels info prompts or checking Next button...');
  for (let c = 0; c < 4; c++) {
    const okBtn = page.locator('div[role="dialog"]').locator(
      'button:has-text("OK"), button:has-text("了解"), button:text-is("OK")'
    ).first();
    if (await okBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      log('  Dismissed "shared as reels" info dialog.');
      await okBtn.click({ force: true }).catch(() => { });
      await page.waitForTimeout(800);
      break;
    }
    const hasNext = await page.locator('div[role="dialog"]').locator(
      'button:has-text("Next"), div[role="button"]:has-text("Next"), button:has-text("次へ")'
    ).first().isVisible({ timeout: 500 }).catch(() => false);
    if (hasNext) break;
    await page.waitForTimeout(500);
  }

  // 4. Advance past crop to Edit screen (if currently on Crop)
  const isCropScreen = await page.evaluate(() => {
    const dlg = document.querySelector('div[role="dialog"]');
    if (!dlg) return false;
    const text = (dlg.innerText || '').toLowerCase();
    return !text.includes('cover photo') && !text.includes('select from computer') && !text.includes('カバー写真');
  }).catch(() => false);

  if (isCropScreen) {
    log('Step 4: On Crop screen — Clicking Next to reach Edit screen...');
    await clickNextInModal(page, log);
    await page.waitForTimeout(2000);
  } else {
    log('Step 4: Already on Edit screen.');
  }

  // Wait for Edit screen (Cover photo section) to render
  for (let w = 0; w < 6; w++) {
    const hasEdit = await page.evaluate(() => {
      const dlg = document.querySelector('div[role="dialog"]');
      if (!dlg) return false;
      const text = (dlg.innerText || '').toLowerCase();
      return text.includes('cover photo') || text.includes('select from computer') || text.includes('カバー写真');
    }).catch(() => false);
    if (hasEdit) break;
    await page.waitForTimeout(600);
  }

  // 5. Upload Cover Photo from Reels/Cover.jpg
  log(`Step 5: Attaching cover photo from ${path.basename(CONFIG.coverPhoto)}...`);
  if (fs.existsSync(CONFIG.coverPhoto)) {
    let coverAttached = false;

    // Method A: Check for image-specific file input inside dialog
    try {
      const imgInput = page.locator('div[role="dialog"] input[type="file"][accept*="image"], input[type="file"][accept*="image"]').last();
      if (await imgInput.count() > 0) {
        log('  Found image file input in dialog — setting Cover.jpg directly...');
        await imgInput.setInputFiles(CONFIG.coverPhoto);
        coverAttached = true;
        log('  ✅ Cover photo attached via image file input!');
        await page.waitForTimeout(2500);
      }
    } catch (e) {
      log(`  Image input attempt notice: ${e.message}`);
    }

    // Method B: Click visible "Select From Computer" button with filechooser
    if (!coverAttached) {
      try {
        const selectCoverBtn = page.locator('div[role="dialog"]').locator([
          'button:has-text("Select From Computer")',
          'button:has-text("Select from computer")',
          '[role="button"]:has-text("Select From Computer")',
          '[role="button"]:has-text("Select from computer")',
          'div[role="button"]:has-text("Select From Computer")',
          'span:text-is("Select From Computer")',
          'button:has-text("コンピューターから選択")',
        ].join(', ')).first();

        if (await selectCoverBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          log('  Clicking visible "Select From Computer" button for Cover.jpg...');
          const [coverFc] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 6000 }),
            selectCoverBtn.click({ force: true }),
          ]);
          await coverFc.setFiles(CONFIG.coverPhoto);
          coverAttached = true;
          log('  ✅ Cover photo attached via file chooser!');
          await page.waitForTimeout(2500);
        }
      } catch (e) {
        log(`  Button filechooser attempt notice: ${e.message}`);
      }
    }

    // Method C: Last file input in dialog fallback
    if (!coverAttached) {
      try {
        const anyInputs = page.locator('div[role="dialog"] input[type="file"], input[type="file"]');
        if (await anyInputs.count() > 0) {
          log('  Setting Cover.jpg on last dialog input[type="file"]...');
          await anyInputs.last().setInputFiles(CONFIG.coverPhoto);
          coverAttached = true;
          log('  ✅ Cover photo attached via last dialog input!');
          await page.waitForTimeout(2500);
        }
      } catch (e) {
        log(`  Last file input fallback notice: ${e.message}`);
      }
    }

    if (!coverAttached) {
      log('  ⚠️ Cover photo could not be attached; will proceed with default video frame.');
    }
  } else {
    log(`  ⚠️ Cover photo file not found at: ${CONFIG.coverPhoto}`);
  }

  // 6. Advance past Edit screen to Caption screen (Click Next)
  log('Step 6: Clicking Next (past Edit screen to Caption screen)...');
  await clickNextInModal(page, log);
  await page.waitForTimeout(2000);

  // 7. Caption insertion
  log('Step 7: Inserting caption and hashtags...');
  const captionBox = page.locator('div[role="dialog"]').locator([
    'div[role="textbox"][aria-label*="caption" i]',
    'div[role="textbox"][aria-label*="キャプション" i]',
    'div[contenteditable="true"]',
  ].join(', ')).first();

  await captionBox.waitFor({ state: 'visible', timeout: 15000 });
  await captionBox.click();
  await captionBox.focus();

  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(150);

  await page.keyboard.insertText(caption);
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape').catch(() => { });
  await page.waitForTimeout(400);

  // 8. Click header Share button
  log('Step 8: Clicking header "Share" button...');
  let shareClicked = await page.evaluate(() => {
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    for (const dlg of dialogs) {
      const candidates = dlg.querySelectorAll('button, div[role="button"], span[role="button"]');
      for (const c of candidates) {
        const text = (c.innerText || c.textContent || '').trim();
        if (text === 'Share' || text === 'シェア') {
          c.click();
          return text;
        }
      }
    }
    return null;
  }).catch(() => null);

  if (!shareClicked) {
    const shareBtn = page.locator('div[role="dialog"]').locator([
      'button:text-is("Share")',
      'div[role="button"]:text-is("Share")',
      'button:text-is("シェア")',
      'button:has-text("Share")',
    ].join(', ')).first();
    await shareBtn.waitFor({ state: 'visible', timeout: 8000 });
    await shareBtn.click({ force: true });
    shareClicked = 'Share';
  }

  log(`✅ Share clicked ("${shareClicked}"). Upload initiated!`);

  // Wait 2.5s to allow upload network request to dispatch and upload spinner to appear
  await page.waitForTimeout(2500);

  log(`🚀 Tab ${tabIndex}: Reel R${reelNum}.mp4 is actively uploading in background. Leaving tab open & moving to next reel immediately!`);
  return true;
}

/**
 * Clicks "Next" / "次へ" in the Instagram modal
 */
async function clickNextInModal(page, log) {
  const clicked = await page.evaluate(() => {
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    for (const dlg of dialogs) {
      const candidates = dlg.querySelectorAll('button, div[role="button"], span[role="button"]');
      for (const c of candidates) {
        const text = (c.innerText || c.textContent || '').trim().toLowerCase();
        if (text === 'next' || text === '次へ') {
          c.click();
          return text;
        }
      }
    }
    return null;
  }).catch(() => null);

  if (clicked) {
    await page.waitForTimeout(2200);
    return;
  }

  const nextBtn = page.locator('div[role="dialog"]').locator([
    'button:has-text("Next")',
    'button:has-text("次へ")',
    'div[role="button"]:has-text("Next")',
  ].join(', ')).first();
  await nextBtn.waitFor({ state: 'visible', timeout: 12000 });
  await nextBtn.click({ force: true });
  await page.waitForTimeout(2200);
}

// ==========================================
// STEP 4: VERIFICATION POP-UP (Done / Not Done)
// ==========================================

/**
 * Injects a verification popup in the browser and prompts in the terminal concurrently.
 * Keeps all tabs open until the user clicks "Done".
 * If "Not Done", allows user to inspect and re-prompts.
 */
async function promptDoneOrNotDone(pages) {
  const activePage = pages[pages.length - 1] || pages[0];

  while (true) {
    console.log('\n╔══════════════════════════════════════════════════════════════════════════╗');
    console.log('║                   🎬 20 REELS DISPATCHED: VERIFICATION                   ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════╣');
    console.log('║  All 20 reels are actively uploading across your open browser tabs.      ║');
    console.log('║  Please inspect the open tabs or profile to verify upload completion.    ║');
    console.log('║                                                                          ║');
    console.log('║  Click [Done] on the browser screen popup OR select below:               ║');
    console.log('║    [1] ✅ Done (All 20 reels uploaded -> Close tabs, Logout & New Account)║');
    console.log('║    [2] ⏳ Not Done (Still uploading -> Keep tabs open & wait)             ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

    // 1. In-browser popup on activePage
    const browserPopupPromise = activePage.evaluate(() => {
      return new Promise((resolve) => {
        const existing = document.getElementById('automation-done-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'automation-done-modal';
        modal.style.cssText = `
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 2147483647;
          background: #1c1c1e;
          color: #ffffff;
          padding: 24px 28px;
          border-radius: 16px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.75);
          border: 2px solid #0095f6;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          max-width: 440px;
          line-height: 1.5;
        `;

        modal.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <span style="font-size: 28px;">🎬</span>
            <div>
              <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #fff;">20 Reels Dispatched!</h3>
              <span style="font-size: 12px; color: #a0a0a0;">Uploading across 20 background tabs</span>
            </div>
          </div>
          <p style="margin: 0 0 18px 0; font-size: 13px; color: #d0d0d0;">
            Check your open tabs or profile to verify that all reels are uploaded. When finished, click <b>Done</b> to proceed to logout and create the next account.
          </p>
          <div style="display: flex; gap: 10px;">
            <button id="btn-modal-done" style="flex: 1; background: #0095f6; color: white; border: none; padding: 12px 14px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: background 0.2s;">
              ✅ Done (Logout & Next)
            </button>
            <button id="btn-modal-not-done" style="flex: 1; background: #2c2c2e; color: #e0e0e0; border: 1px solid #48484a; padding: 12px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
              ⏳ Not Done (Wait)
            </button>
          </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('btn-modal-done').onclick = () => {
          modal.remove();
          resolve('DONE');
        };

        document.getElementById('btn-modal-not-done').onclick = () => {
          modal.remove();
          resolve('NOT_DONE');
        };
      });
    }).catch(() => null);

    // 2. Terminal input listener
    const rl = getRL();
    const terminalPromise = rl.question('>> Select option [1=Done, 2=Not Done] (or click in browser): ').then((ans) => {
      const a = (ans || '').toLowerCase().trim();
      if (a === '1' || a === 'done' || a === 'd' || a === 'y' || a === 'yes') return 'DONE';
      return 'NOT_DONE';
    });

    const result = await Promise.race([
      browserPopupPromise.then((res) => (res ? res : new Promise(() => { }))),
      terminalPromise,
    ]);

    // Clean up browser modal
    await activePage.evaluate(() => {
      const m = document.getElementById('automation-done-modal');
      if (m) m.remove();
    }).catch(() => { });

    if (result === 'DONE') {
      console.log('\n🎉 [CONFIRMED] User verified: All 20 reels are uploaded successfully!');
      break;
    } else {
      console.log('\n⏳ [NOT DONE] Keeping all tabs open for manual inspection.');
      console.log('   Take your time to check each tab or profile.');
      console.log('   Re-prompting in 5 seconds...\n');
      await activePage.waitForTimeout(5000);
    }
  }

  // Once confirmed Done, close all upload tabs
  console.log('[INFO] Closing all 20 upload tabs...');
  for (let i = 0; i < pages.length; i++) {
    await pages[i].close().catch(() => { });
  }
  console.log('✅ All upload tabs closed.\n');
}

/**
 * PIPELINE: Fast Sequential Tab-Spawning for 20 Reels
 */
async function uploadAllReelsPipeline(context, caption) {
  const TOTAL = CONFIG.totalReelsToUpload; // 20
  const UNIQUE = CONFIG.numUniqueReels;     // 5
  const seq = Array.from({ length: TOTAL }, (_, i) => (i % UNIQUE) + 1);

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`🎬 FAST PIPELINE UPLOAD — ${TOTAL} reels across background tabs`);
  console.log(`📋 Sequence : ${seq.map((n) => `R${n}`).join(' → ')}`);
  console.log(`📂 Reels    : ${CONFIG.reelsFolder}`);
  console.log(`🖼️  Cover    : ${CONFIG.coverPhoto}`);
  console.log('════════════════════════════════════════════════════════\n');

  const pages = [];
  let okCount = 0;
  let failCount = 0;

  for (let i = 0; i < TOTAL; i++) {
    const reelNum = seq[i];
    const tabIndex = i + 1;

    console.log(`\n────────────────────────────────────────────────────────`);
    console.log(`▶ [TAB ${tabIndex}/${TOTAL}] Opening new tab for R${reelNum}.mp4...`);
    console.log(`────────────────────────────────────────────────────────`);

    const newPage = await context.newPage();
    pages.push(newPage);

    await newPage.goto(CONFIG.homeUrl, { waitUntil: 'domcontentloaded' });
    await newPage.waitForTimeout(2000);

    let success = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await uploadSingleReelFast(newPage, reelNum, caption, tabIndex);
        success = true;
        break;
      } catch (err) {
        const errMsg = `❌ [TAB ${tabIndex}] Attempt ${attempt} failed: ${err.message}`;
        console.error(errMsg);
        logMessage(errMsg);
        await debugScreenshot(newPage, `tab${tabIndex}_attempt${attempt}_fail`);
        if (attempt < 2) {
          console.log(`🔄 Retrying Tab ${tabIndex} in 2 seconds...`);
          await newPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => { });
          await newPage.waitForTimeout(2000);
        }
      }
    }

    if (success) {
      okCount++;
      console.log(`✅ [TAB ${tabIndex}/${TOTAL}] Reel R${reelNum}.mp4 shared! (Uploading in background)`);
    } else {
      failCount++;
      console.error(`🚨 [TAB ${tabIndex}/${TOTAL}] Failed to share R${reelNum}.mp4.`);
    }

    if (i < TOTAL - 1) {
      console.log(`⚡ Opening Tab ${tabIndex + 1} immediately for next reel (no waiting!)...\n`);
    }
  }

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`📊 All 20 reels dispatched — ✅ ${okCount} shares initiated | ❌ ${failCount} errors`);
  console.log('════════════════════════════════════════════════════════');

  // STEP 4: Prompt user with Done / Not Done verification popup
  await promptDoneOrNotDone(pages);
}

// ==========================================
// STEP 5: LOGOUT
// ==========================================
async function logoutAccount(page, context) {
  console.log('\n==============================================');
  console.log('🚪 [STEP 5] Logging out of account...');
  console.log('==============================================');

  try {
    const moreBtn = page.locator([
      'svg[aria-label="Settings"]',
      'svg[aria-label="More options"]',
      'a:has-text("More")',
      'span:has-text("More")',
      'div[role="button"]:has-text("More")',
      'a:has-text("その他")',
      'span:has-text("その他")',
    ].join(', ')).first();

    if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(1500);

      const logoutOption = page.locator(
        'span:has-text("Log out"), div:has-text("Log out"), button:has-text("Log out"), span:has-text("ログアウト"), div:has-text("ログアウト")'
      ).first();
      if (await logoutOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await logoutOption.click();
        await page.waitForTimeout(3000);
      }
    }
  } catch { }

  try {
    await page.goto('https://www.instagram.com/accounts/logout/', { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { });
  } catch { }

  await context.clearCookies().catch(() => { });
  console.log('✅ [SUCCESS] Logged out! Ready for next account cycle.\n');
}

// ==========================================
// SINGLE ACCOUNT FULL CYCLE (Steps 1 to 5)
// ==========================================
async function runSingleAccountCycle(page, context, cycleNum) {
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  🚀 [CYCLE #${cycleNum}] STARTING FULL INSTAGRAM AUTOMATION         ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  // STEP 1: Navigate to Sign-Up
  console.log('[STEP 1] Navigating to Instagram sign-up page...');
  await page.goto(CONFIG.signupUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await handleCookieConsent(page);

  // User input: Email
  const targetEmail = await promptForEmail(page, cycleNum);
  console.log(`✅ [INFO] Target Email: ${targetEmail}`);

  let currentUsername = generateDynamicUsername(CONFIG.baseUsername);
  let currentPassword = generateDynamicPassword();
  console.log(`👤 Initial Username : ${currentUsername}`);
  console.log(`🔑 Generated Password: ${currentPassword}`);

  // Fill Details
  console.log('[INFO] Filling sign-up form fields...');
  const emailInput = page.locator(
    'label:has-text("Mobile number or email") input, input[placeholder*="Mobile number or email"], input[name="emailOrPhone"], input[name="email"]'
  ).first();
  await emailInput.waitFor({ state: 'visible', timeout: 15000 });
  await emailInput.fill(targetEmail);

  const passwordInput = page.locator('input[type="password"]').first();
  if (await passwordInput.isVisible({ timeout: 3000 })) {
    await passwordInput.fill(currentPassword);
  }

  await fillBirthdayIfPresent(page);

  const fullNameInput = page.locator(
    'label:has-text("Name") input, label:has-text("Full name") input, input[placeholder*="Full name"]'
  ).first();
  if (await fullNameInput.isVisible({ timeout: 3000 })) {
    await fullNameInput.fill(CONFIG.fullName);
  }

  const usernameInput = page.locator(
    'input[aria-label="Username"], label:has-text("Username") input, input[placeholder*="Username"]'
  ).first();
  await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
  await usernameInput.fill(currentUsername);

  // Submit with retry on taken username
  console.log('[INFO] Submitting form with username conflict verification...');
  const submitBtn = page.locator(
    'div[role="button"]:has-text("Submit"), button:has-text("Submit"), button[type="submit"], button:has-text("Next"), div[role="button"]:has-text("送信"), button:has-text("送信"), div[role="button"]:has-text("次へ"), button:has-text("次へ")'
  ).first();
  const finalUsername = await submitWithUsernameVerification(
    page, usernameInput, submitBtn, CONFIG.baseUsername, 10, currentUsername
  );

  if (!finalUsername) {
    await context.clearCookies().catch(() => { });
    return;
  }
  currentUsername = finalUsername;

  if (await checkAndHandleSuspendedCheckpoint(page)) {
    await context.clearCookies().catch(() => { });
    return;
  }

  // Check for OTP or Direct Login
  console.log('[INFO] Checking for OTP or direct login...');
  const otpSelector = [
    'input[name="email_confirmation_code"]',
    'input[name="verificationCode"]',
    'input[autocomplete="one-time-code"]',
    'input[placeholder*="confirmation code" i]',
    'input[placeholder*="Code" i]',
    'input[maxlength="6"]',
  ].join(', ');
  const profileSelector = 'a:has-text("Profile"), a[role="link"]:has(img[alt*="profile" i]), span:has-text("Profile"), span:has-text("プロフィール")';

  let nextStep = 'UNKNOWN';
  for (let i = 0; i < 30; i++) {
    if (await checkAndHandleSuspendedCheckpoint(page)) {
      await context.clearCookies().catch(() => { });
      return;
    }

    await dismissAllPopups(page, 1);

    if (
      (await page.locator(profileSelector).first().isVisible().catch(() => false)) ||
      page.url() === 'https://www.instagram.com/' ||
      page.url().includes('instagram.com/?') ||
      (!page.url().includes('emailsignup') && !page.url().includes('challenge'))
    ) {
      nextStep = 'LOGGED_IN';
      break;
    }

    if (await page.locator(otpSelector).first().isVisible().catch(() => false)) {
      nextStep = 'OTP';
      break;
    }

    await page.waitForTimeout(1000);
  }

  if (nextStep === 'OTP') {
    const otpSuccess = await handleOtpVerification(page);
    if (!otpSuccess) {
      console.log('⚠️ [WARN] OTP verification failed or checkpoint detected.');
      await context.clearCookies().catch(() => { });
      return;
    }
  }

  // Clear onboarding popups (Notifications -> Not Now, Save Info -> Not Now)
  console.log('[STEP 1 Complete] Dismissing all onboarding popups...');
  await dismissAllPopups(page, 6);

  if (page.url().includes('emailsignup')) {
    await page.goto(CONFIG.homeUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await dismissAllPopups(page, 4);
  }

  // Save account to accounts.txt
  const accountDetails = `Email: ${targetEmail} | Username: ${currentUsername} | Password: ${currentPassword}\n`;
  fs.appendFileSync(CONFIG.accountsFile, accountDetails);
  console.log(`💾 [SAVED] ${accountDetails.trim()}`);
  console.log(`📄 [FILE]  ${CONFIG.accountsFile}`);

  // STEP 2: Profile photo & Bio update
  await addBioToProfile(page, CONFIG.bioText, currentUsername);
  await page.waitForTimeout(3000);

  // STEP 3 & 4: Upload 20 reels in fast non-blocking mode & prompt Done / Not Done
  const reelCaption = loadReelCaption();
  console.log(`[INFO] Loaded Reel caption (${reelCaption.length} chars)`);
  await uploadAllReelsPipeline(context, reelCaption);

  // STEP 5: Logout and complete cycle
  await logoutAccount(page, context);
  console.log(`🎉 [CYCLE #${cycleNum} COMPLETE] Finished account @${currentUsername}!\n`);
}

// ==========================================
// MAIN AUTOMATION LOOP
// ==========================================
async function startAutomationLoop() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  🚀 INSTAGRAM AUTONOMOUS 5-STEP PIPELINE (INFINITE LOOP)   ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log('║  1. Create account (You only provide Email & OTP)          ║');
  console.log('║  2. Upload Profile Photo & Japanese Bio                    ║');
  console.log('║  3. Upload all 20 Reels (Fast non-blocking tabs)           ║');
  console.log('║  4. Show "Done" or "Not Done" verification pop-up          ║');
  console.log('║  5. Logout & start creating new account automatically!     ║');
  console.log('║                                                            ║');
  console.log('║  To stop at any time, press Ctrl+C in this terminal.       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const launchOptions = {
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo,
  };
  if (CONFIG.browserPath && fs.existsSync(CONFIG.browserPath)) {
    launchOptions.executablePath = CONFIG.browserPath;
    console.log(`ℹ️  [INFO] Using browser: ${CONFIG.browserPath}`);
  }

  const browser = await chromium.launch(launchOptions);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  let cycle = 1;
  try {
    while (true) {
      try {
        await runSingleAccountCycle(page, context, cycle);
        cycle++;
        console.log(`\n⏳ Starting Cycle #${cycle} in 3 seconds...\n`);
        await page.waitForTimeout(3000);
      } catch (cycleError) {
        console.error(`❌ [ERROR in Cycle #${cycle}]:`, cycleError.message);
        await context.clearCookies().catch(() => { });
        await page.goto(CONFIG.signupUrl, { waitUntil: 'domcontentloaded' }).catch(() => { });
        await page.waitForTimeout(3000);
      }
    }
  } finally {
    closeReadline();
    await browser.close().catch(() => { });
  }
}

// Start the automation
if (require.main === module) {
  startAutomationLoop();
}

module.exports = {
  startAutomationLoop,
  runSingleAccountCycle,
  uploadAllReelsPipeline,
  uploadSingleReelFast,
  promptDoneOrNotDone,
};

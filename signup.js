/**
 * Instagram End-to-End Sign-Up & Bio Automation (Infinite Loop)
 *
 * Flow:
 * 1. Open Instagram Sign-Up page.
 * 2. Ask user for email via browser popup.
 * 3. Fill details (dynamic username, birthday, password, name).
 * 4. Submit & auto-change username if already taken.
 * 5. Handle OTP (if prompted) or direct login.
 * 6. Wait for "Turn on notifications" popup and click "Not Now".
 * 7. Navigate to Edit Profile page.
 * 8. Add Bio text, upload profile photo, and click Submit.
 * 9. Upload 20 reels in pipeline fashion (one tab at a time).
 * 10. Wait for user verification, then logout.
 * 11. Repeat the cycle for next account until user stops with Ctrl+C.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');

// ==========================================
// CONFIGURATION
// ==========================================
const CONFIG = {
  signupUrl: 'https://www.instagram.com/accounts/emailsignup/',
  editProfileUrl: 'https://www.instagram.com/accounts/edit/',
  fullName: 'Ayesha',
  baseUsername: 'link.in.bio.',
  bioText: `TVアニメ『紫禁城・御猫房』10月10日放送開始! 宮廷に隠された秘密とは? みんなは観たい?\nコメントで教えてね`,
  reelCaption: `! TVアニメ『紫禁・御猫房』10月10日放送開始宮廷に隠された秘密とは? みんなは観たい? コメントで教えてね!\n\n#紫禁御猫房 #新作アニメ\n\n#拡散希望 #猫\n\n《紫禁・御猫房》\n\n#紫禁御猫房\n\n新作アニメ\n\n拡散希望\n\n猫`,
  browserPath: 'C:\\Users\\yashs\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: false,
  slowMo: 100,

  // ── Reel file settings ──────────────────────────
  reelsFolder:        'C:\\Users\\yashs\\Downloads\\instaAuto\\instaAuto\\Reels',
  reelPrefix:         'R',
  reelExtension:      '.mp4',
  numUniqueReels:     5,
  totalReelsToUpload: 20,
  coverPhoto:         'C:\\Users\\yashs\\Downloads\\instaAuto\\instaAuto\\Reels\\Cover.jpg',
  profilePhoto:       'C:\\Users\\yashs\\Downloads\\Profile Photo.jpg',
};

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

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

/** CLI Prompt Helper */
async function promptTerminalInput(message) {
  const rl = readline.createInterface({ input, output });
  try {
    const value = await rl.question(message);
    return value.trim();
  } finally {
    rl.close();
  }
}

/** Helper: safe click with logging — tries to find & click, returns true/false */
async function safeClick(locator, description, timeout = 5000) {
  try {
    if (await locator.isVisible({ timeout }).catch(() => false)) {
      await locator.click({ force: true });
      return true;
    }
  } catch { }
  return false;
}

/** Helper: wait & screenshot for debugging */
async function debugScreenshot(page, label) {
  try {
    const screenshotDir = path.join(__dirname, 'debug_screenshots');
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const filename = `${label}_${Date.now()}.png`;
    await page.screenshot({ path: path.join(screenshotDir, filename) });
    console.log(`  📸 Debug screenshot: debug_screenshots/${filename}`);
  } catch { }
}

// ==========================================
// BROWSER POPUP FOR EMAIL
// ==========================================
async function promptForEmailInBrowser(page, cycleNumber = 1) {
  console.log('🖥️ [POPUP] Asking for email on browser screen...');
  return await page.evaluate((cycleNum) => {
    return new Promise((resolve) => {
      const old = document.getElementById('automation-email-overlay');
      if (old) old.remove();

      const overlay = document.createElement('div');
      overlay.id = 'automation-email-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.75);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';

      overlay.innerHTML = `
        <div style="background:#fff;padding:32px;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,0.35);width:450px;max-width:90%;text-align:center;border:1px solid #e0e0e0;">
          <div style="font-size:28px;margin-bottom:8px;">📧</div>
          <h2 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#111;">Instagram Account #${cycleNum}</h2>
          <p style="margin:0 0 20px 0;font-size:14px;color:#555;line-height:1.4;">Enter the email address for this new account:</p>
          <input id="automation-email-input" type="email" placeholder="name@example.com" autofocus style="width:100%;box-sizing:border-box;padding:14px 16px;font-size:16px;border:2px solid #0095f6;border-radius:10px;outline:none;margin-bottom:16px;" />
          <button id="automation-email-submit-btn" style="width:100%;background:#0095f6;color:white;border:none;padding:14px;font-size:15px;font-weight:600;border-radius:10px;cursor:pointer;">Continue Sign-Up</button>
        </div>
      `;

      document.body.appendChild(overlay);
      const inp = document.getElementById('automation-email-input');
      const btn = document.getElementById('automation-email-submit-btn');
      inp.focus();

      function submit() {
        const val = inp.value.trim();
        if (val && val.includes('@')) { overlay.remove(); resolve(val); }
        else { inp.style.borderColor = '#ed4956'; inp.placeholder = 'Please enter a valid email address'; }
      }
      btn.addEventListener('click', submit);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    });
  }, cycleNumber);
}

// ==========================================
// COOKIE CONSENT
// ==========================================
async function handleCookieConsent(page) {
  try {
    const cookieBtn = page.locator(
      'button:has-text("Allow all cookies"), button:has-text("Allow essential and optional cookies"), button:has-text("Decline optional cookies")'
    ).first();
    if (await cookieBtn.isVisible({ timeout: 2500 })) {
      console.log('[INFO] Dismissing cookie banner...');
      await cookieBtn.click();
    }
  } catch { }
}

// ==========================================
// BIRTHDAY SELECTION
// ==========================================
async function fillBirthdayIfPresent(page) {
  console.log('[INFO] Selecting Birthday (Day, Month, Year)...');

  const dayBox = page.locator('div[role="combobox"][aria-label*="Day"], div[role="combobox"]:has-text("Day")').first();
  if (await dayBox.isVisible({ timeout: 3000 })) {
    await dayBox.click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: '15', exact: true }).click();
    await page.waitForTimeout(300);
  }

  const monthBox = page.locator('div[role="combobox"][aria-label*="Month"], div[role="combobox"]:has-text("Month")').first();
  if (await monthBox.isVisible({ timeout: 3000 })) {
    await monthBox.click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: 'January', exact: true }).click();
    await page.waitForTimeout(300);
  }

  const yearBox = page.locator('div[role="combobox"][aria-label*="Year"], div[role="combobox"]:has-text("Year")').first();
  if (await yearBox.isVisible({ timeout: 3000 })) {
    await yearBox.click();
    await page.waitForTimeout(300);
    await page.getByRole('option', { name: '1998', exact: true }).click();
    await page.waitForTimeout(300);
  }
}

// ==========================================
// DISMISS ALL POPUPS (Not Now, Save info, Skip, Cancel, Close, etc.)
// ==========================================
async function dismissAllPopups(page, maxRounds = 8) {
  for (let r = 0; r < maxRounds; r++) {
    let closedAny = false;

    // 0. DIRECT DOM CLICK (Most reliable — directly clicks "Not Now" / "Save info" in page context)
    try {
      const clickedText = await page.evaluate(() => {
        const dismissTargets = [
          'not now', '後で', '今はしない',
          'save info', 'save information', '情報を保存',
          'skip', 'スキップ',
          'cancel', 'キャンセル',
          'close', '閉じる'
        ];

        // 1. Scan all buttons and role="button" elements
        const candidates = Array.from(document.querySelectorAll('button, [role="button"], a[role="button"], span[role="button"]'));
        for (const el of candidates) {
          const text = (el.innerText || el.textContent || '').trim().toLowerCase();
          if (dismissTargets.includes(text)) {
            el.click();
            return text;
          }
        }

        // 2. Scan inside any dialog modals specifically
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
        console.log(`🔔 [POPUP] Dismissed "${clickedText}" via DOM click`);
        await page.waitForTimeout(1500);
        closedAny = true;
        continue;
      }
    } catch { }

    // 1. Playwright Locator fallback: "Not Now" / "後で" / "今はしない"
    const notNow = page.locator(
      'button:has-text("Not Now"), button:has-text("Not now"), ' +
      'button:has-text("後で"), button:has-text("今はしない"), ' +
      '[role="button"]:has-text("Not now"), [role="button"]:has-text("Not Now"), ' +
      '[role="button"]:has-text("後で"), [role="button"]:has-text("今はしない"), ' +
      'div[role="dialog"] button:has-text("Not Now"), div[role="dialog"] button:has-text("Not now")'
    );
    if (await notNow.count() > 0) {
      for (let i = 0; i < await notNow.count(); i++) {
        const item = notNow.nth(i);
        if (await item.isVisible().catch(() => false)) {
          console.log('🔔 [POPUP] Dismissed "Not Now"...');
          await item.click({ force: true }).catch(() => {});
          await page.waitForTimeout(1500);
          closedAny = true;
          break;
        }
      }
      if (closedAny) continue;
    }

    // 2. Playwright Locator: "Save info" / "情報を保存"
    const saveInfo = page.locator(
      'button:has-text("Save info"), button:has-text("Save Info"), ' +
      'button:has-text("情報を保存"), [role="button"]:has-text("Save info"), ' +
      'div[role="dialog"] button:has-text("Save info"), div[role="dialog"] button:has-text("Save Info")'
    );
    if (await saveInfo.count() > 0) {
      for (let i = 0; i < await saveInfo.count(); i++) {
        const item = saveInfo.nth(i);
        if (await item.isVisible().catch(() => false)) {
          console.log('🔔 [POPUP] Dismissed "Save info"...');
          await item.click({ force: true }).catch(() => {});
          await page.waitForTimeout(1500);
          closedAny = true;
          break;
        }
      }
      if (closedAny) continue;
    }

    // 3. Playwright Locator: "Skip" / "スキップ"
    const skip = page.locator(
      'button:has-text("Skip"), button:has-text("スキップ"), ' +
      'div[role="button"]:has-text("Skip"), div[role="button"]:has-text("スキップ")'
    );
    if (await skip.count() > 0) {
      for (let i = 0; i < await skip.count(); i++) {
        const item = skip.nth(i);
        if (await item.isVisible().catch(() => false)) {
          console.log('🔔 [POPUP] Dismissed "Skip"...');
          await item.click({ force: true }).catch(() => {});
          await page.waitForTimeout(1500);
          closedAny = true;
          break;
        }
      }
      if (closedAny) continue;
    }

    // 4. Playwright Locator: Close icon (X) in dialogs
    const closeIcon = page.locator(
      'div[role="dialog"] svg[aria-label="Close"], div[role="dialog"] svg[aria-label="閉じる"], ' +
      'div[role="dialog"] button:has(svg[aria-label="Close"]), div[role="dialog"] button:has(svg[aria-label="閉じる"])'
    ).first();
    if (await closeIcon.isVisible({ timeout: 800 }).catch(() => false)) {
      console.log('🔔 [POPUP] Dismissed dialog close icon (X)...');
      await closeIcon.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1500);
      closedAny = true;
      continue;
    }

    // 5. Escape key press as fallback
    if (!closedAny && r === 0) {
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    }

    if (!closedAny) break;
  }
}

// Backward compatibility alias
const dismissNotificationAndSavePopups = dismissAllPopups;

// ==========================================
// CHECKPOINT DETECTION
// ==========================================
async function checkAndHandleSuspendedCheckpoint(page) {
  const currentUrl = page.url();
  const isSuspended =
    currentUrl.includes('/suspended') ||
    currentUrl.includes('/challenge') ||
    (await page.locator('text="Confirm that you\'re human"').isVisible({ timeout: 1500 }).catch(() => false));

  if (!isSuspended) return false;

  console.log('\n🚨 [CHECKPOINT DETECTED] "Confirm that you\'re human" screen.');
  console.log('Logging out and preparing next cycle...');

  try {
    const menuBtn = page.locator(
      'svg[aria-label="Settings"], svg[aria-label="More options"], svg[aria-label="Menu"], header svg, header div[role="button"]'
    ).last();
    if (await menuBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await menuBtn.click();
      await page.waitForTimeout(1000);
    }
    const logoutOption = page.locator('div[role="dialog"] :text-matches("Log out", "i")').first();
    if (await logoutOption.isVisible({ timeout: 4000 }).catch(() => false)) {
      await logoutOption.click();
      await page.waitForTimeout(2000);
    }
  } catch {
    await page.goto('https://www.instagram.com/accounts/logout/', { waitUntil: 'domcontentloaded' }).catch(() => { });
  }
  return true;
}

// ==========================================
// USERNAME VERIFICATION & SUBMISSION
// ==========================================
async function submitWithUsernameVerification(page, usernameInput, submitBtn, base, maxRetries = 10, currentUsername) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (await checkAndHandleSuspendedCheckpoint(page)) return null;

    console.log(`[SUBMIT] Attempt ${attempt}/${maxRetries}: Submitting sign-up form...`);

    if (!page.url().includes('emailsignup')) {
      console.log('[INFO] Navigated away from sign-up page.');
      return currentUsername;
    }

    const isSubmitVisible = await submitBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (!isSubmitVisible) {
      console.log('[INFO] Submit button no longer visible - form accepted.');
      return currentUsername;
    }

    await submitBtn.click().catch(() => { });
    await page.waitForTimeout(3500);

    if (await checkAndHandleSuspendedCheckpoint(page)) return null;

    const usernameError = page.locator('span:has-text("is not available"), span:has-text("already taken"), [role="alert"]:has-text("not available")').first();
    const isTaken = await usernameError.isVisible({ timeout: 2000 }).catch(() => false);

    if (isTaken) {
      currentUsername = generateDynamicUsername(base);
      console.log(`⚠️ [WARN] Username taken! Auto-changing to: ${currentUsername}`);
      await usernameInput.click({ clickCount: 3 });
      await usernameInput.fill('');
      await usernameInput.fill(currentUsername);
      await page.waitForTimeout(1500);
      continue;
    }

    if (!page.url().includes('emailsignup')) {
      console.log('[INFO] Form accepted! Navigated to next screen.');
      return currentUsername;
    }
  }
  return currentUsername;
}

// ==========================================
// BIO UPDATE + PROFILE PHOTO
// ==========================================
async function addBioToProfile(page, bioText, username) {
  console.log('\n==============================================');
  console.log('📝 [BIO UPDATE] Setting Bio & Profile Photo...');
  console.log(`📝 [BIO TEXT] "${bioText}"`);
  console.log('==============================================');

  try {
    // 1. Dismiss any popups on screen first
    await dismissAllPopups(page);

    // 2. Navigate to the edit profile page
    console.log('[INFO] Navigating to Edit Profile page...');
    await page.goto('https://www.instagram.com/accounts/edit/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await dismissAllPopups(page);

    // If redirected away from edit profile, try user profile -> Edit profile button
    if (!page.url().includes('edit')) {
      console.log(`[INFO] Current URL: ${page.url()}. Trying profile page: https://www.instagram.com/${username}/`);
      await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      await dismissAllPopups(page);

      const editBtn = page.locator(
        'a:has-text("Edit Profile"), a:has-text("Edit profile"), ' +
        'button:has-text("Edit Profile"), button:has-text("Edit profile"), ' +
        'a:has-text("プロフィールを編集"), button:has-text("プロフィールを編集"), ' +
        'div[role="button"]:has-text("Edit Profile"), div[role="button"]:has-text("プロフィールを編集")'
      ).first();
      if (await editBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(3000);
        await dismissAllPopups(page);
      }
    }

    // 3. Upload Profile Photo
    const profilePicPath = CONFIG.profilePhoto;
    if (fs.existsSync(profilePicPath)) {
      console.log('[INFO] Attempting to upload Profile Photo...');
      try {
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
          await fileInput.setInputFiles(profilePicPath);
          await page.waitForTimeout(3000);
          console.log('✅ [SUCCESS] Profile photo uploaded via file input.');
        } else {
          const changeBtn = page.locator(
            'text="Change profile photo", text="Change Profile Photo", ' +
            'button:has-text("Change photo"), button:has-text("プロフィール写真を変更"), ' +
            'text="プロフィール写真を変更"'
          ).first();
          if (await changeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            const [fileChooser] = await Promise.all([
              page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
              changeBtn.click()
            ]);
            if (fileChooser) {
              await fileChooser.setFiles(profilePicPath);
              await page.waitForTimeout(4000);
              console.log('✅ [SUCCESS] Profile photo uploaded via file chooser.');
            }
          }
        }
      } catch (err) {
        console.error('⚠️ [WARN] Could not upload profile photo:', err.message);
      }
    }

    // 4. Locate Bio textarea (wait up to 20 seconds)
    console.log('[INFO] Looking for Bio textarea...');
    const bioTextarea = page.locator(
      'textarea#pepBio, textarea[id*="bio" i], textarea[aria-label*="Bio" i], ' +
      'textarea[aria-label*="自己紹介" i], textarea[placeholder*="Bio" i], ' +
      'textarea[placeholder*="自己紹介" i], textarea'
    ).first();

    try {
      await bioTextarea.waitFor({ state: 'visible', timeout: 20000 });
      console.log('  ✅ Found Bio textarea!');
    } catch {
      console.error('❌ [ERROR] Bio textarea not found! Taking debug screenshot...');
      await debugScreenshot(page, 'bio_textarea_not_found');
      return;
    }

    // 5. Clear and fill the bio
    console.log('[INFO] Clearing and filling bio text...');
    await bioTextarea.scrollIntoViewIfNeeded().catch(() => { });
    await bioTextarea.click();
    await bioTextarea.focus();

    await page.keyboard.press('Control+A');
    await page.waitForTimeout(200);
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(300);

    // Method 1: Use execCommand to insert text (triggers React state)
    await bioTextarea.evaluate((el, text) => {
      el.focus();
      el.value = '';
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, bioText);

    await page.waitForTimeout(500);

    // Fallback if execCommand was prevented
    const checkVal = await bioTextarea.inputValue().catch(() => '');
    if (!checkVal || checkVal.trim() === '') {
      console.log('[INFO] execCommand did not set value, using .fill()...');
      await bioTextarea.fill(bioText);
      await page.waitForTimeout(500);
    }

    const finalVal = await bioTextarea.inputValue().catch(() => '');
    console.log(`[INFO] Bio textarea value: "${finalVal.substring(0, 50)}..."`);

    // 6. Click Submit / Save button
    console.log('[INFO] Clicking Submit/Save button...');
    const saveBtn = page.locator(
      'button[type="submit"], ' +
      'div[role="button"]:has-text("Submit"), button:has-text("Submit"), ' +
      'div[role="button"]:has-text("Save"), button:has-text("Save"), ' +
      'div[role="button"]:has-text("送信"), button:has-text("送信"), ' +
      'div[role="button"]:has-text("保存"), button:has-text("保存")'
    ).first();

    await saveBtn.scrollIntoViewIfNeeded().catch(() => { });
    if (await saveBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      await saveBtn.click({ force: true });
      await page.waitForTimeout(3500);
      console.log('🎉 [SUCCESS] Bio updated and saved!');
    } else {
      console.log('⚠️ [NOTE] Save button not found. Checking if auto-saved...');
      await debugScreenshot(page, 'save_btn_not_found');
    }

  } catch (error) {
    console.error('❌ [ERROR updating bio]:', error.message);
    await debugScreenshot(page, 'bio_update_error');
  }
}

// ==========================================
// SINGLE REEL UPLOAD (on one page/tab)
// ==========================================
async function uploadSingleReelOnPage(page, reelNum, caption, tabIndex) {
  const videoPath = path.join(
    CONFIG.reelsFolder,
    `${CONFIG.reelPrefix}${reelNum}${CONFIG.reelExtension}`
  );

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const log = (msg) => {
    const text = `  [TAB ${String(tabIndex).padStart(2, '0')}] ${msg}`;
    console.log(text);
    try {
      fs.appendFileSync(path.join(__dirname, 'automation.log'), `[${new Date().toISOString()}] ${text}\n`);
    } catch {}
  };

  log(`▶ Starting upload: R${reelNum}.mp4`);

  // ── 0. Dismiss popups ─────────────────────────────────────────────────────
  await dismissAllPopups(page);

  // ── 1. Click the "Create" / "New post" button in the left sidebar ─────────
  log('Step 1: Clicking Create button...');
  const createBtn = page.locator([
    'svg[aria-label="New post"]',
    'svg[aria-label="Create"]',
    'svg[aria-label="新規投稿"]',
    'svg[aria-label="作成"]',
    'a:has(svg[aria-label="New post"])',
    'a:has(svg[aria-label="Create"])',
    'a:has(svg[aria-label="新規投稿"])',
    'a:has(svg[aria-label="作成"])',
    'span:text-is("Create")',
    'span:text-is("作成")',
    'div[role="button"]:has-text("Create")',
    'div[role="button"]:has-text("作成")',
  ].join(', ')).first();

  if (!await createBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    log('  Create button not immediately visible — clearing any popups...');
    await dismissAllPopups(page);
  }

  await createBtn.waitFor({ state: 'visible', timeout: 20000 });
  await createBtn.click({ force: true });
  await page.waitForTimeout(2500);

  // ── 2. If a dropdown menu appears, choose "Post" / "投稿" ────────────────
  log('Step 2: Checking for dropdown menu...');
  const postItem = page.locator(
    '[role="menuitem"]:has-text("Post"), [role="menuitem"]:has-text("投稿"), ' +
    'a:has-text("Post"), a:has-text("投稿"), ' +
    'span:text-is("Post"), span:text-is("投稿"), ' +
    'div[role="button"]:has-text("Post"), div[role="button"]:has-text("投稿")'
  ).first();
  if (await postItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    log('  Selecting "Post" from menu...');
    await postItem.click();
    await page.waitForTimeout(2000);
  }

  // ── 3. Wait for dialog modal & inject the video file ─────────────────────
  log('Step 3: Waiting for upload dialog...');
  const dialog = page.locator('div[role="dialog"]').first();
  await dialog.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(2000);

  const fileSize = fs.existsSync(videoPath) ? fs.statSync(videoPath).size : 0;
  log(`  Setting video file: R${reelNum}.mp4 (${fileSize} bytes)`);
  let videoUploaded = false;

  // Helper to verify if the video has loaded into Instagram
  const checkVideoLoaded = async () => {
    return await page.evaluate(() => {
      const dlg = document.querySelector('div[role="dialog"]');
      if (!dlg) return false;
      if (dlg.querySelector('video')) return true;
      const text = (dlg.innerText || '').toLowerCase();
      const promptPresent = text.includes('drag photos') || text.includes('select from computer') || text.includes('ドラッグ');
      const hasNext = Array.from(dlg.querySelectorAll('button, [role="button"]')).some(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        return t === 'next' || t === '次へ' || t === 'ok' || t === '了解';
      });
      return (!promptPresent && hasNext) || text.includes('shared as reels') || text.includes('リールとしてシェア');
    }).catch(() => false);
  };

  // ── PRIMARY: Intercept filechooser by clicking "Select from computer" ──
  try {
    log('  Attempting filechooser click on "Select from computer"...');
    const selectBtn = page.getByRole('button', { name: /Select from computer|コンピューターから選択/i })
      .or(page.locator('div[role="dialog"] button:has-text("Select from computer")'))
      .or(page.locator('div[role="dialog"] [role="button"]:has-text("Select from computer")'))
      .or(page.getByText('Select from computer', { exact: true }))
      .first();

    await selectBtn.waitFor({ state: 'visible', timeout: 8000 });

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      selectBtn.click({ force: true, delay: 100 }),
    ]);

    log('  ✅ filechooser event intercepted! Passing video file...');
    await fileChooser.setFiles(videoPath);
    log('  File passed to filechooser. Waiting 4s for processing...');
    await page.waitForTimeout(4000);

    if (await checkVideoLoaded()) {
      log('  ✅ Video loaded successfully via filechooser!');
      videoUploaded = true;
    }
  } catch (err) {
    log(`  Notice (filechooser attempt): ${err.message}`);
  }

  // ── FALLBACK 1: Set file directly on file input ──
  if (!videoUploaded) {
    try {
      log('  Fallback 1: Setting files on page input[type="file"]...');
      const inputs = page.locator('input[type="file"]');
      const count = await inputs.count();
      log(`  Found ${count} input[type="file"] elements.`);
      if (count > 0) {
        await inputs.last().setInputFiles(videoPath);
        await page.waitForTimeout(4000);
        if (await checkVideoLoaded()) {
          log('  ✅ Video loaded successfully via inputs.last()!');
          videoUploaded = true;
        }
      }
    } catch (err) {
      log(`  Notice (direct input attempt): ${err.message}`);
    }
  }

  // ── FALLBACK 2: Playwright native drop target on dialog ──
  if (!videoUploaded) {
    try {
      log('  Fallback 2: Using Playwright setInputFiles on dialog drop zone...');
      await page.locator('div[role="dialog"]').first().setInputFiles(videoPath);
      await page.waitForTimeout(4000);
      if (await checkVideoLoaded()) {
        log('  ✅ Video loaded successfully via dialog setInputFiles drop target!');
        videoUploaded = true;
      }
    } catch (err) {
      log(`  Notice (dialog drop attempt): ${err.message}`);
    }
  }

  // ── Extended wait: Video decoding by Instagram ──
  log('  Waiting for video to finish loading & decoding (up to 30s)...');
  for (let w = 0; w < 30; w++) {
    if (await checkVideoLoaded()) {
      videoUploaded = true;
      log(`  ✅ Video preview is ready! (detected at ${w + 1}s)`);
      break;
    }
    const okBtn = page.locator('div[role="dialog"]').locator(
      'button:has-text("OK"), button:has-text("了解")'
    ).first();
    if (await okBtn.isVisible().catch(() => false)) {
      log('  Reels info OK button detected during wait — clicking OK!');
      await okBtn.click({ force: true }).catch(() => {});
      videoUploaded = true;
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (!videoUploaded) {
    const modalHtml = await page.evaluate(() => {
      const d = document.querySelector('div[role="dialog"]');
      return d ? d.innerHTML.substring(0, 500) : 'NO_DIALOG';
    }).catch(() => 'ERROR');
    log(`  [DEBUG MODAL HTML]: ${modalHtml}`);
    await debugScreenshot(page, `tab${tabIndex}_upload_failed_final`);
    throw new Error(`[TAB ${tabIndex}] Could not load video R${reelNum}.mp4 into Instagram dialog.`);
  }

  // ── 4. "Video posts are now shared as reels" → click OK ───────────────────
  log('Step 4: Checking for "shared as reels" info dialog...');
  const okBtn = page.locator('div[role="dialog"]').locator(
    'button:has-text("OK"), button:has-text("了解"), button:text-is("OK")'
  ).first();
  if (await okBtn.isVisible().catch(() => false)) {
    log('  Clicking OK on info dialog...');
    await okBtn.click({ force: true });
    await page.waitForTimeout(2000);
  } else {
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('div[role="dialog"] button, div[role="dialog"] [role="button"]'));
      const ok = btns.find(b => (b.innerText || '').trim().toUpperCase() === 'OK' || (b.innerText || '').includes('了解'));
      if (ok) ok.click();
    }).catch(() => {});
  }

  // ── 5. Crop step: set 9:16 if visible ─────────────────────────────────────
  log('Step 5: Checking for crop options...');
  try {
    const cropBtn = page.locator('div[role="dialog"]').locator(
      'svg[aria-label="Select crop"], svg[aria-label="切り抜きを選択"], ' +
      'button:has(svg[aria-label*="crop" i]), button:has(svg[aria-label*="切り抜き"])'
    ).first();
    if (await cropBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cropBtn.click();
      await page.waitForTimeout(800);
      const ratio916 = page.locator('span:text-is("9:16"), div:text-is("9:16"), [role="button"]:has-text("9:16")').first();
      if (await ratio916.isVisible({ timeout: 2000 }).catch(() => false)) {
        await ratio916.click();
        await page.waitForTimeout(1000);
        log('  9:16 crop set.');
      }
    }
  } catch { }

  // ── 6. Click "Next" to advance past crop/trim step ────────────────────────
  log('Step 6: Clicking Next (past crop)...');
  await clickNextInDialog(page, log);

  // ── 7. Edit step: upload cover/thumbnail ──────────────────────────────────
  log('Step 7: Setting cover photo / thumbnail...');
  if (fs.existsSync(CONFIG.coverPhoto)) {
    try {
      // Look for "Cover photo" tab
      const coverTab = page.locator('div[role="dialog"]').locator(
        'div[role="tab"]:has-text("Cover photo"), div[role="tab"]:has-text("Cover"), ' +
        'button:has-text("Cover photo"), button:has-text("Cover"), ' +
        'span:has-text("Cover photo"), span:text-is("Cover"), ' +
        'div[role="tab"]:has-text("カバー写真"), div[role="tab"]:has-text("カバー"), ' +
        'button:has-text("カバー写真"), button:has-text("カバー"), ' +
        'span:has-text("カバー写真"), span:text-is("カバー")'
      ).first();

      const coverVisible = await coverTab.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
      if (coverVisible) {
        log('  Clicking Cover photo tab...');
        await coverTab.click();
        await page.waitForTimeout(2000);

        // Click "Select from computer" inside the cover photo panel
        const selectCover = page.locator('div[role="dialog"]').locator(
          'button:has-text("Select from computer"), button:has-text("コンピューターから選択"), ' +
          'div[role="button"]:has-text("Select from computer"), div[role="button"]:has-text("コンピューターから選択"), ' +
          'button:has-text("Select from"), [role="button"]:has-text("Select from")'
        ).first();

        const selectCoverVisible = await selectCover.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
        if (selectCoverVisible) {
          const [coverFc] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 10000 }),
            selectCover.click({ force: true }),
          ]);
          await coverFc.setFiles(CONFIG.coverPhoto);
          log('  ✅ Cover photo uploaded via file chooser!');
          await page.waitForTimeout(3000);
        } else {
          const dialogInputs = page.locator('div[role="dialog"] input[type="file"], input[type="file"]');
          if (await dialogInputs.count() > 0) {
            await dialogInputs.last().setInputFiles(CONFIG.coverPhoto);
            log('  ✅ Cover photo uploaded via dialog file input!');
            await page.waitForTimeout(3000);
          }
        }
      } else {
        log('  ⚠️ Cover photo tab not visible.');
      }
    } catch (e) {
      log(`  Cover photo notice: ${e.message}`);
    }
  }

  // ── 8. Click "Next" to advance past edit/cover step ───────────────────────
  log('Step 8: Clicking Next (past edit)...');
  await clickNextInDialog(page, log);

  // ── 9. Caption step: fill in caption text ─────────────────────────────────
  log('Step 9: Filling caption...');
  const captionBox = page.locator('div[role="dialog"]').locator(
    'div[role="textbox"][aria-label*="caption" i], ' +
    'div[role="textbox"][aria-label*="キャプション" i], ' +
    'div[aria-label*="caption" i][contenteditable="true"], ' +
    'div[aria-label*="キャプション" i][contenteditable="true"], ' +
    'div[contenteditable="true"]'
  ).first();

  await captionBox.waitFor({ state: 'visible', timeout: 15000 });
  await captionBox.click();
  await captionBox.focus();
  await page.waitForTimeout(300);

  await captionBox.evaluate((el, text) => {
    el.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, caption);
  await page.waitForTimeout(1000);

  // Dismiss any hashtag autocomplete that may block the Share button
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  // ── 10. Click Share ───────────────────────────────────────────────────────
  log('Step 10: Clicking Share...');
  const shareClicked = await page.evaluate(() => {
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    for (const dlg of dialogs) {
      const candidates = Array.from(dlg.querySelectorAll('button, div[role="button"], span[role="button"]'));
      for (let i = candidates.length - 1; i >= 0; i--) {
        const text = (candidates[i].innerText || candidates[i].textContent || '').trim().toLowerCase();
        if (text === 'share' || text === 'シェア') {
          candidates[i].click();
          return text;
        }
      }
    }
    return null;
  }).catch(() => null);

  if (!shareClicked) {
    const shareBtn = page.locator('div[role="dialog"]').locator(
      'div[role="button"]:has-text("Share"), button:has-text("Share"), ' +
      'div[role="button"]:has-text("シェア"), button:has-text("シェア")'
    ).last();
    await shareBtn.waitFor({ state: 'visible', timeout: 15000 });
    await shareBtn.click({ force: true });
  }

  log(`✅ Share clicked — R${reelNum}.mp4 upload initiated!`);
  await page.waitForTimeout(4000);
}

/**
 * Helper: Clicks "Next" / "次へ" inside the dialog.
 * Scoped to div[role="dialog"] header first, then broader.
 */
async function clickNextInDialog(page, log) {
  // 1. Direct evaluate inside dialog (fast and reliable)
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
    log(`  ✅ Next clicked ("${clicked}") via DOM`);
    await page.waitForTimeout(2500);
    return;
  }

  // 2. Playwright locator fallback
  const nextBtn = page.locator('div[role="dialog"]').locator(
    'button:has-text("Next"), div[role="button"]:has-text("Next"), ' +
    'button:has-text("次へ"), div[role="button"]:has-text("次へ")'
  ).first();

  await nextBtn.waitFor({ state: 'visible', timeout: 15000 });
  await nextBtn.click({ force: true });
  await page.waitForTimeout(2500);
  log('  ✅ Next clicked via locator');
}

// ==========================================
// PIPELINE: Upload 20 Reels Sequentially
// ==========================================
async function uploadAllReelsPipeline(context, caption) {
  const TOTAL  = CONFIG.totalReelsToUpload; // 20
  const UNIQUE = CONFIG.numUniqueReels;     // 5
  const seq = Array.from({ length: TOTAL }, (_, i) => (i % UNIQUE) + 1);

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`🎬 PIPELINE UPLOAD — ${TOTAL} reels, 1 tab at a time`);
  console.log(`📋 Sequence : ${seq.join(' → ')}`);
  console.log(`📂 Reels    : ${CONFIG.reelsFolder}`);
  console.log(`🖼️  Cover    : ${CONFIG.coverPhoto}`);
  console.log('════════════════════════════════════════════════════════\n');

  const pages = [];
  let okCount = 0;
  let failCount = 0;

  for (let i = 0; i < TOTAL; i++) {
    const reelNum  = seq[i];
    const tabIndex = i + 1;

    console.log(`\n────────────────────────────────────────────────────────`);
    console.log(`▶ [TAB ${tabIndex}/${TOTAL}] Preparing upload for R${reelNum}.mp4...`);
    console.log(`────────────────────────────────────────────────────────`);

    const newPage = await context.newPage();
    pages.push(newPage);

    await newPage.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
    await newPage.waitForTimeout(3500);

    let success = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await uploadSingleReelOnPage(newPage, reelNum, caption, tabIndex);
        success = true;
        break;
      } catch (err) {
        const errMsg = `❌ [TAB ${tabIndex}] Attempt ${attempt} failed: ${err.message}`;
        console.error(errMsg);
        try { fs.appendFileSync(path.join(__dirname, 'automation.log'), `[${new Date().toISOString()}] ${errMsg}\n${err.stack}\n`); } catch {}
        await debugScreenshot(newPage, `tab${tabIndex}_attempt${attempt}_fail`);
        if (attempt < 2) {
          console.log(`🔄 Retrying Tab ${tabIndex} in 3 seconds...`);
          await newPage.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          await newPage.waitForTimeout(3000);
        }
      }
    }

    if (success) {
      okCount++;
      console.log(`🎉 [TAB ${tabIndex} DONE] Share clicked! Upload running in background.`);
    } else {
      failCount++;
      console.error(`🚨 [TAB ${tabIndex} FAILED] Could not complete upload after 2 attempts.`);
      console.error(`   Stopping pipeline to avoid opening more broken tabs.`);
      break; // HALT — don't open more tabs if one fails
    }

    if (i < TOTAL - 1) {
      console.log(`🚀 Opening Tab ${tabIndex + 1} immediately for next reel...\n`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════');
  console.log(`📊 Pipeline complete — ✅ ${okCount} uploads | ❌ ${failCount} errors`);
  console.log('════════════════════════════════════════════════════════');

  if (okCount === 0) {
    console.error('\n⚠️ [NOTICE] 0 reels were uploaded successfully. Closing tabs to proceed.');
    for (const p of pages) await p.close().catch(() => {});
    return;
  }

  // ── Keep tabs open for manual verification ────────────────────────────────
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   🔍  MANUAL CHECK — DO NOT CLOSE THE BROWSER           ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  All tabs are open. Check EACH tab and confirm:         ║');
  console.log('║    ✅  "Your reel has been shared." message appears, OR ║');
  console.log('║    ✅  The reel is visible on the profile.              ║');
  console.log('║                                                          ║');
  console.log('║  Once verified, press ENTER below.                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n');

  await promptTerminalInput('>> Press ENTER after verifying all reels: ');

  console.log('\n[INFO] Closing all upload tabs...');
  for (const p of pages) await p.close().catch(() => {});
  console.log('✅ All tabs closed. Proceeding to logout.\n');
}

// ==========================================
// LOGOUT
// ==========================================
async function logoutAccount(page, context) {
  console.log('\n==============================================');
  console.log('🚪 [LOGOUT] Logging out of account...');
  console.log('==============================================');

  try {
    const moreBtn = page.locator(
      'svg[aria-label="Settings"], svg[aria-label="More options"], ' +
      'a:has-text("More"), span:has-text("More"), ' +
      'div[role="button"]:has-text("More"), ' +
      'a:has-text("その他"), span:has-text("その他"), ' +
      'div[role="button"]:has-text("その他")'
    ).first();

    if (await moreBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await moreBtn.click();
      await page.waitForTimeout(1500);

      const logoutOption = page.locator(
        'span:has-text("Log out"), div:has-text("Log out"), button:has-text("Log out"), ' +
        'span:has-text("ログアウト"), div:has-text("ログアウト"), button:has-text("ログアウト")'
      ).first();
      if (await logoutOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await logoutOption.click();
        await page.waitForTimeout(3000);
      }
    }
  } catch { }

  await context.clearCookies().catch(() => { });
  console.log('✅ [SUCCESS] Logged out! Ready for next account cycle.\n');
}

// ==========================================
// SINGLE ACCOUNT CYCLE
// ==========================================
async function runSingleAccountCycle(page, context, cycleNum) {
  console.log(`\n==============================================`);
  console.log(`🚀 [CYCLE #${cycleNum}] Starting Account Creation`);
  console.log(`==============================================`);

  // STEP 1: Go to sign-up page
  console.log('[STEP 1] Navigating to Instagram sign-up page...');
  await page.goto(CONFIG.signupUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await handleCookieConsent(page);

  // STEP 2: Ask for Email
  const targetEmail = await promptForEmailInBrowser(page, cycleNum);
  console.log(`✅ [INFO] Received email: ${targetEmail}`);

  let currentUsername = generateDynamicUsername(CONFIG.baseUsername);
  let currentPassword = generateDynamicPassword();
  console.log(`👤 Initial Username: ${currentUsername}`);
  console.log(`🔑 Generated Password: ${currentPassword}`);

  // STEP 3: Fill Details
  console.log('[STEP 3] Filling sign-up form fields...');

  const emailInput = page.locator(
    'label:has-text("Mobile number or email") input, ' +
    'input[placeholder*="Mobile number or email"], ' +
    'input[name="emailOrPhone"], input[name="email"]'
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

  // STEP 4: Submit & Verify Username
  console.log('[STEP 4] Submitting form with username verification...');
  const submitBtn = page.locator(
    'div[role="button"]:has-text("Submit"), button:has-text("Submit"), ' +
    'button[type="submit"], button:has-text("Next"), ' +
    'div[role="button"]:has-text("送信"), button:has-text("送信"), ' +
    'div[role="button"]:has-text("次へ"), button:has-text("次へ")'
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

  // STEP 5: Wait for OTP or Direct Login
  console.log('[STEP 5] Waiting for OTP or direct login...');

  const otpSelector = 'input[name="email_confirmation_code"], input[name="verificationCode"], input[autocomplete="one-time-code"], input[placeholder*="confirmation code" i], input[placeholder*="Code" i], input[maxlength="6"]';
  const notNowSelector = 'button:has-text("Not Now"), button:has-text("Not now"), button:has-text("後で"), button:has-text("今はしない"), button:has-text("Save info"), button:has-text("Save Info"), button:has-text("Skip"), button:has-text("スキップ")';
  const profileSelector = 'a:has-text("Profile"), a[role="link"]:has(img[alt*="profile" i]), span:has-text("Profile"), span:has-text("プロフィール")';

  let nextStep = 'UNKNOWN';
  for (let i = 0; i < 30; i++) {
    if (await checkAndHandleSuspendedCheckpoint(page)) {
      await context.clearCookies().catch(() => { });
      return;
    }

    // Auto-dismiss any popup as soon as it appears
    await dismissAllPopups(page, 2);

    if (await page.locator(notNowSelector).first().isVisible().catch(() => false) ||
        await page.locator(profileSelector).first().isVisible().catch(() => false) ||
        page.url() === 'https://www.instagram.com/' ||
        page.url().includes('instagram.com/?') ||
        (!page.url().includes('emailsignup') && !page.url().includes('challenge'))) {
      nextStep = 'LOGGED_IN';
      break;
    }

    if (await page.locator(otpSelector).first().isVisible().catch(() => false)) {
      nextStep = 'OTP';
      break;
    }

    await page.waitForTimeout(1500);
  }

  if (nextStep === 'OTP') {
    console.log('\n==========================================================');
    console.log('🔑 [OTP REQUIRED] Please enter the OTP directly on the browser screen!');
    console.log('   The script is actively watching and will auto-continue');
    console.log('   the moment you submit.');
    console.log('==========================================================\n');

    // Poll up to 120 seconds waiting for user to verify OTP in browser
    for (let w = 0; w < 120; w++) {
      await dismissAllPopups(page, 1);

      const currentUrl = page.url();
      if (!currentUrl.includes('emailsignup') ||
          currentUrl === 'https://www.instagram.com/' ||
          currentUrl.includes('instagram.com/?') ||
          await page.locator('text="Turn on Notifications"').isVisible().catch(() => false)) {
        console.log('✅ [SUCCESS] OTP verified and logged into Instagram!');
        break;
      }

      if (await checkAndHandleSuspendedCheckpoint(page)) {
        await context.clearCookies().catch(() => { });
        return;
      }

      await page.waitForTimeout(1000);
    }
  } else if (nextStep === 'LOGGED_IN') {
    console.log('✅ [INFO] Direct login detected!');
  } else {
    console.log('[INFO] Proceeding to clear onboarding popups...');
  }

  // STEP 6: Dismiss all onboarding popups (Save info, Turn on notifications, Skip photo, etc.)
  console.log('[STEP 6] Clearing all onboarding popups...');

  // Keep dismissing until we land on a stable page (no more popups for 3 consecutive checks)
  let stableCount = 0;
  for (let attempt = 0; attempt < 20 && stableCount < 3; attempt++) {
    // Explicitly handle "Turn on Notifications" / "Not Now" with DOM evaluate
    const dismissed = await page.evaluate(() => {
      const dismissWords = [
        'not now', '後で', '今はしない',
        'save info', 'save information', '情報を保存',
        'skip', 'スキップ',
        'cancel', 'キャンセル',
        'close', '閉じる',
        'turn on', // skip "Turn On" button, prefer "Not Now"
      ];
      const skipWords = ['not now', '後で', '今はしない', 'skip', 'スキップ', 'save info', '情報を保存'];
      const allBtns = Array.from(document.querySelectorAll('button, div[role="button"], span[role="button"]'));

      // Prefer "Not Now" / "Skip" over "Turn On"
      for (const el of allBtns) {
        const t = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (skipWords.includes(t)) {
          el.click();
          return t;
        }
      }
      return null;
    }).catch(() => null);

    if (dismissed) {
      console.log(`🔔 [POPUP] Cleared "${dismissed}" (step 6 loop)`);
      await page.waitForTimeout(1500);
      stableCount = 0;
      continue;
    }

    await dismissAllPopups(page, 2);
    await page.waitForTimeout(1000);
    stableCount++;
  }

  // Navigate to home to ensure we're on the feed
  const currentUrl = page.url();
  if (!currentUrl.includes('instagram.com/') || currentUrl.includes('emailsignup') || currentUrl.includes('challenge')) {
    console.log('[STEP 6] Navigating to Instagram home feed...');
    await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await dismissAllPopups(page, 6);
  }
  console.log('✅ [STEP 6] All popups dismissed. On home feed.');

  // STEP 7: Edit Profile — Add Bio + Profile Photo
  await addBioToProfile(page, CONFIG.bioText, currentUsername);
  await page.waitForTimeout(4000);

  // Save credentials to accounts.txt
  const accountDetails = `Email: ${targetEmail} | Username: ${currentUsername} | Password: ${currentPassword}\n`;
  const savePath = path.join(__dirname, 'accounts.txt');
  fs.appendFileSync(savePath, accountDetails);
  console.log(`💾 [SAVED] ${accountDetails.trim()}`);
  console.log(`📄 [FILE]  ${savePath}`);

  // STEP 8: Upload 20 Reels in pipeline fashion
  const captionPath = path.join(__dirname, 'Reels', 'CAPTION.txt');
  const reelCaption = fs.existsSync(captionPath)
    ? fs.readFileSync(captionPath, 'utf8')
    : CONFIG.reelCaption;
  await uploadAllReelsPipeline(context, reelCaption);

  // STEP 9: Logout
  await logoutAccount(page, context);
}

// ==========================================
// MAIN LOOP
// ==========================================
async function startAutomationLoop() {
  console.log('=============================================================');
  console.log('🚀 INSTAGRAM AUTOMATION LOOP STARTED');
  console.log('   Script will create account -> add bio -> upload reels -> logout -> repeat!');
  console.log('   To stop at any time, press Ctrl+C in this terminal.');
  console.log('=============================================================\n');

  const browser = await chromium.launch({
    executablePath: CONFIG.browserPath,
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo,
  });

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
        console.log(`\n⏳ Preparing next cycle in 3 seconds...\n`);
        await page.waitForTimeout(3000);
      } catch (cycleError) {
        console.error(`❌ [ERROR in Cycle #${cycle}]:`, cycleError.message);
        await context.clearCookies().catch(() => { });
        await page.goto(CONFIG.signupUrl, { waitUntil: 'domcontentloaded' }).catch(() => { });
        await page.waitForTimeout(3000);
      }
    }
  } finally {
    await browser.close().catch(() => { });
  }
}

// Start the loop
startAutomationLoop();

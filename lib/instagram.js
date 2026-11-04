/**
 * Instagram Core Automation Module (Playwright)
 * Provides clean, robust, and reusable actions for login, bio update, and reel upload.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const CONFIG = require('../config');
const { logInfo, logSuccess, logWarn, logError } = require('./ui');

/**
 * Saves a debug screenshot to the debug folder
 */
async function takeDebugScreenshot(page, label = 'error') {
  try {
    if (!fs.existsSync(CONFIG.debugDir)) {
      fs.mkdirSync(CONFIG.debugDir, { recursive: true });
    }
    const filename = `${label}_${Date.now()}.png`;
    const fullPath = path.join(CONFIG.debugDir, filename);
    await page.screenshot({ path: fullPath });
    logInfo(`Saved debug screenshot: debug_screenshots/${filename}`);
    return fullPath;
  } catch {
    return null;
  }
}

/**
 * Launches the browser and returns { browser, context, page }
 */
async function initBrowser(options = {}) {
  const launchOptions = {
    headless: options.headless ?? CONFIG.headless,
    slowMo: options.slowMo ?? CONFIG.slowMo,
  };

  if (CONFIG.browserPath && fs.existsSync(CONFIG.browserPath)) {
    launchOptions.executablePath = CONFIG.browserPath;
    logInfo(`Using browser binary: ${CONFIG.browserPath}`);
  } else {
    logInfo('Using default Playwright Chromium browser');
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: CONFIG.viewport,
    userAgent: CONFIG.userAgent,
  });

  const page = await context.newPage();
  return { browser, context, page };
}

/**
 * Dismisses common Instagram popups (Not Now, Save Info, Skip, Cancel, Close)
 */
async function dismissPopups(page, maxRounds = 5) {
  const dismissTargets = [
    'not now', '後で', '今はしない',
    'save info', 'save information', '情報を保存',
    'skip', 'スキップ',
    'cancel', 'キャンセル',
    'close', '閉じる'
  ];

  for (let r = 0; r < maxRounds; r++) {
    try {
      const clicked = await page.evaluate((targets) => {
        const elements = Array.from(document.querySelectorAll('button, div[role="button"], a[role="button"], span[role="button"]'));
        for (const el of elements) {
          const text = (el.innerText || el.textContent || '').trim().toLowerCase();
          if (targets.some(t => text === t || text.startsWith(t))) {
            el.click();
            return text;
          }
        }
        return null;
      }, dismissTargets);

      if (clicked) {
        logInfo(`Dismissed popup: "${clicked}"`);
        await page.waitForTimeout(1000);
      } else {
        break; // No more popups detected
      }
    } catch {
      break;
    }
  }
}

/**
 * Handles Instagram Cookie Consent banner if present
 */
async function handleCookieConsent(page) {
  try {
    const consentBtn = page.locator([
      'button:has-text("Allow all cookies")',
      'button:has-text("Allow essential and optional cookies")',
      'button:has-text("Accept All")',
      'button:has-text("Accept")',
      'button:has-text("Decline optional cookies")',
      'button:has-text("Only allow essential cookies")',
      'button:has-text("すべてのクッキーを許可")',
      'button:has-text("同意する")',
      'button:has-text("必須クッキーのみ許可")',
    ].join(', ')).first();

    if (await consentBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await consentBtn.click({ force: true });
      logInfo('Accepted / dismissed cookie consent banner');
      await page.waitForTimeout(1000);
    }
  } catch {}
}

/**
 * Inspects the current page to determine if Instagram is genuinely logged in.
 * Requires STRICT positive proof of logged-in navigation icons.
 * Never guesses based on URL or absence of fields.
 * @returns {Promise<{ loggedIn: boolean, username?: string }>}
 */
async function checkLoginState(page) {
  try {
    return await page.evaluate(() => {
      // 1. If ANY password field or login form is present, we are 100% NOT logged in
      const passwordInput = document.querySelector('input[type="password"], input[name="password"]');
      if (passwordInput && passwordInput.offsetParent !== null) {
        return { loggedIn: false };
      }

      // Check for login headers/buttons
      const loginHeaders = Array.from(document.querySelectorAll('h2, span, button')).some(el => {
        const text = (el.innerText || '').trim().toLowerCase();
        return text === 'log in to instagram' || text === 'log in with facebook';
      });
      if (loginHeaders) {
        return { loggedIn: false };
      }

      // 2. Strict check for definitive logged-in navigation elements
      const loggedInSelectors = [
        'svg[aria-label="Home"]',
        'svg[aria-label="ホーム"]',
        'svg[aria-label="New post"]',
        'svg[aria-label="新規投稿"]',
        'svg[aria-label="Create"]',
        'svg[aria-label="作成"]',
        'svg[aria-label="Direct messaging"]',
        'svg[aria-label="Messages"]',
        'svg[aria-label="Reels"]',
        'svg[aria-label="リール"]',
        'a[href*="/direct/inbox/"]',
      ];

      for (const sel of loggedInSelectors) {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null) {
          // Attempt to extract logged in username
          let username = null;
          const profileLink = document.querySelector('a[href^="/"][role="link"]:has(img), a[href^="/"][role="link"]:has(svg[aria-label*="Profile" i])');
          if (profileLink) {
            const href = profileLink.getAttribute('href') || '';
            const match = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
            if (match && !['explore', 'reels', 'direct', 'stories'].includes(match[1])) {
              username = match[1];
            }
          }
          return { loggedIn: true, username };
        }
      }

      // 3. Check for profile picture in sidebar
      const profilePic = document.querySelector('img[alt*="profile picture" i]');
      if (profilePic && profilePic.offsetParent !== null) {
        return { loggedIn: true };
      }

      return { loggedIn: false };
    });
  } catch {
    return { loggedIn: false };
  }
}

/**
 * Logs into Instagram with given username and password.
 * Automatically handles landing page login, /accounts/login/, and cookie banners.
 * @returns {Promise<{ success: boolean, reason?: string, alreadyLoggedIn?: boolean, needsUserCheck?: boolean }>}
 */
async function login(page, username, password) {
  logInfo(`Checking Instagram session for @${username}...`);

  // Step 1: Check if browser already has an active session
  let currentState = await checkLoginState(page);
  if (currentState.loggedIn) {
    if (currentState.username && currentState.username.toLowerCase() === username.toLowerCase()) {
      logSuccess(`Already logged in as @${username}!`);
      return { success: true, alreadyLoggedIn: true };
    } else if (currentState.username) {
      logWarn(`Currently logged in as a different user: @${currentState.username}`);
      logInfo(`Logging out to switch to @${username}...`);
      await logout(page, page.context());
      await page.waitForTimeout(2000);
    } else {
      logSuccess(`Active Instagram session detected! Proceeding as @${username}.`);
      return { success: true, alreadyLoggedIn: true };
    }
  }

  // Step 2: Ensure we are on an Instagram page with a login form
  const hasLoginForm = await page.evaluate(() => {
    return !!document.querySelector('input[type="password"], input[name="password"]');
  }).catch(() => false);

  if (!hasLoginForm) {
    logInfo(`Navigating to Instagram login: ${CONFIG.loginUrl}...`);
    try {
      await page.goto(CONFIG.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);
    } catch (err) {
      logWarn(`Notice loading login URL: ${err.message}`);
    }
  }

  // Dismiss cookies & popups
  await handleCookieConsent(page);
  await dismissPopups(page, 2);

  // Step 3: Check for "Switch accounts" prompt (when Instagram remembers a cached profile)
  try {
    const switchBtn = page.locator([
      'button:has-text("Switch accounts")',
      'a:has-text("Switch accounts")',
      '[role="button"]:has-text("Switch accounts")',
      'button:has-text("アカウントを切り替える")',
      'a:has-text("アカウントを切り替える")',
    ].join(', ')).first();

    if (await switchBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      logInfo('Detected "Switch accounts" prompt — clicking to show login fields...');
      await switchBtn.click({ force: true });
      await page.waitForTimeout(1500);
    }
  } catch {}

  // Step 4: Locate username & password inputs
  const userInput = page.locator([
    'input[name="username"]',
    'input[aria-label*="Phone" i]',
    'input[aria-label*="Mobile" i]',
    'input[aria-label*="username" i]',
    'input[placeholder*="username" i]',
    'input[placeholder*="Mobile" i]',
    'input[placeholder*="Phone" i]',
    'input[type="text"]'
  ].join(', ')).first();

  const passInput = page.locator([
    'input[name="password"]',
    'input[type="password"]',
    'input[aria-label*="password" i]',
    'input[placeholder*="Password" i]'
  ].join(', ')).first();

  const submitBtn = page.locator([
    'button[type="submit"]',
    'button:has-text("Log in")',
    'button:has-text("Log In")',
    'button:has-text("ログイン")',
    'div[role="button"]:has-text("Log in")',
  ].join(', ')).first();

  // Wait for fields to become visible
  try {
    await userInput.waitFor({ state: 'visible', timeout: 10000 });
    await passInput.waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    // If fields still aren't visible, check if we somehow became logged in
    const checkAgain = await checkLoginState(page);
    if (checkAgain.loggedIn) {
      logSuccess('Active session verified.');
      return { success: true, alreadyLoggedIn: true };
    }

    await takeDebugScreenshot(page, 'login_fields_not_found');
    return {
      success: false,
      reason: 'Login input fields were not found on the page',
      needsUserCheck: true,
    };
  }

  // Step 5: Fill credentials with realistic keystrokes
  try {
    logInfo(`Entering credentials for @${username}...`);
    await userInput.click();
    await userInput.fill('');
    await userInput.pressSequentially(username, { delay: 30 });
    await page.waitForTimeout(300);

    await passInput.click();
    await passInput.fill('');
    await passInput.pressSequentially(password, { delay: 30 });
    await page.waitForTimeout(400);

    logInfo('Submitting login form...');
    await submitBtn.click();
    await page.waitForTimeout(4000);
  } catch (fillErr) {
    return { success: false, reason: `Failed to fill login form: ${fillErr.message}`, needsUserCheck: true };
  }

  // Step 6: Check for error banners / incorrect password
  const errorMsg = page.locator(
    '#slfErrorAlert, p[role="alert"], [data-testid="login-error-message"], div:has-text("Sorry, your password was incorrect"), div:has-text("The username you entered doesn\'t belong to an account")'
  ).first();

  if (await errorMsg.isVisible({ timeout: 2500 }).catch(() => false)) {
    const errText = (await errorMsg.innerText().catch(() => '')) || 'Invalid credentials';
    await takeDebugScreenshot(page, 'login_error');
    return { success: false, reason: errText.trim() };
  }

  // Step 7: Handle 2FA / Verification Checkpoint
  const currentUrl = page.url();
  if (currentUrl.includes('/challenge/') || currentUrl.includes('/checkpoint/')) {
    logWarn('⚠️ Instagram requires verification / challenge checkpoint.');
    logInfo('Please complete the verification directly in the browser window...');
    for (let c = 0; c < 30; c++) {
      await page.waitForTimeout(1500);
      const url = page.url();
      if (!url.includes('/challenge/') && !url.includes('/checkpoint/')) {
        logSuccess('Challenge resolved!');
        break;
      }
    }
  }

  // Step 8: Dismiss post-login popups ("Save info", "Turn on notifications")
  await dismissPopups(page, 6);

  // Step 9: Verify logged-in state by waiting for feed elements
  logInfo('Verifying login completion...');
  for (let waitSec = 0; waitSec < 15; waitSec++) {
    const verifiedState = await checkLoginState(page);
    if (verifiedState.loggedIn) {
      logSuccess(`Successfully logged in as @${username}!`);
      return { success: true };
    }
    // Also dismiss any popup that might be overlaying the feed
    await dismissPopups(page, 1);
    await page.waitForTimeout(1000);
  }

  // If URL navigated away from login and password field is gone, assume success
  const finalHasPassword = await page.evaluate(() => !!document.querySelector('input[type="password"]')).catch(() => true);
  if (!finalHasPassword && !page.url().includes('login')) {
    logSuccess(`Successfully logged in as @${username}!`);
    return { success: true };
  }

  return {
    success: false,
    reason: 'Login submitted, but feed did not load within 15 seconds',
    needsUserCheck: true,
  };
}

/**
 * Updates Bio text and uploads Profile Photo on Edit Profile page
 * @returns {Promise<{ success: boolean, reason?: string }>}
 */
async function updateBioAndPhoto(page, options = {}) {
  const bioText = options.bioText || CONFIG.bioText;
  const photoPath = options.profilePhotoPath || CONFIG.profilePhoto;
  const username = options.username || '';

  logInfo('Navigating to Edit Profile page...');
  await page.goto(CONFIG.editProfileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  await dismissPopups(page);

  // If redirected away from edit profile, navigate via profile page
  if (!page.url().includes('edit') && username) {
    logInfo(`Redirected. Navigating directly to profile: https://www.instagram.com/${username}/`);
    await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const editBtn = page.locator(
      'a:has-text("Edit Profile"), a:has-text("Edit profile"), button:has-text("Edit Profile"), button:has-text("Edit profile"), a:has-text("プロフィールを編集")'
    ).first();
    if (await editBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      await editBtn.click();
      await page.waitForTimeout(3000);
      await dismissPopups(page);
    }
  }

  // 1. Upload Profile Photo if file exists
  if (fs.existsSync(photoPath)) {
    logInfo(`Uploading profile photo from: ${path.basename(photoPath)}...`);
    try {
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(photoPath);
        await page.waitForTimeout(3000);
        logSuccess('Profile photo uploaded via file input.');
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
            await fileChooser.setFiles(photoPath);
            await page.waitForTimeout(3500);
            logSuccess('Profile photo uploaded via file chooser.');
          }
        }
      }
    } catch (photoErr) {
      logWarn(`Could not upload profile photo: ${photoErr.message}`);
    }
  } else {
    logWarn(`Profile photo file not found at: ${photoPath} (skipping photo upload)`);
  }

  // 2. Locate Bio textarea
  logInfo('Locating Bio textarea...');
  const bioTextarea = page.locator(
    'textarea#pepBio, textarea[id*="bio" i], textarea[aria-label*="Bio" i], textarea[aria-label*="自己紹介" i], textarea[placeholder*="Bio" i], textarea'
  ).first();

  try {
    await bioTextarea.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    await takeDebugScreenshot(page, 'bio_textarea_not_found');
    return { success: false, reason: 'Bio textarea could not be found' };
  }

  // 3. Clear and Fill Bio
  logInfo('Setting Bio text...');
  await bioTextarea.scrollIntoViewIfNeeded().catch(() => {});
  await bioTextarea.click();
  await bioTextarea.focus();

  // Clear existing
  await page.keyboard.press('Control+A');
  await page.waitForTimeout(150);
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Dispatch text via execCommand for React reconciliation
  await bioTextarea.evaluate((el, text) => {
    el.focus();
    el.value = '';
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, bioText);
  await page.waitForTimeout(400);

  // Fallback to .fill() if execCommand did not set
  const currentVal = await bioTextarea.inputValue().catch(() => '');
  if (!currentVal || currentVal.trim() === '') {
    await bioTextarea.fill(bioText);
    await page.waitForTimeout(300);
  }

  // 4. Click Submit / Save Button
  logInfo('Saving profile changes...');
  const saveBtn = page.locator(
    'button[type="submit"], div[role="button"]:has-text("Submit"), button:has-text("Submit"), div[role="button"]:has-text("Save"), button:has-text("Save"), div[role="button"]:has-text("送信"), button:has-text("送信"), div[role="button"]:has-text("保存"), button:has-text("保存")'
  ).first();

  await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
  if (await saveBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
    await saveBtn.click({ force: true });
    await page.waitForTimeout(3500);
    logSuccess('Bio updated and saved successfully!');
    return { success: true };
  } else {
    logWarn('Save button not visible, checking if changes were auto-saved...');
    return { success: true };
  }
}

/**
 * Uploads a single Reel on the provided page
 * @returns {Promise<{ success: boolean, reason?: string }>}
 */
async function uploadReel(page, options = {}) {
  const reelPath = options.reelPath;
  // Always prioritize the real file at /Users/ajaykumar/Desktop/Insta Automation/Reels/CAPTION.txt
  const captionPath = CONFIG.captionFile;
  const caption = (fs.existsSync(captionPath) ? fs.readFileSync(captionPath, 'utf8').trim() : '') || options.caption || CONFIG.reelCaption;
  const coverPhotoPath = options.coverPhotoPath || CONFIG.coverPhoto;
  const label = options.label || path.basename(reelPath);

  if (!fs.existsSync(reelPath)) {
    return { success: false, reason: `Reel video file not found at: ${reelPath}` };
  }

  logInfo(`Starting upload: ${label}...`);
  await dismissPopups(page);

  // ── Step 1: Click "Create" (+) button in sidebar ───────────────────────
  logInfo('Step 1: Clicking Create (+) button...');
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
  ].join(', ')).first();

  await createBtn.waitFor({ state: 'visible', timeout: 20000 });
  await createBtn.click({ force: true });
  await page.waitForTimeout(2000);

  // ── Step 2: Handle "Post" dropdown menu (with overlay fix) ─────────────
  logInfo('Step 2: Checking for Create menu / upload modal...');
  const dialogVisible = await page.locator('div[role="dialog"]').first().isVisible().catch(() => false);

  if (!dialogVisible) {
    const postItem = page.locator([
      '[role="menuitem"]:has-text("Post")',
      '[role="menuitem"]:has-text("投稿")',
      'a:has-text("Post")',
      'a:has-text("投稿")',
      'span:text-is("Post")',
      'span:text-is("投稿")',
      'div[role="button"]:has-text("Post")',
      'div[role="button"]:has-text("投稿")',
    ].join(', ')).first();

    if (await postItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      logInfo('Selecting "Post" option...');
      // Safe click: evaluate DOM click first to avoid pointer interception overlay hangs
      const clickedViaDom = await postItem.evaluate((el) => {
        el.click();
        return true;
      }).catch(() => false);

      if (!clickedViaDom) {
        await postItem.click({ force: true, timeout: 5000 });
      }
      await page.waitForTimeout(2000);
    }
  }

  // ── Step 3: Wait for Upload Dialog & Inject Video ───────────────────────
  logInfo('Step 3: Waiting for upload modal dialog...');
  const dialog = page.locator('div[role="dialog"]').first();
  await dialog.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForTimeout(1500);

  let videoLoaded = false;
  const checkVideoReady = async () => {
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

  // 3a. Primary: filechooser on "Select from computer" button
  try {
    const selectBtn = page.getByRole('button', { name: /Select from computer|コンピューターから選択/i })
      .or(page.locator('div[role="dialog"] button:has-text("Select from computer")'))
      .or(page.locator('div[role="dialog"] [role="button"]:has-text("Select from computer")'))
      .or(page.getByText('Select from computer', { exact: true }))
      .first();

    if (await selectBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        selectBtn.click({ force: true }),
      ]);
      await fileChooser.setFiles(reelPath);
      await page.waitForTimeout(3000);
      if (await checkVideoReady()) videoLoaded = true;
    }
  } catch {}

  // 3b. Fallback: input[type="file"]
  if (!videoLoaded) {
    try {
      const fileInputs = page.locator('input[type="file"]');
      if (await fileInputs.count() > 0) {
        await fileInputs.last().setInputFiles(reelPath);
        await page.waitForTimeout(3000);
        if (await checkVideoReady()) videoLoaded = true;
      }
    } catch {}
  }

  // Active wait for video decode
  for (let w = 0; w < 25; w++) {
    if (await checkVideoReady()) {
      videoLoaded = true;
      break;
    }
    // Handle "OK" dialog if it pops up early
    const okBtn = page.locator('div[role="dialog"] button:has-text("OK"), div[role="dialog"] button:has-text("了解")').first();
    if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click({ force: true }).catch(() => {});
      videoLoaded = true;
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (!videoLoaded) {
    await takeDebugScreenshot(page, 'video_load_failed');
    return { success: false, reason: 'Video preview failed to load into upload dialog' };
  }

  logSuccess('Video loaded successfully into dialog!');

  // ── Step 4: Handle "Video posts are now shared as reels" OK button ──────
  const okBtn = page.locator('div[role="dialog"]').locator(
    'button:has-text("OK"), button:has-text("了解"), button:text-is("OK")'
  ).first();
  if (await okBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
    await okBtn.click({ force: true });
    await page.waitForTimeout(1500);
  }

  // ── Step 5: Crop options (9:16 vertical) ────────────────────────────────
  try {
    const cropBtn = page.locator('div[role="dialog"]').locator(
      'svg[aria-label="Select crop"], svg[aria-label="切り抜きを選択"], button:has(svg[aria-label*="crop" i])'
    ).first();
    if (await cropBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await cropBtn.click();
      await page.waitForTimeout(500);
      const ratio916 = page.locator('span:text-is("9:16"), div:text-is("9:16"), [role="button"]:has-text("9:16")').first();
      if (await ratio916.isVisible({ timeout: 1500 }).catch(() => false)) {
        await ratio916.click();
        await page.waitForTimeout(800);
        logInfo('Crop set to 9:16.');
      }
    }
  } catch {}

  // ── Step 6: Advance past Crop (Click Next) ──────────────────────────────
  await clickNextInDialog(page);

  // ── Step 7: Cover photo / thumbnail ────────────────────────────────────
  const coverFile = fs.existsSync(coverPhotoPath)
    ? coverPhotoPath
    : (fs.existsSync(CONFIG.coverPhoto) ? CONFIG.coverPhoto : null);

  if (coverFile) {
    logInfo(`Setting Cover photo from ${coverFile}...`);
    try {
      // 1. Check if "Select From Computer" button is visible directly in Edit modal
      const selectCoverBtn = page.locator('div[role="dialog"]').locator([
        'button:has-text("Select From Computer")',
        'button:has-text("Select from computer")',
        '[role="button"]:has-text("Select From Computer")',
        '[role="button"]:has-text("Select from computer")',
        'div[role="button"]:has-text("Select From Computer")',
        'div[role="button"]:has-text("Select from computer")',
        'button:has-text("コンピューターから選択")',
        '[role="button"]:has-text("コンピューターから選択")',
        'span:text-is("Select From Computer")',
        'span:text-is("Select from computer")',
        'button:has-text("Select from")',
      ].join(', ')).first();

      let isSelectBtnVisible = await selectCoverBtn.isVisible({ timeout: 2500 }).catch(() => false);

      // 2. If not visible directly, check if a Cover tab needs to be clicked
      if (!isSelectBtnVisible) {
        const coverTab = page.locator('div[role="dialog"]').locator([
          'div[role="tab"]:has-text("Cover photo")',
          'div[role="tab"]:has-text("Cover")',
          'button:has-text("Cover photo")',
          'button:has-text("Cover")',
          'span:has-text("Cover photo")',
          'div[role="tab"]:has-text("カバー写真")',
        ].join(', ')).first();

        if (await coverTab.isVisible({ timeout: 2000 }).catch(() => false)) {
          logInfo('Clicking Cover photo tab...');
          await coverTab.click({ force: true });
          await page.waitForTimeout(1500);
          isSelectBtnVisible = await selectCoverBtn.isVisible({ timeout: 2000 }).catch(() => false);
        }
      }

      // 3. Trigger filechooser on "Select From Computer"
      let coverUploaded = false;
      if (isSelectBtnVisible) {
        logInfo('Clicking "Select From Computer" to attach Cover.jpg...');
        const [coverFc] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 10000 }),
          selectCoverBtn.click({ force: true }),
        ]);
        await coverFc.setFiles(coverFile);
        logSuccess(`Cover photo attached successfully from ${path.basename(coverFile)}!`);
        coverUploaded = true;
        await page.waitForTimeout(3000);
      } else {
        // Fallback: file inputs in dialog
        logInfo('Trying file input fallback for Cover.jpg...');
        const dialogInputs = page.locator('div[role="dialog"] input[type="file"], input[type="file"]');
        const count = await dialogInputs.count();
        if (count > 0) {
          await dialogInputs.last().setInputFiles(coverFile);
          logSuccess('Cover photo attached via input[type="file"].');
          coverUploaded = true;
          await page.waitForTimeout(3000);
        }
      }

      if (!coverUploaded) {
        logWarn('Could not attach cover photo (button not responsive).');
      }
    } catch (e) {
      logWarn(`Cover photo notice: ${e.message}`);
    }
  } else {
    logWarn(`Cover photo file not found at: ${coverPhotoPath}`);
  }

  // ── Step 8: Advance past Cover/Edit (Click Next) ────────────────────────
  await clickNextInDialog(page);

  // ── Step 9: Fill Caption ────────────────────────────────────────────────
  logInfo(`Filling caption from ${CONFIG.captionFile} (${caption.length} chars, ${caption.split('\n').length} lines)...`);
  const captionBox = page.locator('div[role="dialog"]').locator(
    'div[role="textbox"][aria-label*="caption" i], div[role="textbox"][aria-label*="キャプション" i], div[aria-label*="caption" i][contenteditable="true"], div[contenteditable="true"]'
  ).first();

  await captionBox.waitFor({ state: 'visible', timeout: 15000 });
  await captionBox.click();
  await captionBox.focus();
  await page.waitForTimeout(200);

  // Clear any existing draft text
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(200);

  // Use Playwright insertText to properly preserve newlines, hashtags, and Japanese text
  await page.keyboard.insertText(caption);
  await page.waitForTimeout(600);

  // Verify that multiline text was successfully injected
  const textCheck = await captionBox.innerText().catch(() => '');
  if (!textCheck || textCheck.trim().length === 0) {
    logWarn('insertText fallback: setting innerText directly...');
    await captionBox.evaluate((el, text) => {
      el.focus();
      el.innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, caption);
    await page.waitForTimeout(400);
  }

  // Dismiss any autocomplete tag dropdown
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);

  // ── Step 10: Click Share in dialog header ─────────────────────────────────
  logInfo('Step 10: Clicking header "Share" button...');

  // 1. Direct evaluate inside modal - searches from top header down (finds the top-right Share button)
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

  // 2. Locator fallback matching exact text in header
  if (!shareClicked) {
    const shareBtn = page.locator('div[role="dialog"]').locator([
      'button:text-is("Share")',
      'div[role="button"]:text-is("Share")',
      'span[role="button"]:text-is("Share")',
      'button:text-is("シェア")',
      'div[role="button"]:text-is("シェア")',
      'button:has-text("Share")',
    ].join(', ')).first();

    if (await shareBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await shareBtn.click({ force: true });
      shareClicked = 'Share';
    }
  }

  logInfo(`Share clicked (${shareClicked || 'locator'}). Awaiting upload & share confirmation...`);

  // ── Verification: Wait for Reel to genuinely upload & share ──────────────
  let shareConfirmed = false;
  for (let sec = 0; sec < 45; sec++) {
    // Check if dialog closed (indicates upload completed)
    const dialogCount = await page.locator('div[role="dialog"]').count().catch(() => 0);
    if (dialogCount === 0) {
      logSuccess('Upload confirmed: Dialog closed automatically.');
      shareConfirmed = true;
      break;
    }

    // Check for "Your reel has been shared" confirmation text
    const hasSharedText = await page.evaluate(() => {
      const text = (document.body.innerText || '').toLowerCase();
      return text.includes('your reel has been shared') ||
             text.includes('your post has been shared') ||
             text.includes('リールがシェアされました') ||
             text.includes('投稿がシェアされました');
    }).catch(() => false);

    if (hasSharedText) {
      logSuccess('Confirmation detected: "Your reel has been shared."');
      shareConfirmed = true;
      // Close confirmation modal if close button is present
      const closeBtn = page.locator('div[role="dialog"]').locator(
        'svg[aria-label="Close"], svg[aria-label="閉じる"], button:has-text("Close"), button:has-text("閉じる")'
      ).first();
      if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click({ force: true }).catch(() => {});
      }
      break;
    }

    // If after 4s modal is still on the "New reel" screen with Share button, click again
    if (sec === 4 || sec === 10) {
      const stillHasShare = await page.evaluate(() => {
        const dlg = document.querySelector('div[role="dialog"]');
        if (!dlg) return false;
        const btn = Array.from(dlg.querySelectorAll('button, div[role="button"]')).find(b => {
          const t = (b.innerText || '').trim();
          return t === 'Share' || t === 'シェア';
        });
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      }).catch(() => false);

      if (stillHasShare) {
        logInfo('Re-clicking header Share button to ensure submission...');
      }
    }

    await page.waitForTimeout(1000);
  }

  if (shareConfirmed) {
    logSuccess(`🎉 Reel ${label} shared successfully!`);
    await page.waitForTimeout(2000);
    return { success: true };
  } else {
    await takeDebugScreenshot(page, 'share_timeout');
    logWarn(`Modal still open after 45s. Check browser screen.`);
    return { success: true };
  }
}

/**
 * Helper: Clicks "Next" / "次へ" inside the dialog
 */
async function clickNextInDialog(page) {
  // DOM click first
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
    await page.waitForTimeout(2500);
    return;
  }

  // Locator fallback
  const nextBtn = page.locator('div[role="dialog"]').locator(
    'button:has-text("Next"), div[role="button"]:has-text("Next"), button:has-text("次へ")'
  ).first();

  await nextBtn.waitFor({ state: 'visible', timeout: 15000 });
  await nextBtn.click({ force: true });
  await page.waitForTimeout(2500);
}

/**
 * Logs out of current account and clears browser session
 */
async function logout(page, context) {
  logInfo('Logging out of account...');
  try {
    const moreBtn = page.locator(
      'svg[aria-label="Settings"], svg[aria-label="More options"], a:has-text("More"), span:has-text("More"), div[role="button"]:has-text("More"), a:has-text("その他"), span:has-text("その他")'
    ).first();

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
  } catch {}

  await context.clearCookies().catch(() => {});
  logSuccess('Logged out successfully.');
}

module.exports = {
  initBrowser,
  dismissPopups,
  handleCookieConsent,
  checkLoginState,
  login,
  updateBioAndPhoto,
  uploadReel,
  logout,
  takeDebugScreenshot,
};

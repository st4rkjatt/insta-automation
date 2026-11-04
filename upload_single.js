/**
 * Quick Test Tool: Upload 1 Reel to Instagram using the latest account
 * Run: node upload_single.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const CONFIG = {
  browserPath: 'C:\\Users\\yashs\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  headless: false,
  slowMo: 100,
  reelsFolder: 'C:\\Users\\yashs\\Downloads\\instaAuto\\instaAuto\\Reels',
  coverPhoto: 'C:\\Users\\yashs\\Downloads\\instaAuto\\instaAuto\\Reels\\Cover.jpg',
  reelNum: 1,
  caption: `TVアニメ『紫禁城・御猫房』10月10日放送開始! 宮廷に隠された秘密とは? みんなは観たい? コメントで教えてね!\n\n#紫禁御猫房 #新作アニメ #拡散希望 #猫`,
};

// Import upload function from signup.js or replicate cleanly
(async () => {
  console.log('🚀 Launching Brave to test Reel Upload...');
  const browser = await chromium.launch({
    executablePath: CONFIG.browserPath,
    headless: CONFIG.headless,
    slowMo: CONFIG.slowMo,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Read latest account from accounts.txt
  const accountsFile = path.join(__dirname, 'accounts.txt');
  const lines = fs.readFileSync(accountsFile, 'utf8').trim().split('\n').filter(l => l.includes('Username:'));
  const lastAccount = lines[lines.length - 1];
  const userMatch = lastAccount.match(/Username:\s*([^\s|]+)/);
  const passMatch = lastAccount.match(/Password:\s*([^\s|]+)/);

  const username = userMatch ? userMatch[1] : '';
  const password = passMatch ? passMatch[1] : '';

  console.log(`👤 Using account: ${username}`);

  console.log('📌 Navigating to Instagram login...');
  await page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Fill login
  try {
    const userField = page.locator('input[name="username"]').first();
    await userField.waitFor({ state: 'visible', timeout: 8000 });
    await userField.fill(username);

    const passField = page.locator('input[name="password"]').first();
    await passField.fill(password);

    const loginBtn = page.locator('button[type="submit"]').first();
    await loginBtn.click();
    console.log('🔑 Submitted credentials. Waiting for feed...');
    await page.waitForTimeout(5000);
  } catch (e) {
    console.log('Notice during login:', e.message);
  }

  // Dismiss any popups
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const skipWords = ['not now', '後で', '今はしない', 'save info', '情報を保存', 'skip', 'スキップ'];
      const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
      for (const b of btns) {
        const t = (b.innerText || '').trim().toLowerCase();
        if (skipWords.includes(t)) b.click();
      }
    }).catch(() => {});
    await page.waitForTimeout(1000);
  }

  // Ensure on home feed
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Now trigger Upload
  console.log('🎬 Starting Reel Upload Test...');
  const videoPath = path.join(CONFIG.reelsFolder, `R${CONFIG.reelNum}.mp4`);

  // Step 1: Click Create button
  console.log('1. Clicking Create (+)...');
  const createBtn = page.locator([
    'svg[aria-label="New post"]',
    'svg[aria-label="Create"]',
    'svg[aria-label="新規投稿"]',
    'svg[aria-label="作成"]',
    'span:text-is("Create")',
    'span:text-is("作成")',
  ].join(', ')).first();
  await createBtn.waitFor({ state: 'visible', timeout: 15000 });
  await createBtn.click({ force: true });
  await page.waitForTimeout(2000);

  // Step 2: Post dropdown
  const postItem = page.locator('[role="menuitem"]:has-text("Post"), a:has-text("Post"), span:text-is("Post")').first();
  if (await postItem.isVisible().catch(() => false)) {
    console.log('  Selecting "Post"...');
    await postItem.click();
    await page.waitForTimeout(2000);
  }

  // Step 3: Wait for dialog
  console.log('2. Waiting for upload dialog...');
  await page.waitForSelector('div[role="dialog"]', { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(1500);

  const checkVideoLoaded = async () => {
    return await page.evaluate(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return false;
      if (dialog.querySelector('video')) return true;
      const text = dialog.innerText || '';
      const promptGone = !text.includes('Drag photos') && !text.includes('Select from computer') && !text.includes('ドラッグ');
      const hasNextOrOk = Array.from(dialog.querySelectorAll('button, [role="button"]')).some(b => {
        const t = (b.innerText || '').trim().toLowerCase();
        return t === 'next' || t === '次へ' || t === 'ok' || t === '了解';
      });
      return (promptGone && hasNextOrOk) || text.includes('shared as reels') || text.includes('リールとしてシェア');
    }).catch(() => false);
  };

  let videoUploaded = false;

  // Try direct setInputFiles
  try {
    const fileInputs = page.locator('input[type="file"]');
    const inputCount = await fileInputs.count();
    console.log(`Found ${inputCount} input[type="file"] on page.`);
    if (inputCount > 0) {
      await fileInputs.last().setInputFiles(videoPath);
      await page.waitForTimeout(3000);
      if (await checkVideoLoaded()) {
        console.log('✅ Video loaded via direct input!');
        videoUploaded = true;
      }
    }
  } catch (err) {
    console.log('Direct input error:', err.message);
  }

  // Try filechooser click
  if (!videoUploaded) {
    console.log('Triggering filechooser via "Select from computer"...');
    const selectBtn = page.locator([
      'div[role="dialog"] button:has-text("Select from computer")',
      'div[role="dialog"] button:has-text("コンピューターから選択")',
      'button:has-text("Select from computer")',
      'button:has-text("Select")',
    ].join(', ')).first();

    try {
      await selectBtn.waitFor({ state: 'visible', timeout: 8000 });
      const [fc] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        selectBtn.click({ delay: 50 }),
      ]);
      await fc.setFiles(videoPath);
      await page.waitForTimeout(4000);
      if (await checkVideoLoaded()) {
        console.log('✅ Video loaded via filechooser!');
        videoUploaded = true;
      }
    } catch (err) {
      console.log('filechooser click error:', err.message);
    }
  }

  // Active wait
  for (let w = 0; w < 10; w++) {
    if (await checkVideoLoaded()) {
      videoUploaded = true;
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (videoUploaded) {
    console.log('🎉 SUCCESS! Video loaded into Instagram!');

    // Handle OK button if "shared as reels"
    const okBtn = page.locator('div[role="dialog"] button:has-text("OK"), div[role="dialog"] button:has-text("了解")').first();
    if (await okBtn.isVisible().catch(() => false)) {
      await okBtn.click();
      await page.waitForTimeout(1500);
    }

    console.log('Upload test passed! Keeping browser open for 20 seconds...');
    await page.waitForTimeout(20000);
  } else {
    console.log('❌ Failed to load video. Please check browser screen.');
    await page.waitForTimeout(30000);
  }

  await browser.close();
})();


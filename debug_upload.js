/**
 * DEBUG SCRIPT: Open Instagram, open Create dialog, dump DOM info about file inputs
 * Run: node debug_upload.js
 * This will tell us exactly what HTML elements are available for file upload
 */
const { chromium } = require('playwright');
const path = require('path');

const CONFIG = {
  browserPath: 'C:\\Users\\yashs\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  videoPath: 'C:\\Users\\yashs\\Downloads\\instaAuto\\instaAuto\\Reels\\R1.mp4',
};

(async () => {
  console.log('🚀 Launching browser...');
  const browser = await chromium.launch({
    executablePath: CONFIG.browserPath,
    headless: false,
    slowMo: 100,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  // Navigate to Instagram — you must already be logged in
  console.log('📌 Navigating to Instagram...');
  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  console.log('\n📋 STEP 1: Before clicking Create — scanning for file inputs on page:');
  const before = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="file"]');
    return Array.from(inputs).map((el, i) => ({
      index: i,
      accept: el.accept,
      id: el.id,
      name: el.name,
      className: el.className.substring(0, 80),
      hidden: el.hidden,
      display: getComputedStyle(el).display,
      visibility: getComputedStyle(el).visibility,
      opacity: getComputedStyle(el).opacity,
      parentTag: el.parentElement?.tagName,
      parentRole: el.parentElement?.getAttribute('role'),
    }));
  });
  console.log('File inputs BEFORE click:', JSON.stringify(before, null, 2));

  // Find and click Create button
  console.log('\n📋 STEP 2: Clicking Create/New Post button...');
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

  // Check for dropdown "Post" option
  const postItem = page.locator('[role="menuitem"]:has-text("Post"), a:has-text("Post"), span:text-is("Post")').first();
  if (await postItem.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('  → Clicking "Post" from dropdown...');
    await postItem.click();
    await page.waitForTimeout(2000);
  }

  // Wait for dialog
  console.log('\n📋 STEP 3: Waiting for dialog...');
  await page.waitForSelector('div[role="dialog"]', { state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1500);

  console.log('\n📋 STEP 4: After dialog opens — scanning ALL file inputs on page:');
  const afterDialog = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input[type="file"]');
    return Array.from(inputs).map((el, i) => ({
      index: i,
      accept: el.accept,
      id: el.id,
      name: el.name,
      className: el.className.substring(0, 80),
      hidden: el.hidden,
      display: getComputedStyle(el).display,
      visibility: getComputedStyle(el).visibility,
      opacity: getComputedStyle(el).opacity,
      outerHTML: el.outerHTML.substring(0, 200),
      parentTag: el.parentElement?.tagName,
      parentRole: el.parentElement?.getAttribute('role'),
      inDialog: !!el.closest('div[role="dialog"]'),
    }));
  });
  console.log('File inputs AFTER dialog opens:', JSON.stringify(afterDialog, null, 2));

  // Try clicking the "Select from computer" button to see if filechooser fires
  console.log('\n📋 STEP 5: Clicking "Select from computer" and checking filechooser...');
  const selectBtn = page.locator(
    'button:has-text("Select from computer"), [role="button"]:has-text("Select from computer"), ' +
    'button:has-text("コンピューターから選択"), button:has-text("Select")'
  ).first();

  const isVisible = await selectBtn.isVisible({ timeout: 5000 }).catch(() => false);
  console.log('  "Select from computer" button visible:', isVisible);

  if (isVisible) {
    // Register filechooser listener BEFORE click
    let fcFired = false;
    const fcPromise = page.waitForEvent('filechooser', { timeout: 5000 }).then(fc => {
      fcFired = true;
      console.log('  ✅ filechooser event FIRED!');
      return fc;
    }).catch(() => {
      console.log('  ❌ filechooser event did NOT fire (timeout)');
      return null;
    });

    await selectBtn.click({ force: true });
    const fc = await fcPromise;

    if (fc) {
      console.log('  → Setting files via file chooser...');
      await fc.setFiles(CONFIG.videoPath);
      console.log('  ✅ File set via file chooser!');
    }

    // After clicking, check for new file inputs
    await page.waitForTimeout(2000);
    const afterClick = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="file"]');
      return Array.from(inputs).map((el, i) => ({
        index: i,
        accept: el.accept,
        hidden: el.hidden,
        display: getComputedStyle(el).display,
        outerHTML: el.outerHTML.substring(0, 200),
        inDialog: !!el.closest('div[role="dialog"]'),
      }));
    });
    console.log('\nFile inputs AFTER "Select from computer" click:', JSON.stringify(afterClick, null, 2));

    // Try setInputFiles directly on them
    if (!fcFired && afterClick.length > 0) {
      console.log('\n📋 STEP 6: Trying setInputFiles directly on found inputs...');
      for (let i = 0; i < afterClick.length; i++) {
        try {
          await page.locator('input[type="file"]').nth(i).setInputFiles(CONFIG.videoPath);
          console.log(`  ✅ Input #${i}: setInputFiles succeeded!`);
        } catch (e) {
          console.log(`  ❌ Input #${i}: ${e.message}`);
        }
      }
    }
  }

  await page.waitForTimeout(5000);
  console.log('\n✅ Debug done. Check browser state and console output above.');
  console.log('Press Ctrl+C to close or wait 30s for auto-close.');
  await page.waitForTimeout(30000);
  await browser.close();
})();


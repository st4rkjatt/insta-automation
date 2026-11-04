/**
 * Quick Helper: Update Instagram Bio on an already logged-in account
 */

const { chromium } = require('playwright');

const BIO_TEXT = `TVアニメ『紫禁城・御猫房』10月10日放送開始! 宮廷に隠された秘密とは? みんなは観たい?
コメントで教えてね`;

(async () => {
  console.log('🚀 Connecting to browser / opening Edit Profile...');
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  console.log('[INFO] Navigating to https://www.instagram.com/accounts/edit/ ...');
  await page.goto('https://www.instagram.com/accounts/edit/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // 2. Dismiss "Turn on notifications" or "Save login info" if present
  const notNowBtn = page.locator('button:has-text("Not Now"), button:has-text("Not now")').first();
  if (await notNowBtn.isVisible({ timeout: 2500 }).catch(() => false)) {
    console.log('🔔 [POPUP] Clicking "Not Now"...');
    await notNowBtn.click();
    await page.waitForTimeout(1500);
  }

  // 2.5 Upload Profile Photo (C:\Users\yashs\Downloads\Profile Photo.jpg)
  const fs = require('fs');
  const path = require('path');
  const profilePicPath = 'C:\\Users\\yashs\\Downloads\\Profile Photo.jpg';
  if (fs.existsSync(profilePicPath)) {
    console.log('[INFO] Uploading Profile Photo...');
    try {
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(profilePicPath);
        await page.waitForTimeout(3000);
        console.log('✅ [SUCCESS] Profile photo uploaded via file input.');
      } else {
        const changeBtn = page.locator('text="Change profile photo", text="Change Profile Photo", button:has-text("Change photo")').first();
        if (await changeBtn.isVisible({timeout: 3000}).catch(()=>false)) {
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

  // 3. Locate Bio textarea
  console.log('[INFO] Locating Bio field...');
  const bioTextarea = page.locator('textarea#pepBio, textarea[id*="bio" i], textarea[aria-label*="Bio" i], textarea[placeholder*="Bio" i], textarea').first();
  await bioTextarea.waitFor({ state: 'visible', timeout: 20000 });
  await bioTextarea.scrollIntoViewIfNeeded().catch(() => {});

  // 3. Fill the Bio text (clear completely, insert cleanly, dispatch events for React)
  await bioTextarea.click();
  await bioTextarea.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);

  await bioTextarea.evaluate((el, text) => {
    el.focus();
    el.value = text;
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, BIO_TEXT);

  const checkVal = await bioTextarea.inputValue().catch(() => '');
  if (!checkVal || checkVal.trim() === '') {
    await bioTextarea.fill(BIO_TEXT);
  }
  console.log(`[INFO] Filled Bio text:\n${BIO_TEXT}\n`);

  // 4. Click Submit / Save button (English & Japanese support)
  console.log('[INFO] Saving profile changes...');
  const saveBtn = page.locator(
    'button[type="submit"], ' +
    'div[role="button"]:has-text("Submit"), button:has-text("Submit"), ' +
    'div[role="button"]:has-text("Save"), button:has-text("Save"), ' +
    'div[role="button"]:has-text("送信"), button:has-text("送信"), ' +
    'div[role="button"]:has-text("保存"), button:has-text("保存")'
  ).first();

  await saveBtn.scrollIntoViewIfNeeded().catch(() => {});
  if (await saveBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
    await saveBtn.click({ force: true });
    await page.waitForTimeout(3500);
    console.log('🎉 [SUCCESS] Instagram Bio updated and saved successfully!');
  }

  console.log('🌐 Browser kept open. Press Ctrl+C in terminal when done.');
  await new Promise(() => {});
})();

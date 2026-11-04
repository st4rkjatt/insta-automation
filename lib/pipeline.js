/**
 * Reel Upload Pipeline
 * Runs batch / sequential uploads across tabs with retry handling and memory management.
 */

const fs = require('fs');
const path = require('path');
const CONFIG = require('../config');
const { uploadReel, takeDebugScreenshot } = require('./instagram');
const { logInfo, logSuccess, logWarn, logError } = require('./ui');

/**
 * Runs 4 complete batches of R1-R5 (total 20 reels)
 * Round 1: R1 -> R2 -> R3 -> R4 -> R5
 * Round 2: R1 -> R2 -> R3 -> R4 -> R5
 * Round 3: R1 -> R2 -> R3 -> R4 -> R5
 * Round 4: R1 -> R2 -> R3 -> R4 -> R5
 *
 * @param {import('playwright').BrowserContext} context
 * @param {Object} options
 */
async function runFourBatchesUpload(context, options = {}) {
  const TOTAL_ROUNDS = 4;
  const REELS_PER_ROUND = 5;
  const TOTAL_REELS = TOTAL_ROUNDS * REELS_PER_ROUND; // 20
  const caption = options.caption || CONFIG.reelCaption;
  const coverPhotoPath = options.coverPhotoPath || CONFIG.coverPhoto;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  🎬 4-BATCH AUTOMATED REEL UPLOAD (20 REELS TOTAL)         ║');
  console.log('║  Sequence: (R1 → R5) x 4 Rounds                            ║');
  console.log('║  Caption:  Reels/CAPTION.txt                               ║');
  console.log('║  Cover:    Reels/Cover.jpg                                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let overallSuccess = 0;
  let overallFailed = 0;
  let overallCount = 0;

  for (let round = 1; round <= TOTAL_ROUNDS; round++) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`🔄 STARTING ROUND ${round} OF ${TOTAL_ROUNDS} (Uploading R1 to R5)`);
    console.log(`${'═'.repeat(60)}\n`);

    for (let reelNum = 1; reelNum <= REELS_PER_ROUND; reelNum++) {
      overallCount++;
      const filename = `${CONFIG.reelPrefix}${reelNum}${CONFIG.reelExtension}`;
      const videoPath = path.join(CONFIG.reelsFolder, filename);

      logInfo(`[ROUND ${round}/${TOTAL_ROUNDS} | REEL ${reelNum}/${REELS_PER_ROUND}] Preparing ${filename} (Total: ${overallCount}/${TOTAL_REELS})...`);

      if (!fs.existsSync(videoPath)) {
        logError(`Reel video not found: ${videoPath}. Skipping.`);
        overallFailed++;
        continue;
      }

      const page = await context.newPage();
      try {
        await page.goto(CONFIG.homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);

        let isUploaded = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (attempt > 1) {
            logInfo(`[ROUND ${round} | ${filename}] Retry attempt ${attempt}/2...`);
            await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            await page.waitForTimeout(3000);
          }

          const result = await uploadReel(page, {
            reelPath: videoPath,
            caption: caption,
            coverPhotoPath: coverPhotoPath,
            label: `${filename} (Round ${round})`,
          });

          if (result.success) {
            isUploaded = true;
            overallSuccess++;
            logSuccess(`[ROUND ${round} | ${filename}] Uploaded & shared successfully! (Progress: ${overallSuccess}/${TOTAL_REELS})`);
            break;
          } else {
            logWarn(`[ROUND ${round} | ${filename}] Attempt ${attempt} notice: ${result.reason}`);
            await takeDebugScreenshot(page, `round${round}_r${reelNum}_attempt${attempt}_fail`);
          }
        }

        if (!isUploaded) {
          overallFailed++;
          logError(`[ROUND ${round} | ${filename}] Could not upload after 2 attempts.`);
        }
      } catch (err) {
        overallFailed++;
        logError(`[ROUND ${round} | ${filename}] Error: ${err.message}`);
      } finally {
        // Close the tab after upload to keep browser lightweight and fast
        await page.close().catch(() => {});
      }

      // 3-second cooldown between reels
      if (overallCount < TOTAL_REELS) {
        logInfo('Cooling down 3 seconds before opening next reel...');
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (round < TOTAL_ROUNDS) {
      logInfo(`✅ Round ${round}/${TOTAL_ROUNDS} completed! Pausing 5 seconds before Round ${round + 1}...`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log(`║  🎉 4-BATCH FINISHED: ${overallSuccess}/${TOTAL_REELS} REELS UPLOADED!`);
  console.log(`║  ✅ Succeeded: ${overallSuccess} | ❌ Failed: ${overallFailed}`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  return { total: TOTAL_REELS, successful: overallSuccess, failed: overallFailed };
}

/**
 * Runs a custom batch upload of N reels in pipeline mode
 * @param {import('playwright').BrowserContext} context
 * @param {Object} options
 * @param {number} [options.totalCount=20]
 * @param {string} [options.caption]
 * @param {string} [options.coverPhotoPath]
 */
async function runBatchReelsPipeline(context, options = {}) {
  const totalCount = options.totalCount || CONFIG.totalBatchReels;
  const numUnique = CONFIG.numUniqueReels;
  const caption = options.caption || CONFIG.reelCaption;
  const coverPhotoPath = options.coverPhotoPath || CONFIG.coverPhoto;

  const sequence = Array.from({ length: totalCount }, (_, i) => (i % numUnique) + 1);
  let successful = 0;
  let failed = 0;

  console.log('\n======================================================');
  console.log(`🎬 STARTING CUSTOM BATCH PIPELINE (${totalCount} REELS)`);
  console.log('======================================================\n');

  for (let i = 0; i < totalCount; i++) {
    const reelNum = sequence[i];
    const itemIndex = i + 1;
    const filename = `${CONFIG.reelPrefix}${reelNum}${CONFIG.reelExtension}`;
    const videoPath = path.join(CONFIG.reelsFolder, filename);

    if (!fs.existsSync(videoPath)) {
      logError(`Reel file not found: ${videoPath}. Skipping.`);
      failed++;
      continue;
    }

    logInfo(`[REEL ${itemIndex}/${totalCount}] Preparing upload for ${filename}...`);
    const page = await context.newPage();

    try {
      await page.goto(CONFIG.homeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);

      let isUploaded = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        if (attempt > 1) {
          logInfo(`[REEL ${itemIndex}] Attempt ${attempt}/2...`);
          await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
          await page.waitForTimeout(3000);
        }

        const result = await uploadReel(page, {
          reelPath: videoPath,
          caption: caption,
          coverPhotoPath: coverPhotoPath,
          label: `${filename} (#${itemIndex})`,
        });

        if (result.success) {
          isUploaded = true;
          successful++;
          logSuccess(`[REEL ${itemIndex}] ${filename} uploaded and shared!`);
          break;
        } else {
          logWarn(`[REEL ${itemIndex}] Attempt ${attempt} notice: ${result.reason}`);
          await takeDebugScreenshot(page, `batch_${itemIndex}_attempt${attempt}_fail`);
        }
      }

      if (!isUploaded) {
        failed++;
        logError(`[REEL ${itemIndex}] Could not upload ${filename} after 2 attempts.`);
      }
    } catch (err) {
      failed++;
      logError(`[REEL ${itemIndex}] Error: ${err.message}`);
    } finally {
      await page.close().catch(() => {});
    }

    if (i < totalCount - 1) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  console.log('\n======================================================');
  console.log(`📊 BATCH COMPLETE — ✅ ${successful} Succeeded | ❌ ${failed} Failed`);
  console.log('======================================================\n');

  return { total: totalCount, successful, failed };
}

module.exports = {
  runFourBatchesUpload,
  runBatchReelsPipeline,
};

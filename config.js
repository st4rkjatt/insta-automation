/**
 * Configuration & Environment Resolver
 * Automatically adapts between macOS and Windows environments.
 */

const fs = require('fs');
const path = require('path');

/**
 * Resolves the browser executable path based on OS and availability.
 */
function resolveBrowserExecutable() {
  if (process.env.BROWSER_PATH && fs.existsSync(process.env.BROWSER_PATH)) {
    return process.env.BROWSER_PATH;
  }

  if (process.platform === 'darwin') {
    // macOS typical paths
    const candidates = [
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } else if (process.platform === 'win32') {
    // Windows typical paths
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

    const candidates = [
      path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }

  // Fallback: let Playwright use its bundled Chromium if available
  return undefined;
}

const ROOT_DIR = __dirname;
const REELS_DIR = path.join(ROOT_DIR, 'Reels');
const CAPTION_FILE = path.join(REELS_DIR, 'CAPTION.txt');

/**
 * Loads the reel caption directly from Reels/CAPTION.txt
 */
function loadReelCaption() {
  if (fs.existsSync(CAPTION_FILE)) {
    try {
      const content = fs.readFileSync(CAPTION_FILE, 'utf8').trim();
      if (content.length > 0) return content;
    } catch {}
  }
  return `! TVアニメ『紫禁・御猫房』10月10日放送開始宮廷に隠された秘密とは? みんなは観たい? コメントで教えてね!\n\n#紫禁御猫房 #新作アニメ\n\n#拡散希望 #猫\n\n《紫禁・御猫房》\n\n#紫禁御猫房\n\n新作アニメ\n\n拡散希望\n\n猫`;
}

const CONFIG = {
  // URLs
  homeUrl: 'https://www.instagram.com/',
  loginUrl: 'https://www.instagram.com/accounts/login/',
  signupUrl: 'https://www.instagram.com/accounts/emailsignup/',
  editProfileUrl: 'https://www.instagram.com/accounts/edit/',

  // Browser launch settings
  browserPath: resolveBrowserExecutable(),
  headless: false,
  slowMo: 80,
  viewport: { width: 1280, height: 850 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',

  // Workspace file paths
  rootDir: ROOT_DIR,
  accountsFile: path.join(ROOT_DIR, 'accounts.txt'),
  logFile: path.join(ROOT_DIR, 'automation.log'),
  debugDir: path.join(ROOT_DIR, 'debug_screenshots'),
  reelsFolder: REELS_DIR,
  coverPhoto: path.join(REELS_DIR, 'Cover.jpg'),
  captionFile: CAPTION_FILE,
  profilePhoto: path.join(ROOT_DIR, 'profile.jpg'),

  // Reel file conventions
  reelPrefix: 'R',
  reelExtension: '.mp4',
  numUniqueReels: 5,
  totalBatchReels: 20,

  // Default content
  bioText: `TVアニメ『紫禁城・御猫房』10月10日放送開始! 宮廷に隠された秘密とは? みんなは観たい?\nコメントで教えてね`,

  // Dynamic getter: always reads freshly from /Users/ajaykumar/Desktop/Insta Automation/Reels/CAPTION.txt
  get reelCaption() {
    return loadReelCaption();
  },
  loadReelCaption,
};

module.exports = CONFIG;


const puppeteer = require("puppeteer");
const inlineCss = require("inline-css");

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

function resolveChromePath() {
  const fs = require("fs");
  const envPath = process.env.CHROME_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function generatePdf(file, options) {
  const args = options.args || ["--no-sandbox", "--disable-setuid-sandbox"];
  const launchOptions = { args, headless: "new" };
  const executablePath = resolveChromePath();
  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    if (file.content) {
      const data = await inlineCss(file.content, { url: "/" });
      await page.setContent(data, { waitUntil: "networkidle0" });
    } else {
      await page.goto(file.url, { waitUntil: ["load", "networkidle0"] });
    }
    const pdfOptions = Object.assign({ format: "A4" }, options);
    delete pdfOptions.args;
    const buffer = await page.pdf(pdfOptions);
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } finally {
    await browser.close();
  }
}

module.exports = { generatePdf };

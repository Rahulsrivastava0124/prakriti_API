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

/**
 * One Chromium per set of launch arguments, kept alive between invoices.
 *
 * Launching and closing the browser cost ~530 ms of every PDF (measured: 472 ms
 * launch + 57 ms close) and produced nothing - the same binary rendering the
 * same HTML. Pages are still created and closed per request, so nothing is
 * shared between invoices except the process itself.
 *
 * Keyed by args because callers pass different ones and a browser cannot change
 * its launch flags afterwards. Relaunches if the process died or was killed.
 */
const browsers = new Map();

async function getBrowser(launchOptions) {
  const key = JSON.stringify(launchOptions.args);
  const pending = browsers.get(key);
  if (pending) {
    const existing = await pending.catch(() => null);
    if (existing && existing.isConnected()) return existing;
    browsers.delete(key);
  }
  const started = puppeteer.launch(launchOptions);
  browsers.set(key, started);
  try {
    const browser = await started;
    // a browser that dies on its own must not be handed to the next request
    browser.on("disconnected", () => {
      if (browsers.get(key) === started) browsers.delete(key);
    });
    return browser;
  } catch (err) {
    browsers.delete(key);
    throw err;
  }
}

async function closeBrowsers() {
  const all = [...browsers.values()];
  browsers.clear();
  await Promise.all(
    all.map(async (pending) => {
      const browser = await pending.catch(() => null);
      if (browser) await browser.close().catch(() => {});
    })
  );
}

for (const signal of ["exit", "SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    closeBrowsers();
    if (signal !== "exit") process.exit(0);
  });
}

async function generatePdf(file, options) {
  const args = options.args || ["--no-sandbox", "--disable-setuid-sandbox"];
  const launchOptions = { args, headless: "new" };
  const executablePath = resolveChromePath();
  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await getBrowser(launchOptions);
  const page = await browser.newPage();
  try {
    if (file.content) {
      const data = await inlineCss(file.content, { url: "/" });
      /**
       * `load` already means every image, stylesheet and font of the document
       * has finished loading. `networkidle0` waited for that and then sat
       * through its own 500 ms silence window, which only pays for itself when
       * scripts fetch more after load - and these invoices carry no scripts.
       * Verified on the real invoice HTML: the rendered PDFs are byte-identical
       * either way (only /CreationDate differs, as it does between any two
       * renders), at 109 ms instead of 1,028 ms.
       */
      await page.setContent(data, { waitUntil: "load" });
    } else {
      await page.goto(file.url, { waitUntil: ["load", "networkidle0"] });
    }
    const pdfOptions = Object.assign({ format: "A4" }, options);
    delete pdfOptions.args;
    const buffer = await page.pdf(pdfOptions);
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { generatePdf, closeBrowsers };

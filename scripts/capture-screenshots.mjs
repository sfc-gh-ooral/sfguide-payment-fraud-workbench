// Captures the landing-page screenshots in Sample mode (dark theme) from a running app.
// Usage: npm run dev, then node scripts/capture-screenshots.mjs [http://localhost:3000]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = 'docs/images';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(BASE + '/');
await p.evaluate(() => { localStorage.setItem('pfw-mode', 'sample'); localStorage.setItem('pfw-theme', 'dark'); });
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.jpg`, type: 'jpeg', quality: 86 });
const go = async (path) => { await p.goto(BASE + path); await p.waitForTimeout(2500); };
const scrollTo = async (text) => { await p.getByText(text, { exact: true }).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120)); await p.waitForTimeout(700); };

await go('/'); await shot('01-fraud-overview');
await go('/alerts/'); await p.click('tbody tr'); await p.waitForTimeout(600); await shot('02-alert-queue');
await go('/case/?id=AL9200001'); await p.click('text=Summarize case'); await p.waitForTimeout(3000); await shot('03a-case-reasoning');
await p.waitForTimeout(8000); await shot('03-case-takeover');
await go('/case/?id=AL9400084'); await scrollTo('Link analysis'); await shot('04-case-mule-ring');
await go('/case/?id=AL9500002'); await scrollTo('Geography'); await shot('05-case-impossible-travel');
await go('/model/'); await p.fill('#thr', '0.8'); await p.waitForTimeout(400); await shot('06-model-threshold');
await go('/ask/'); await p.click('text=Which merchants had card-testing'); await p.waitForTimeout(16000); await shot('07-ask-agent');
const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const q = await m.newPage(); await q.goto(BASE + '/'); await q.evaluate(() => { localStorage.setItem('pfw-mode', 'sample'); localStorage.setItem('pfw-theme', 'dark'); });
await q.goto(BASE + '/case/?id=AL9200001'); await q.waitForTimeout(2500); await q.screenshot({ path: `${OUT}/08-phone-case.jpg`, type: 'jpeg', quality: 80 });
await b.close();
console.log('screenshots written to', OUT);

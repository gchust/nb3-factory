// Real Chrome test, not an OCR or document.fonts.check approximation.
// node browser-fonts-smoke.mjs <workspace with @playwright/test> <screenshot>
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const requireFromWorkspace = createRequire(path.resolve(process.argv[2], 'package.json'));
const { chromium } = requireFromWorkspace('@playwright/test');
const browser = await chromium.launch({
  ...(process.env.AGENT_BROWSER_EXECUTABLE_PATH
    ? { executablePath: process.env.AGENT_BROWSER_EXECUTABLE_PATH }
    : { channel: 'chrome' }),
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 500 } });
  await page.setContent('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{font:24px sans-serif;padding:32px}h1{font-size:32px}</style><h1>中文字体回归测试</h1><p id="chinese">会议室预约、行政部、领用归还、操作成功</p><p>English 123 · 中文標點，。</p></html>');
  await page.evaluate(() => globalThis.document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#chinese' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  assert.ok(fonts.some(font => /Noto Sans CJK/.test(font.familyName) && font.glyphCount > 0), 'Chinese glyphs must actually render using a CJK font');
  await page.screenshot({ path: process.argv[3] });
  console.log('Chinese glyphs rendered with:', fonts);
} finally {
  await browser.close();
}

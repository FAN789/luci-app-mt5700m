// Run test-ux.js with MT5700M_DOM_DIR first to capture mocked view output.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const fixtures = process.env.MT5700M_DOM_DIR;
const themeDirectory = process.env.ARGON_CSS_DIR;
assert(fixtures && themeDirectory, 'Set MT5700M_DOM_DIR and ARGON_CSS_DIR');
const resources = path.resolve(__dirname, '../luci-app-mt5700m/htdocs/luci-static/resources');
function themeFile(name, expected) {
    const content = fs.readFileSync(path.join(themeDirectory, name), 'utf8');
    assert.equal(crypto.createHash('sha256').update(content).digest('hex'), expected);
    return content;
}
const theme = themeFile('cascade.css', 'd43f3f2c69221677a9a1dbbebca85d9630b830fc967da4fc0d4a5581e4616bbb');
const dark = themeFile('dark.css', 'f27c8eff398b68a60b5048cb619fecf3621a48c9081e024363d4d5d1ce991a3c');
const names = ['status', 'connection', 'connection-expanded', 'network', 'network-expanded',
    'sms', 'sms-settings', 'system', 'system-expanded', 'advanced', 'advanced-expanded'];

(async () => {
    const browser = await chromium.launch({headless: true,
        ...(process.env.PLAYWRIGHT_CHANNEL ? {channel: process.env.PLAYWRIGHT_CHANNEL} : {})});
    let checked = 0;
    try {
        const page = await browser.newPage();
        await page.route('**/*', route => {
            if (route.request().url().includes('mt5700m/ux.css')) {
                return route.fulfill({contentType: 'text/css',
                    body: fs.readFileSync(path.join(resources, 'mt5700m/ux.css'), 'utf8')});
            }
            return route.abort();
        });
        for (const mode of ['light', 'dark']) {
            for (const width of [1440, 820, 390]) {
                await page.setViewportSize({width, height: 1100});
                for (const name of names) {
                    const fixture = fs.readFileSync(path.join(fixtures, name + '.html'), 'utf8');
                    await page.setContent('<base href="http://fixture.invalid/"><style>' + theme +
                        (mode === 'dark' ? dark : '') + 'body{padding:16px;box-sizing:border-box}</style>' +
                        '<div id="outside">Other LuCI page</div>' + fixture);
                    await page.waitForFunction(() => [...document.querySelectorAll('link')].every(link => !!link.sheet));
                    const result = await page.evaluate(() => {
                        const failures = [];
                        let textElements = 0;
                        for (const element of document.querySelectorAll('.mt-ui-page *')) {
                            if (['STYLE', 'LINK', 'SCRIPT'].includes(element.tagName) || !element.getClientRects().length) continue;
                            if (![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
                            const style = getComputedStyle(element);
                            if (style.visibility === 'hidden') continue;
                            textElements++;
                            const minimum = element.closest('pre,code') ? 13 : element.tagName === 'H3' ? 17 : 14;
                            if (parseFloat(style.fontSize) < minimum) {
                                failures.push({tag: element.tagName, class: element.className, size: style.fontSize});
                            }
                        }
                        return {failures, textElements, overflow: document.documentElement.scrollWidth > innerWidth,
                            roots: document.querySelectorAll('.mt-ui-page').length};
                    });
                    const context = `${name}, ${mode}, ${width}px`;
                    assert(result.roots && result.textElements, 'No actual plugin content: ' + context);
                    assert.deepEqual(result.failures, [], context);
                    assert(!result.overflow, 'Horizontal overflow: ' + context);
                    if (process.env.MT5700M_SCREENSHOTS) {
                        fs.mkdirSync(process.env.MT5700M_SCREENSHOTS, {recursive: true});
                        await page.screenshot({path: path.join(process.env.MT5700M_SCREENSHOTS, `${name}-${mode}-${width}.png`), fullPage: true});
                    }
                    checked++;
                }
            }
        }
        console.log(`PASS: ${checked} rendered view/theme/viewport combinations, actual text sizes, headings and overflow`);
    } finally {
        await browser.close();
    }
})().catch(error => {console.error(error); process.exitCode = 1;});

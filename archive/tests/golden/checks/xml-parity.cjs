// Re-checks tests/fixtures/flight-data/xml-cases.js against the browser's own
// DOMParser (the parser V6 used), and src/flight-data/xml.js against the table.
// xml.js must agree with the browser except for DOCTYPEs, which it refuses on
// purpose (specs/SPEC-flight-data.md, Security).
//
// Usage: NODE_PATH=$(npm root -g) node tests/golden/checks/xml-parity.cjs
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '../../..');
  const { XML_CASES } = await import(path.join(root, 'tests/fixtures/flight-data/xml-cases.js'));
  const { parseXml } = await import(path.join(root, 'src/flight-data/xml.js'));
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const dom = await page.evaluate(cs => cs.map(c => !new DOMParser().parseFromString(c, 'application/xml').querySelector('parsererror')),
    XML_CASES.map(([text]) => text));
  await browser.close();
  let bad = 0;
  XML_CASES.forEach(([text, recorded], i) => {
    if (dom[i] !== recorded) { bad++; console.log('TABLE OUT OF DATE', JSON.stringify(text), 'browser now says', dom[i]); }
    let ours = true;
    try { parseXml(text); } catch { ours = false; }
    const expected = text.includes('<!DOCTYPE') ? false : dom[i];
    if (ours !== expected) { bad++; console.log('MISMATCH', JSON.stringify(text), 'expected', expected, 'xml.js', ours); }
  });
  console.log(`${XML_CASES.length} cases, ${bad} problems`);
  process.exitCode = bad ? 1 : 0;
})();

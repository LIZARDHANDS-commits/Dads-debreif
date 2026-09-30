// Checks that src/flight-data/xml.js accepts and refuses the same small documents
// as the browser's DOMParser (the parser V6 used), except a DOCTYPE, which it
// refuses on purpose (specs/SPEC-flight-data.md, Security).
//
// Usage: NODE_PATH=$(npm root -g) node tests/golden/checks/xml-parity.cjs
const path = require('path');
const { chromium } = require('playwright');
const cases = [
 '<a/>', '<a></a>', ' <a/> ', '<a/><b/>', 'x<a/>', '<a/>x', '<?xml version="1.0"?><a/>', ' <?xml version="1.0"?><a/>', '<a/><?xml version="1.0"?>',
 '<?pi x?><a/>', '<?XML x?><a/>', '<!-- c --><a/>', '<!-- a--b --><a/>', '<!-- a- --><a/>', '<a><!-- x --></a>',
 '<a b="1"/>', "<a b='1'/>", '<a b=1/>', '<a b="1"c="2"/>', '<a b="1" b="2"/>', '<a b="<"/>', '<a b=">"/>', '<a b="&amp;"/>', '<a b="&x;"/>',
 '<a>&amp;&lt;&gt;&quot;&apos;</a>', '<a>&#65;&#x41;</a>', '<a>&#0;</a>', '<a>&#xD800;</a>', '<a>& </a>', '<a>&nbsp;</a>', '<a>&#x110000;</a>',
 '<a><![CDATA[<x>]]></a>', '<![CDATA[x]]><a/>', '<a>]]></a>', '<a>\u0001</a>', '<a>\uFFFE</a>',
 '<p:a/>', '<p:a xmlns:p="u"/>', '<a xmlns:p="u"><p:b/></a>', '<a><p:b xmlns:p="u"/><p:c/></a>', '<a p:x="1"/>', '<a xmlns:p="u" p:x="1"/>', '<a:b:c xmlns:a="u"/>', '<a xmlns:p=""/>', '<:a/>', '<a:/>',
 '<1a/>', '<a-b.c_d/>', '<é/>', '<a></b>', '<a><b></a></b>', '<a>', '</a>', '<a/></a>', '<a ></a >', '< a/>', '<a/ >', '<!DOCTYPE a><a/>', '<!ELEMENT a><a/>',
 '\uFEFF<a/>', '<a>\r\n</a>', '<a xml:lang="en"/>', '<a xmlns="u"/>', '<a b="1"\n c="2"/>', '', '   ',
];
(async () => {
  const { parseXml } = await import(path.resolve(__dirname, '../../../src/flight-data/xml.js'));
  const b = await chromium.launch(); const p = await b.newPage();
  const dom = await p.evaluate(cs => cs.map(c => { const d = new DOMParser().parseFromString(c, 'application/xml'); return !d.querySelector('parsererror'); }), cases);
  let bad = 0;
  cases.forEach((c, i) => { let ok = true; try { parseXml(c); } catch { ok = false; } const expected = c.includes('<!DOCTYPE') ? false : dom[i];
    if (ok !== expected) { bad++; console.log('MISMATCH', JSON.stringify(c), 'expected', expected, 'ours', ok); } });
  console.log(cases.length, 'cases,', bad, 'mismatches'); await b.close(); process.exitCode = bad ? 1 : 0;
})();

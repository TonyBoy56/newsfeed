import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseXmlFeed, parseKev, htmlToText, safeUrl, extractCves } from '../scripts/lib/parse.mjs';

const settings = { maxItemsPerFeed: 25, summaryLength: 320 };
const feed = { name: 'Test Feed', url: 'https://example.com/feed', site: 'https://example.com' };

test('parses RSS 2.0 with CDATA, entities and CVEs', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
    <title>T</title>
    <item>
      <title>Patch now: CVE-2026-12345 &amp; friends</title>
      <link>https://example.com/a</link>
      <description><![CDATA[<p>A <b>critical</b> zero-day in the wild. See cve-2026-9999.</p>]]></description>
      <pubDate>Tue, 22 Sep 2026 10:00:00 GMT</pubDate>
      <dc:creator>Jane</dc:creator>
    </item>
  </channel></rss>`;
  const [a] = parseXmlFeed(xml, feed, 'news', settings);
  assert.equal(a.title, 'Patch now: CVE-2026-12345 & friends');
  assert.equal(a.url, 'https://example.com/a');
  assert.equal(a.summary, 'A critical zero-day in the wild. See cve-2026-9999.');
  assert.deepEqual(a.cves, ['CVE-2026-12345', 'CVE-2026-9999']);
  assert.ok(a.concepts.includes('zero-day'));
  assert.ok(a.concepts.includes('patching'));
  assert.equal(a.author, 'Jane');
  assert.equal(a.published, '2026-09-22T10:00:00.000Z');
});

test('parses Atom with multiple links', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>
    <entry>
      <title type="html">Ransomware &lt;b&gt;gang&lt;/b&gt; hits cloud</title>
      <link rel="replies" href="https://example.com/comments"/>
      <link rel="alternate" href="/post/1"/>
      <published>2026-09-21T14:37:45Z</published>
      <summary>Summary text</summary>
      <author><name>Bruce</name></author>
    </entry>
  </feed>`;
  const [a] = parseXmlFeed(xml, feed, 'news', settings);
  assert.equal(a.title, 'Ransomware gang hits cloud');
  assert.equal(a.url, 'https://example.com/post/1');
  assert.equal(a.author, 'Bruce');
  assert.ok(a.concepts.includes('ransomware'));
  assert.ok(a.concepts.includes('cloud'));
});

test('drops javascript: links and strips scripts (XSS attempts)', () => {
  const xml = `<rss><channel>
    <item><title>Evil</title><link>javascript:alert(1)</link><description>x</description></item>
    <item><title><![CDATA[<img src=x onerror=alert(1)>Hi]]></title><link>https://ok.example/</link>
      <description><![CDATA[<script>alert(1)</script>Safe text]]></description></item>
  </channel></rss>`;
  const items = parseXmlFeed(xml, feed, 'news', settings);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Hi');
  assert.equal(items[0].summary, 'Safe text');
});

test('refuses billion-laughs entity expansion', () => {
  const lol = Array.from({ length: 10 }, (_, i) =>
    i === 0 ? '<!ENTITY lol0 "lol">' : `<!ENTITY lol${i} "${`&lol${i - 1};`.repeat(10)}">`
  ).join('');
  const xml = `<?xml version="1.0"?><!DOCTYPE rss [${lol}]><rss><channel><item><title>&lol9;</title><link>https://x.example/</link></item></channel></rss>`;
  let result;
  try {
    result = parseXmlFeed(xml, feed, 'news', settings);
  } catch {
    return; // throwing is an acceptable outcome
  }
  // If it didn't throw, it must not have expanded to a huge string.
  assert.ok(result.every((a) => a.title.length < 1000));
});

test('parses CISA KEV JSON', () => {
  const json = {
    vulnerabilities: [
      { cveID: 'CVE-2026-0001', vendorProject: 'Acme', product: 'Widget', vulnerabilityName: 'Acme Widget RCE',
        dateAdded: '2026-09-20', shortDescription: 'Remote code execution.', requiredAction: 'Apply updates.',
        dueDate: '2026-10-11', knownRansomwareCampaignUse: 'Known' },
      { cveID: 'not-a-cve', vendorProject: 'x' },
    ],
  };
  const items = parseKev(json, { ...feed, name: 'KEV' }, 'vulns', settings);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://nvd.nist.gov/vuln/detail/CVE-2026-0001');
  assert.ok(items[0].concepts.includes('ransomware'));
  assert.match(items[0].summary, /Required action/);
});

test('helpers', () => {
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('HTTPS://Example.com/x'), 'https://example.com/x');
  assert.equal(htmlToText('a&nbsp;&#8217;b&#x27;'), 'a ’b\'');
  assert.deepEqual(extractCves('no cves'), []);
});

test('music and games sections use their own concept vocabulary', () => {
  const xml = `<rss><channel><item><title>Patching a modular synth: sidechain compression tricks in Ableton</title>
    <link>https://music.example/a</link><description>Free wavetable pack included.</description></item></channel></rss>`;
  const [m] = parseXmlFeed(xml, feed, 'music-production', { ...settings, section: 'music' });
  assert.equal(m.section, 'music');
  assert.ok(m.concepts.includes('synthesis'));
  assert.ok(m.concepts.includes('mixing'));
  assert.ok(m.concepts.includes('DAW'));
  assert.ok(m.concepts.includes('free stuff'));
  assert.ok(!m.concepts.includes('patching'), 'security vocabulary must not leak into music');

  const [g] = parseXmlFeed(xml.replace('Patching a modular synth: sidechain compression tricks in Ableton', 'Reverse engineering a kernel anti-cheat driver'),
    feed, 'games-security', { ...settings, section: 'games' });
  assert.deepEqual(g.concepts.sort(), ['anti-cheat', 'kernel & low-level', 'reverse engineering']);
});

test('reads YouTube channel feed descriptions', () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
    <entry><title>Why this chord works</title><link rel="alternate" href="https://www.youtube.com/watch?v=abc"/>
      <published>2026-09-20T10:00:00+00:00</published>
      <media:group><media:title>Why this chord works</media:title><media:description>A look at borrowed chords.</media:description></media:group>
    </entry></feed>`;
  const [a] = parseXmlFeed(xml, feed, 'music-theory', { ...settings, section: 'music' });
  assert.equal(a.url, 'https://www.youtube.com/watch?v=abc');
  assert.equal(a.summary, 'A look at borrowed chords.');
  assert.ok(a.concepts.includes('theory'));
});

// Turns raw RSS 2.0 / Atom / RDF XML (and the CISA KEV JSON catalog) into
// plain, safe article objects. Everything that comes out of here is plain
// text plus http(s) links only. The browser never renders feed HTML.

import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'node:crypto';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: false,
  // Entity expansion is where "billion laughs" style XML attacks live.
  // Real feeds never need custom DTD entities, so the limits are tight.
  processEntities: {
    enabled: true,
    maxEntityCount: 20,
    maxEntitySize: 1000,
    maxTotalExpansions: 50_000,
    maxExpandedLength: 500_000,
  },
  htmlEntities: false,
  trimValues: true,
  parseTagValue: false,
});

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', trade: '™', copy: '©', reg: '®',
};

export function decodeEntities(str) {
  return str.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

// Converts an HTML fragment to plain text. We never need the markup: the
// reader shows a short summary and links out to the original article.
export function htmlToText(html) {
  if (!html) return '';
  return decodeEntities(
    String(html)
      .replace(/<(script|style|iframe|noscript)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  )
    .replace(/<[^>]*>/g, ' ') // tags that were entity-encoded in the source
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

// Only http(s) URLs survive. This blocks javascript:, data: and friends,
// which is the classic way a malicious feed turns a link into XSS.
export function safeUrl(raw, base) {
  if (!raw) return null;
  try {
    const url = new URL(String(raw).trim(), base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function text(node) {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') return text(node['#text'] ?? '');
  return '';
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function parseDate(value) {
  const t = Date.parse(text(value));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function atomLink(links) {
  const list = asArray(links);
  const alt = list.find((l) => typeof l === 'object' && (!l['@_rel'] || l['@_rel'] === 'alternate'));
  const chosen = alt ?? list[0];
  return typeof chosen === 'object' ? chosen['@_href'] : chosen;
}

const CVE_RE = /\bCVE-\d{4}-\d{4,7}\b/gi;

export function extractCves(...parts) {
  const found = new Set();
  for (const p of parts) for (const m of String(p).matchAll(CVE_RE)) found.add(m[0].toUpperCase());
  return [...found].slice(0, 10);
}

// Lightweight concept tagging so you can browse by idea, not just by source.
export const CONCEPTS = {
  'ransomware': /\bransomware\b/i,
  'phishing': /\bphish(ing|ed)?\b|\bdevice[- ]code\b/i,
  'zero-day': /\bzero[- ]day\b|\b0[- ]?day\b/i,
  'supply chain': /\bsupply[- ]chain\b|\bnpm\b|\bpypi\b|\bdependenc(y|ies)\b/i,
  'identity': /\bidentity\b|\biam\b|\bmfa\b|\b2fa\b|\bsso\b|\boauth\b|\bcredential/i,
  'cloud': /\bcloud\b|\baws\b|\bazure\b|\bgcp\b|\bkubernetes\b|\bs3\b/i,
  'AI security': /\b(ai|llm|genai|gpt|prompt injection|agentic|ai agents?)\b/i,
  'web security': /\bxss\b|\bcsrf\b|\bssrf\b|\bsql injection\b|\bsqli\b|\bweb app/i,
  'malware': /\bmalware\b|\btrojan\b|\bbotnet\b|\binfostealer\b|\bstealer\b|\bbackdoor\b|\bc2\b/i,
  'data breach': /\bbreach(es|ed)?\b|\bdata leak\b|\bexposed data\b/i,
  'patching': /\bpatch(es|ed|ing)?\b|\bpatch tuesday\b|\bupdate now\b/i,
  'automation': /\bautomat(e|ed|ion)\b|\bsoar\b|\borchestration\b|\bplaybook/i,
  'privacy': /\bprivacy\b|\bgdpr\b|\bsurveillance\b|\bdata broker/i,
  'nation-state': /\bnation[- ]state\b|\bapt\d*\b|\bstate[- ]sponsored\b/i,
};

export function extractConcepts(...parts) {
  const hay = parts.join(' ');
  return Object.entries(CONCEPTS).filter(([, re]) => re.test(hay)).map(([k]) => k);
}

export function articleId(link, title) {
  return createHash('sha256').update(link || title).digest('hex').slice(0, 16);
}

function buildArticle({ title, link, summary, published, author }, feed, category, settings) {
  const cleanTitle = truncate(htmlToText(title) || '(untitled)', 300);
  const url = safeUrl(link, feed.site || feed.url);
  if (!url) return null;
  const cleanSummary = truncate(htmlToText(summary), settings.summaryLength);
  return {
    id: articleId(url, cleanTitle),
    title: cleanTitle,
    url,
    summary: cleanSummary,
    source: feed.name,
    category,
    author: author ? truncate(htmlToText(author), 120) : null,
    published: published || null,
    cves: extractCves(cleanTitle, cleanSummary),
    concepts: extractConcepts(cleanTitle, cleanSummary),
  };
}

export function parseXmlFeed(xml, feed, category, settings) {
  const doc = parser.parse(xml);
  const raw = [];

  if (doc.rss?.channel) {
    for (const item of asArray(doc.rss.channel.item)) {
      raw.push({
        title: text(item.title),
        link: text(item.link) || (typeof item.guid === 'object' && item.guid['@_isPermaLink'] !== 'false' ? text(item.guid) : ''),
        summary: text(item.description) || text(item['content:encoded']),
        published: parseDate(item.pubDate ?? item['dc:date']),
        author: text(item['dc:creator'] ?? item.author),
      });
    }
  } else if (doc.feed) {
    for (const entry of asArray(doc.feed.entry)) {
      raw.push({
        title: text(entry.title),
        link: atomLink(entry.link),
        summary: text(entry.summary) || text(entry.content),
        published: parseDate(entry.published ?? entry.updated),
        author: text(asArray(entry.author)[0]?.name),
      });
    }
  } else if (doc['rdf:RDF']) {
    for (const item of asArray(doc['rdf:RDF'].item)) {
      raw.push({
        title: text(item.title),
        link: text(item.link),
        summary: text(item.description),
        published: parseDate(item['dc:date']),
        author: text(item['dc:creator']),
      });
    }
  } else {
    throw new Error('Not an RSS, Atom or RDF document');
  }

  return raw
    .map((r) => buildArticle(r, feed, category, settings))
    .filter(Boolean)
    .slice(0, settings.maxItemsPerFeed);
}

// CISA's Known Exploited Vulnerabilities catalog: each entry is a CVE that
// is confirmed to be exploited in the wild. Great for learning what matters.
export function parseKev(json, feed, category, settings) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const vulns = asArray(data.vulnerabilities)
    .filter((v) => v && /^CVE-\d{4}-\d+$/i.test(v.cveID))
    .sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)))
    .slice(0, settings.maxItemsPerFeed);

  return vulns.map((v) => {
    const cve = v.cveID.toUpperCase();
    const ransomware = String(v.knownRansomwareCampaignUse).toLowerCase() === 'known';
    const summary = [
      v.shortDescription,
      v.requiredAction ? `Required action: ${v.requiredAction}` : '',
      v.dueDate ? `Federal due date: ${v.dueDate}.` : '',
      ransomware ? 'Known to be used in ransomware campaigns.' : '',
    ].filter(Boolean).join(' ');
    const article = buildArticle(
      {
        title: `${cve}: ${v.vendorProject} ${v.product} (${v.vulnerabilityName})`,
        link: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`,
        summary,
        published: parseDate(v.dateAdded),
        author: 'CISA',
      },
      feed, category, { ...settings, summaryLength: Math.max(settings.summaryLength, 500) }
    );
    if (article) {
      article.cves = [cve];
      if (ransomware && !article.concepts.includes('ransomware')) article.concepts.push('ransomware');
      if (!article.concepts.includes('patching')) article.concepts.push('patching');
    }
    return article;
  }).filter(Boolean);
}

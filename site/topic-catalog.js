// Starter sources for new topics. When you create a topic, Signal looks for
// a matching entry here (by name and keywords) and suggests its sources.
// Every feed below was checked to be a working RSS/Atom feed when it was
// added. Add your own entries any time.
//
// concepts: label → words that identify it in an article (same rules as
// concept-graph.js: whole words, "*" = starts with).

export const CATALOG = [
  // These three are the richest starting points: they come with their own
  // concept maps (concept-graph.js) and tuned subtopics. "builtin" is the
  // topic id those maps are keyed by.
  {
    name: "Security",
    builtin: "security",
    keywords: ["security", "cybersecurity", "cyber", "infosec", "appsec", "threat", "vulnerability", "hacking", "privacy"],
    description: "Security news, research and advisories.",
    subtopics: ["News & Breaches", "Threat Research", "Vulnerabilities & Advisories", "AppSec & Research", "Cloud Security", "Perspectives"],
    subtopicDetails: {
      "News & Breaches": { id: "news", description: "Daily security news: breaches, ransomware, policy.", keywords: "breach breaches hack hacked ransomware attack arrested leak phishing scam fraud outage policy lawsuit fine regulator" },
      "Threat Research": { id: "threat-intel", description: "Deep dives from vendor research teams on malware and threat actors.", keywords: "threat actor campaign malware apt espionage intrusion infostealer loader backdoor c2 implant botnet research analysis" },
      "Vulnerabilities & Advisories": { id: "vulns", description: "What's being exploited right now and what to patch.", keywords: "cve vulnerability vulnerabilities exploit exploited patch advisory flaw kev critical update firmware" },
      "AppSec & Research": { id: "appsec", description: "Web and application security techniques, supply chain, secure coding.", keywords: "xss csrf ssrf injection web application api browser javascript supply chain npm pypi package open source secure coding" },
      "Cloud Security": { id: "cloud", description: "Securing AWS, cloud identity, and edge infrastructure.", keywords: "aws azure gcp cloud iam kubernetes container s3 bucket serverless identity misconfiguration edge" },
      "Perspectives": { id: "perspectives", description: "Opinion and analysis from long-time practitioners.", keywords: "opinion essay analysis privacy surveillance ethics society policy trust" },
    },
    sources: [
      { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", site: "https://thehackernews.com", subtopic: "News & Breaches" },
      { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", site: "https://www.bleepingcomputer.com", subtopic: "News & Breaches" },
      { name: "The Record", url: "https://therecord.media/feed", site: "https://therecord.media", subtopic: "News & Breaches" },
      { name: "SecurityWeek", url: "https://www.securityweek.com/feed/", site: "https://www.securityweek.com", subtopic: "News & Breaches" },
      { name: "Dark Reading", url: "https://www.darkreading.com/rss.xml", site: "https://www.darkreading.com", subtopic: "News & Breaches" },
      { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", site: "https://krebsonsecurity.com", subtopic: "News & Breaches" },
      { name: "Cisco Talos", url: "https://blog.talosintelligence.com/rss/", site: "https://blog.talosintelligence.com", subtopic: "Threat Research" },
      { name: "Unit 42", url: "https://unit42.paloaltonetworks.com/feed/", site: "https://unit42.paloaltonetworks.com", subtopic: "Threat Research" },
      { name: "Microsoft Security", url: "https://www.microsoft.com/en-us/security/blog/feed/", site: "https://www.microsoft.com/en-us/security/blog", subtopic: "Threat Research" },
      { name: "Google Project Zero", url: "https://projectzero.google/feed.xml", site: "https://projectzero.google", subtopic: "Threat Research" },
      { name: "CISA Known Exploited Vulns", url: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", site: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", subtopic: "Vulnerabilities & Advisories", type: "cisa-kev" },
      { name: "CISA Advisories", url: "https://www.cisa.gov/cybersecurity-advisories/all.xml", site: "https://www.cisa.gov/news-events/cybersecurity-advisories", subtopic: "Vulnerabilities & Advisories" },
      { name: "SANS Internet Storm Center", url: "https://isc.sans.edu/rssfeed_full.xml", site: "https://isc.sans.edu", subtopic: "Vulnerabilities & Advisories" },
      { name: "PortSwigger Research", url: "https://portswigger.net/research/rss", site: "https://portswigger.net/research", subtopic: "AppSec & Research" },
      { name: "GitHub Security Blog", url: "https://github.blog/security/feed/", site: "https://github.blog/security/", subtopic: "AppSec & Research" },
      { name: "Snyk Blog", url: "https://snyk.io/blog/feed/", site: "https://snyk.io/blog/", subtopic: "AppSec & Research" },
      { name: "Google Security Blog", url: "https://feeds.feedburner.com/GoogleOnlineSecurityBlog", site: "https://security.googleblog.com", subtopic: "AppSec & Research" },
      { name: "AWS Security Blog", url: "https://aws.amazon.com/blogs/security/feed/", site: "https://aws.amazon.com/blogs/security/", subtopic: "Cloud Security" },
      { name: "Cloudflare Security", url: "https://blog.cloudflare.com/tag/security/rss/", site: "https://blog.cloudflare.com/tag/security/", subtopic: "Cloud Security" },
      { name: "Wiz Blog", url: "https://www.wiz.io/feed/rss.xml", site: "https://www.wiz.io/blog", subtopic: "Cloud Security" },
      { name: "Schneier on Security", url: "https://www.schneier.com/feed/atom/", site: "https://www.schneier.com", subtopic: "Perspectives" },
      { name: "Troy Hunt", url: "https://www.troyhunt.com/rss/", site: "https://www.troyhunt.com", subtopic: "Perspectives" },
    ],
    concepts: {}, // comes from the built-in concept map
  },
  {
    name: "Music",
    builtin: "music",
    keywords: ["music", "music production", "production", "synth", "synths", "audio", "music theory", "theory", "mixing"],
    description: "Making music: production, gear, theory and practice.",
    subtopics: ["Production & Gear", "Theory & Learning"],
    subtopicDetails: {
      "Production & Gear": { id: "music-production", description: "Synths, plugins, studios and production techniques.", keywords: "synth synthesizer plugin vst daw mixing mastering studio gear sampler drum machine recording microphone interface release review sound design" },
      "Theory & Learning": { id: "music-theory", description: "Music theory, ear training, and how music works.", keywords: "theory chord chords scale harmony melody interval mode ear training practice lesson learn musician history jazz composition songwriting", maxAgeDays: 365 },
    },
    sources: [
      { name: "CDM Create Digital Music", url: "https://cdm.link/feed/", site: "https://cdm.link", subtopic: "Production & Gear" },
      { name: "Attack Magazine", url: "https://www.attackmagazine.com/feed/", site: "https://www.attackmagazine.com", subtopic: "Production & Gear" },
      { name: "Sound On Sound", url: "https://www.soundonsound.com/rss.xml", site: "https://www.soundonsound.com", subtopic: "Production & Gear" },
      { name: "MusicRadar", url: "https://www.musicradar.com/feeds.xml", site: "https://www.musicradar.com", subtopic: "Production & Gear" },
      { name: "MusicTech", url: "https://musictech.com/feed/", site: "https://musictech.com", subtopic: "Production & Gear" },
      { name: "Synthtopia", url: "https://www.synthtopia.com/feed/", site: "https://www.synthtopia.com", subtopic: "Production & Gear" },
      { name: "Bedroom Producers Blog", url: "https://bedroomproducersblog.com/feed/", site: "https://bedroomproducersblog.com", subtopic: "Production & Gear" },
      { name: "Splice Blog", url: "https://splice.com/blog/feed/", site: "https://splice.com/blog/", subtopic: "Production & Gear" },
      { name: "Sweetwater InSync", url: "https://www.sweetwater.com/insync/feed/", site: "https://www.sweetwater.com/insync/", subtopic: "Production & Gear" },
      { name: "Berklee Online Take Note", url: "https://online.berklee.edu/takenote/feed/", site: "https://online.berklee.edu/takenote/", subtopic: "Theory & Learning" },
      { name: "The Ethan Hein Blog", url: "https://www.ethanhein.com/wp/feed/", site: "https://www.ethanhein.com", subtopic: "Theory & Learning" },
      { name: "Hooktheory Blog", url: "https://www.hooktheory.com/blog/feed/", site: "https://www.hooktheory.com/blog/", subtopic: "Theory & Learning" },
      { name: "Soundfly Flypaper", url: "https://flypaper.soundfly.com/feed/", site: "https://flypaper.soundfly.com", subtopic: "Theory & Learning" },
      { name: "Adam Neely (YouTube)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCnkp4xDOwqqJD7sSM3xdUiQ", site: "https://www.youtube.com/channel/UCnkp4xDOwqqJD7sSM3xdUiQ", subtopic: "Theory & Learning" },
      { name: "12tone (YouTube)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCTUtqcDkzw7bisadh6AOx5w", site: "https://www.youtube.com/channel/UCTUtqcDkzw7bisadh6AOx5w", subtopic: "Theory & Learning" },
    ],
    concepts: {}, // comes from the built-in concept map
  },
  {
    name: "Games",
    builtin: "games",
    keywords: ["games", "gaming", "game", "game dev", "game design", "indie games", "video games", "game security"],
    description: "Indie games, game design, and the security side of games.",
    subtopics: ["Indie & Design", "Game Security & Hacking"],
    subtopicDetails: {
      "Indie & Design": { id: "games-design", description: "Indie releases and the craft and business of making games.", keywords: "indie game design developer studio launch steam wishlist marketing publisher gameplay level narrative jam release trailer", maxAgeDays: 90 },
      "Game Security & Hacking": { id: "games-security", description: "Anti-cheat, reverse engineering, console homebrew and how games break.", keywords: "anti-cheat cheat reverse engineering exploit homebrew jailbreak console emulator kernel driver hypervisor decompile ghidra glitch mechanics", maxAgeDays: 365 },
    },
    sources: [
      { name: "Game Developer", url: "https://www.gamedeveloper.com/rss.xml", site: "https://www.gamedeveloper.com", subtopic: "Indie & Design" },
      { name: "itch.io Featured", url: "https://itch.io/feed/featured.xml", site: "https://itch.io/games/featured", subtopic: "Indie & Design" },
      { name: "How To Market A Game", url: "https://howtomarketagame.com/feed/", site: "https://howtomarketagame.com", subtopic: "Indie & Design" },
      { name: "Deconstructor of Fun", url: "https://www.deconstructoroffun.com/blog?format=rss", site: "https://www.deconstructoroffun.com", subtopic: "Indie & Design" },
      { name: "Raph Koster", url: "https://www.raphkoster.com/feed/", site: "https://www.raphkoster.com", subtopic: "Indie & Design" },
      { name: "Lost Garden", url: "https://lostgarden.com/feed/", site: "https://lostgarden.com", subtopic: "Indie & Design" },
      { name: "Game Maker's Toolkit (YouTube)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCqJ-Xo29CKyLTjn6z2XwYAw", site: "https://www.youtube.com/channel/UCqJ-Xo29CKyLTjn6z2XwYAw", subtopic: "Indie & Design" },
      { name: "Aftermath Labs", url: "https://aftermathlabs.net/index.xml", site: "https://aftermathlabs.net", subtopic: "Game Security & Hacking" },
      { name: "secret club", url: "https://secret.club/feed.xml", site: "https://secret.club", subtopic: "Game Security & Hacking" },
      { name: "Wololo", url: "https://wololo.net/feed/", site: "https://wololo.net", subtopic: "Game Security & Hacking" },
      { name: "LiveOverflow (YouTube)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UClcE-kVhqyiHCcjYwcpfj9w", site: "https://www.youtube.com/channel/UClcE-kVhqyiHCcjYwcpfj9w", subtopic: "Game Security & Hacking" },
      { name: "Retro Game Mechanics Explained (YouTube)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCwRqWnW5ZkVaP_lZF7caZ-g", site: "https://www.youtube.com/channel/UCwRqWnW5ZkVaP_lZF7caZ-g", subtopic: "Game Security & Hacking" },
      { name: "Modern Vintage Gamer (YouTube)", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCjFaPUcJU1vwk193mnW_w1w", site: "https://www.youtube.com/channel/UCjFaPUcJU1vwk193mnW_w1w", subtopic: "Game Security & Hacking" },
    ],
    concepts: {}, // comes from the built-in concept map
  },
  {
    name: 'AI & Machine Learning',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'ml', 'llm', 'deep learning', 'genai'],
    description: 'How modern AI works, what is new, and how people build with it.',
    subtopics: ['Research & News', 'Practitioners'],
    sources: [
      { name: 'Import AI', url: 'https://importai.substack.com/feed', subtopic: 'Research & News' },
      { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', subtopic: 'Research & News' },
      { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', subtopic: 'Practitioners' },
      { name: 'Ahead of AI', url: 'https://magazine.sebastianraschka.com/feed', subtopic: 'Practitioners' },
    ],
    concepts: {
      'LLMs': ['llm', 'large language model', 'gpt', 'claude', 'gemini', 'llama'],
      'agents': ['agent', 'agentic', 'tool use'],
      'training': ['training', 'fine-tun*', 'dataset', 'pretrain*'],
      'evaluation': ['eval', 'evaluation', 'benchmark'],
      'open models': ['open-weight', 'open model', 'mistral', 'qwen'],
      'safety': ['alignment', 'ai safety', 'interpretability'],
    },
  },
  {
    name: 'Web Development',
    keywords: ['web', 'web dev', 'frontend', 'front-end', 'css', 'javascript', 'html', 'coding', 'programming'],
    description: 'Building for the web: CSS, JavaScript, accessibility and performance.',
    subtopics: ['Techniques', 'Platform News'],
    sources: [
      { name: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', subtopic: 'Techniques' },
      { name: 'Josh W. Comeau', url: 'https://www.joshwcomeau.com/rss.xml', subtopic: 'Techniques' },
      { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', subtopic: 'Techniques' },
      { name: 'web.dev', url: 'https://web.dev/feed.xml', subtopic: 'Platform News' },
    ],
    concepts: {
      'CSS': ['css', 'flexbox', 'grid layout', 'container quer*', 'selector'],
      'JavaScript': ['javascript', 'typescript', 'react', 'node.js', 'npm'],
      'accessibility': ['accessibility', 'a11y', 'aria', 'screen reader'],
      'performance': ['performance', 'core web vitals', 'lcp', 'page speed'],
      'browsers': ['browser', 'chrome', 'firefox', 'safari', 'baseline'],
    },
  },
  {
    name: 'UX & Design',
    keywords: ['design', 'ux', 'ui', 'user experience', 'product design', 'usability'],
    description: 'Designing things people can actually use.',
    subtopics: ['Research', 'Craft'],
    sources: [
      { name: 'Nielsen Norman Group', url: 'https://www.nngroup.com/feed/rss/', subtopic: 'Research' },
      { name: 'A List Apart', url: 'https://alistapart.com/main/feed/', subtopic: 'Craft' },
      { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', subtopic: 'Craft' },
    ],
    concepts: {
      'usability': ['usability', 'user research', 'user testing', 'interview'],
      'accessibility': ['accessibility', 'a11y', 'inclusive'],
      'typography': ['typography', 'typeface', 'font'],
      'design systems': ['design system', 'component'],
      'interaction': ['interaction design', 'microinteraction', 'animation', 'navigation'],
    },
  },
  {
    name: 'Science',
    keywords: ['science', 'physics', 'biology', 'math', 'mathematics', 'research', 'chemistry'],
    description: 'Big ideas and new discoveries across the sciences.',
    subtopics: ['Deep Dives', 'Daily Discoveries'],
    sources: [
      { name: 'Quanta Magazine', url: 'https://www.quantamagazine.org/feed/', subtopic: 'Deep Dives' },
      { name: 'Nautilus', url: 'https://nautil.us/feed/', subtopic: 'Deep Dives' },
      { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/all.xml', subtopic: 'Daily Discoveries' },
    ],
    concepts: {
      'physics': ['physics', 'quantum', 'particle', 'relativity'],
      'biology': ['biology', 'gene', 'genetic*', 'cell', 'evolution'],
      'math': ['mathematic*', 'theorem', 'proof', 'equation'],
      'neuroscience': ['brain', 'neuro*'],
      'climate': ['climate', 'carbon', 'warming'],
    },
  },
  {
    name: 'Space',
    keywords: ['space', 'astronomy', 'nasa', 'rockets', 'planets', 'astrophysics', 'cosmos'],
    description: 'Missions, planets and the universe.',
    subtopics: ['Missions & News'],
    sources: [
      { name: 'NASA', url: 'https://www.nasa.gov/feed/', subtopic: 'Missions & News' },
      { name: 'The Planetary Society', url: 'https://www.planetary.org/rss/articles', subtopic: 'Missions & News' },
    ],
    concepts: {
      'missions': ['mission', 'launch', 'spacecraft', 'probe'],
      'planets': ['planet', 'mars', 'jupiter', 'saturn', 'moon', 'asteroid'],
      'telescopes': ['telescope', 'webb', 'hubble'],
      'rockets': ['rocket', 'spacex', 'starship', 'artemis'],
    },
  },
  {
    name: 'Photography',
    keywords: ['photography', 'photo', 'photos', 'camera', 'cameras', 'photographer'],
    description: 'Cameras, technique and editing.',
    subtopics: ['Technique', 'Gear & News'],
    sources: [
      { name: 'Fstoppers', url: 'https://fstoppers.com/rss.xml', subtopic: 'Technique' },
      { name: 'PetaPixel', url: 'https://petapixel.com/feed/', subtopic: 'Gear & News' },
    ],
    concepts: {
      'gear': ['camera', 'lens', 'mirrorless', 'sensor'],
      'editing': ['lightroom', 'photoshop', 'editing', 'retouch*'],
      'lighting': ['lighting', 'flash', 'strobe', 'natural light'],
      'composition': ['composition', 'framing'],
      'video': ['video', 'filmmaking'],
    },
  },
  {
    name: 'Film & TV',
    keywords: ['film', 'films', 'movie', 'movies', 'cinema', 'tv', 'television', 'filmmaking'],
    description: 'Making films and watching them well.',
    subtopics: ['Filmmaking', 'Reviews'],
    sources: [
      { name: 'No Film School', url: 'https://nofilmschool.com/rss.xml', subtopic: 'Filmmaking' },
      { name: 'RogerEbert.com', url: 'https://www.rogerebert.com/feed', subtopic: 'Reviews' },
    ],
    concepts: {
      'filmmaking': ['filmmak*', 'directing', 'cinematograph*', 'shoot'],
      'screenwriting': ['screenplay', 'screenwrit*', 'script'],
      'editing': ['editing', 'premiere', 'davinci resolve'],
      'festivals': ['festival', 'tiff', 'cannes', 'sundance', 'venice'],
      'reviews': ['review'],
    },
  },
  {
    name: 'Linux & Self-hosting',
    keywords: ['linux', 'self-hosting', 'selfhosting', 'self hosted', 'homelab', 'open source', 'foss'],
    description: 'Running your own software and servers.',
    subtopics: ['News', 'Self-hosting'],
    sources: [
      { name: 'LWN.net', url: 'https://lwn.net/headlines/rss', subtopic: 'News' },
      { name: "It's FOSS", url: 'https://itsfoss.com/rss/', subtopic: 'News' },
      { name: 'selfh.st', url: 'https://selfh.st/rss/', subtopic: 'Self-hosting' },
    ],
    concepts: {
      'kernel': ['kernel'],
      'distros': ['distro*', 'ubuntu', 'fedora', 'debian', 'arch linux'],
      'self-hosting': ['self-host*', 'homelab', 'docker', 'container'],
      'desktop': ['gnome', 'kde', 'wayland', 'desktop'],
    },
  },
  {
    name: 'Cooking',
    keywords: ['cooking', 'cook', 'recipes', 'recipe', 'food', 'baking', 'kitchen'],
    description: 'Recipes and kitchen skills.',
    subtopics: ['Recipes'],
    sources: [
      { name: 'Budget Bytes', url: 'https://www.budgetbytes.com/feed/', subtopic: 'Recipes' },
      { name: 'Smitten Kitchen', url: 'https://feeds.feedburner.com/smittenkitchen', subtopic: 'Recipes' },
    ],
    concepts: {
      'baking': ['baking', 'bread', 'cake', 'cookie', 'pie'],
      'weeknight': ['quick', 'easy', 'weeknight', 'one-pot', 'sheet pan'],
      'vegetarian': ['vegetarian', 'vegan', 'plant-based'],
      'budget': ['budget', 'cheap', 'meal prep'],
    },
  },
];

/** Best catalog matches for a topic name, strongest first. */
export function suggestTopics(query) {
  const q = String(query || '').toLowerCase().trim();
  if (q.length < 2) return [];
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  return CATALOG
    .map((entry) => {
      const hay = [entry.name.toLowerCase(), ...entry.keywords];
      let score = 0;
      if (entry.name.toLowerCase().includes(q)) score += 5;
      for (const k of entry.keywords) if (q === k || q.includes(k) || k.startsWith(q)) score += 3;
      for (const w of words) if (hay.some((k) => k.split(/[^a-z0-9]+/).includes(w))) score += 1;
      return { entry, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.entry);
}

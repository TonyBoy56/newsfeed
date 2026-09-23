// Starter sources for new topics. When you create a topic, Signal looks for
// a matching entry here (by name and keywords) and suggests its sources.
// Every feed below was checked to be a working RSS/Atom feed when it was
// added. Add your own entries any time.
//
// concepts: label → words that identify it in an article (same rules as
// concept-graph.js: whole words, "*" = starts with).

export const CATALOG = [
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

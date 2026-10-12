import topicsByDomain from './catalog/ro.js';

const slug = value => value.normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const topicAssets = new Map();
for (const [domainIndex, [domain, entry]] of Object.entries(topicsByDomain).entries()) {
  const folder = `${String(domainIndex + 1).padStart(2, '0')}-${slug(entry.name)}`;
  entry.topics.forEach((topic, topicIndex) => {
    const file = `${String(topicIndex + 1).padStart(2, '0')}-${slug(topic)}.svg`;
    topicAssets.set(`${domain}:${topic}`, `/img/topic-icons/${folder}/${file}`);
  });
}

/** Return the dedicated SVG asset for a canonical topic. */
export function topicIcon(domain, topic) {
  const src = topicAssets.get(`${domain}:${topic}`);
  return src
    ? `<img class="topic-glyph" src="${src}" alt="" aria-hidden="true" loading="lazy" decoding="async">`
    : '';
}

import base from './catalog/ro.js';

// Names are presentation data. Slugs and the original topic keys remain stable
// so changing the interface language never disconnects lessons or progress.
export function localizedDomain(domain, catalog, field = 'name') {
  const slug = typeof domain === 'string' ? domain : domain?.slug;
  return catalog?.[slug]?.[field] ?? domain?.[field] ?? base[slug]?.[field] ?? (field === 'name' ? slug : '');
}

export function localizedTopic(slug, topic, catalog) {
  const translated = catalog?.[slug]?.topics;
  if (!translated) return topic;
  if (!Array.isArray(translated)) return translated[topic] ?? topic;
  const index = base[slug]?.topics.indexOf(topic) ?? -1;
  return index >= 0 ? (translated[index] ?? topic) : topic;
}

// Questions about Studio's catalog (site/data/studio.json, catalog v2). Pure: no imports.

export function isTarget(entry) {
  return entry.buffer_role === 'target' || entry.buffer_role === 'both';
}

export function isSource(entry) {
  return entry.buffer_role === 'source' || entry.buffer_role === 'both';
}

// Drawn from map tiles (copy, or hybrid with tiles in this build), or from live requests.
export function drawsFromTiles(entry) {
  return entry.access === 'copy' || (entry.access === 'hybrid' && Boolean(entry.tiles));
}

// Counts, lists and exports: from our files (copy) or the source (live and hybrid).
export function queriesLive(entry) {
  return entry.access !== 'copy';
}

export function fieldByName(entry, name) {
  return entry.fields.find((field) => field.name === name) ?? null;
}

// Output fields a map layer needs: label, style and label fields, filters and popups.
export function displayFields(entry) {
  const wanted = new Set([entry.label_field]);
  for (const style of Object.values(entry.styles)) {
    if (style.field) wanted.add(style.field);
    if (style.labels?.field) wanted.add(style.labels.field);
  }
  return entry.fields.filter((field) => wanted.has(field.name) || field.filter !== 'none' || field.popup);
}

// Source field names to request: never '*', never a leave-out field (those are not in the catalog at all).
export function outFields(entry, fields = entry.fields) {
  return [...new Set([entry.source.id_field, ...fields.map((field) => field.source)])];
}

export function createRegistry(catalog) {
  const byId = new Map(catalog.layers.map((entry) => [entry.id, entry]));
  const groups = catalog.categories.map((category) => ({
    category, layers: catalog.layers.filter((entry) => entry.category === category),
  }));
  return {
    catalog,
    layers: catalog.layers,
    groups,
    get: (id) => byId.get(id) ?? null,
    has: (id) => byId.has(id),
    ids: () => new Set(byId.keys()),
    // The unique credit lines for a set of layer IDs, in order. A line contained in a longer one is dropped
    // (the NJDEP sentence appears once, even when a layer adds "Flood zone data: FEMA." to it).
    credits(ids) {
      const lines = [];
      for (const id of ids) {
        const line = byId.get(id)?.license?.attribution;
        if (line && !lines.includes(line)) lines.push(line);
      }
      return lines.filter((line) => !lines.some((other) => other !== line && other.includes(line)));
    },
  };
}

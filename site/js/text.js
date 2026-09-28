// Every user-facing string lives here. tools/lint_text.py rejects GIS jargon outside TEXT.downloads.
export const TEXT = {
  siteTitle: 'NJ Atlas',
  tagline: 'New Jersey open data you can map, filter and download.',
  boundaryHeading: 'Boundary',
  dataHeading: 'Data',
  narrowHeading: 'Narrow it down',
  resultsHeading: 'Results',
  aboutButton: 'About this data',
  close: 'Close',
  draft: 'Draft',
  loading: 'Loading…',
  loadingList: 'Loading the list of data…',
  loadFailed: (what) => `Could not load ${what}. Check your connection and try again.`,
  listOfData: 'the list of data',
  listOfAreas: 'the list of areas',
  theMap: 'the map',
  thisData: 'this data',
  tryAgain: 'Try again',
  zoomIn: (plural) => `Zoom in to see ${plural}`,
  notRecorded: 'Not recorded',
  itemCount: (countText, plural) => `${countText} ${plural}`,

  categories: {
    boundaries: 'Boundaries',
    property: 'Property',
    environment: 'Environment',
    hazards: 'Hazards',
    water: 'Water',
    transportation: 'Transportation',
    community: 'Community',
    planning: 'Planning',
    history: 'History and culture',
  },

  levels: {
    state: 'State',
    county: 'County',
    municipality: 'Municipality',
    tract: 'Census tract',
    block_group: 'Block group',
  },

  boundary: {
    label: 'Level',
    hints: {
      state: () => 'The whole of New Jersey.',
      county: (countText) => `New Jersey's ${countText} counties.`,
      municipality: (countText) => `New Jersey's ${countText} cities, towns, boroughs, townships and villages.`,
      tract: (countText) => `${countText} neighborhoods the U.S. Census Bureau uses to count people, `
        + 'usually 1,200 to 8,000 residents each.',
      block_group: (countText) => `${countText} smaller parts of census tracts, usually 600 to 3,000 residents each.`,
    },
  },

  area: {
    all: {
      county: 'All of New Jersey',
      municipality: 'All municipalities',
      tract: 'All census tracts',
      block_group: 'All block groups',
    },
    chooseFirst: {
      county_fips: 'Choose a county first',
      tract_geoid: 'Choose a census tract first',
    },
  },

  data: {
    label: 'Dataset',
    none: 'None: show the boundaries only',
    boundariesOnly: (countText, plural) => `Showing ${countText} ${plural}. Choose a dataset to see what is in them.`,
    partitioned: (countText, plural, placesText) => `${countText} ${plural} in ${placesText} municipalities; `
      + 'they load one municipality at a time.',
  },

  partition: {
    choose: (plural) => `Choose a county and a municipality to see ${plural}.`,
    none: (plural) => `No ${plural} are recorded for this municipality.`,
  },

  place: {
    outside: 'Outside New Jersey municipalities',
    where: 'Where',
  },

  filters: {
    tryLabel: 'Try:',
    searchPlaceholder: 'Type to search',
    atLeast: 'At least',
    atMost: 'At most',
    blank: '(blank)',
    showAll: (countText) => `Show all ${countText}`,
    showFewer: 'Show fewer',
    anyValue: 'Any',
  },

  help: {
    heading: 'How it works',
    steps: [
      'Pick a boundary level: the state, counties, municipalities, census tracts or block groups.',
      'Pick an area with the lists under it, from county down, or leave them on "All".',
      'Choose a dataset, such as preserved open space, or keep "None" to see the areas themselves.',
      'Narrow it down with the checkboxes, search boxes and number boxes, or tap a Try example.',
      'Read the count, click the map or the table for details, then download the matches or copy a link.',
    ],
    dismiss: 'Got it',
  },

  results: {
    downloadMatches: 'Download matches (CSV)',
    copyLink: 'Copy link',
    linkCopied: 'Link copied',
    copyFallback: 'Copy this link:',
    linkLabel: 'Link to this view',
    matchCount: (countText, totalText, plural) => `${countText} of ${totalText} ${plural} match`,
    matchCountIn: (countText, totalText, plural, place) => `${countText} of ${totalText} ${plural} in ${place} match`,
    noMatches: (plural) => `No ${plural} match. Remove a filter to see more.`,
    clearAll: 'Clear all',
    remove: (phrase) => `Remove: ${phrase}`,
    tableNote: (shownText, totalText) => `Showing the first ${shownText} of ${totalText}.`,
    tableCaption: (plural) => `Matching ${plural}`,
    columns: {
      municipality: 'Municipality',
      county: 'County',
      tract: 'Census tract',
      block_group: 'Block group',
    },
  },

  describe: {
    place: (name) => `In ${name}`,
    isOneOf: (label, values) => `${label} is ${values}`,
    or: ' or ',
    blank: 'blank',
    contains: (label, value) => `${label} contains “${value}”`,
    atLeast: (label, value) => `${label} is at least ${value}`,
    atMost: (label, value) => `${label} is at most ${value}`,
    between: (label, low, high) => `${label} is between ${low} and ${high}`,
    separator: ' · ',
  },

  notices: {
    unknownLayer: 'The shared link names data that is no longer available.',
    unknownField: (name) => `The shared link used a filter (${name}) that no longer exists, so it was left out.`,
    badLink: 'The shared link could not be read, so no filters were applied.',
  },

  about: {
    heading: 'About this data',
    publisher: 'Published by',
    openService: 'Open the original data service',
    sourceService: 'Source service',
    license: 'License',
    licensePending: 'License not yet reviewed',
    credit: 'Credit',
    fetched: 'Downloaded from the publisher',
    count: 'Number of items',
    draftNote: 'This is a draft and is not published yet.',
    choosePartition: 'Choose a municipality to download its files.',
  },

  selftest: {
    heading: 'Self-test',
    layerColumn: 'Data',
    testColumn: 'Test',
    expectedColumn: 'Expected',
    gotColumn: 'Got',
    resultColumn: 'Result',
    pass: 'PASS',
    fail: 'FAIL',
    summaryPass: 'SELFTEST: PASS',
    summaryFail: 'SELFTEST: FAIL',
  },

  downloads: {
    heading: 'Download the whole set',
    partitionHeading: (place) => `Download ${place}'s files`,
    csv: 'Spreadsheet (CSV)',
    geojson: 'GeoJSON (for mapping apps)',
    parquet: 'GeoParquet (for data tools)',
  },
};

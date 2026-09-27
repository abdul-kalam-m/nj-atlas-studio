-- Export counter (D-044, IMPLEMENTATION_GUIDE.md §4.13). Totals only; nothing per user.
CREATE TABLE IF NOT EXISTS totals (
  week TEXT NOT NULL,     -- ISO week of the Worker's UTC clock, e.g. 2026-W41
  pilot TEXT NOT NULL,    -- a code from PILOTS, or 'public'
  event TEXT NOT NULL,    -- pdf | png | link | map_file | embed | csv | geojson
  outcome TEXT NOT NULL,  -- ok | failed
  n INTEGER NOT NULL,
  PRIMARY KEY (week, pilot, event, outcome)
);

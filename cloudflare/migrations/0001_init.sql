CREATE TABLE IF NOT EXISTS region_data (
  region_id INTEGER PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tracker_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO tracker_state(key,value) VALUES ('next_region','0');

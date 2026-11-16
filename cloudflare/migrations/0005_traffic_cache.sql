CREATE TABLE IF NOT EXISTS traffic_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  last_error TEXT
);

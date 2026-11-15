CREATE TABLE IF NOT EXISTS aircraft_registry (
  hex TEXT PRIMARY KEY,
  registration TEXT,
  manufacturer TEXT,
  type TEXT,
  icao_type_code TEXT,
  registered_owner TEXT,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

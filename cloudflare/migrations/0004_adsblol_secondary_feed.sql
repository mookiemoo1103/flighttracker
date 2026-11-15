CREATE TABLE IF NOT EXISTS adsblol_region_data (
  region_id INTEGER PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO tracker_state(key,value) VALUES ('adsblol_next_region','0');
INSERT OR IGNORE INTO tracker_state(key,value) VALUES ('adsblol_last_success','0');
INSERT OR IGNORE INTO tracker_state(key,value) VALUES ('adsblol_last_batch_count','0');
INSERT OR IGNORE INTO tracker_state(key,value) VALUES ('adsblol_last_error','');

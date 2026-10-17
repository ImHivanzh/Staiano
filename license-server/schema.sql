-- Schema D1 del server licenze Staiano.
-- Applicare con: npm run license:db:init

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  customer TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'standard',
  seats INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active',
  features TEXT NOT NULL DEFAULT 'configurator',
  notes TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS activations (
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  hostname TEXT,
  app_version TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  released_at TEXT,
  PRIMARY KEY (license_id, machine_id)
);

CREATE INDEX IF NOT EXISTS activations_by_machine
  ON activations (machine_id);

CREATE INDEX IF NOT EXISTS activations_by_license
  ON activations (license_id, released_at);

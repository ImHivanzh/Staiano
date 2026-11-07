-- Schema D1 del server licenze Staiano.
-- Applicare con: npm run license:db:init

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL DEFAULT 'staiano-hvac',
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

CREATE TABLE IF NOT EXISTS releases (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  commit_sha TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repository TEXT,
  executable TEXT,
  created_at TEXT NOT NULL
);
INSERT OR IGNORE INTO products (id, name, repository, executable, created_at)
VALUES ('staiano-hvac', 'Staiano HVAC', 'AvocadoOra/Staiano-3D', 'StaianoHVAC.exe', datetime('now'));

CREATE TABLE IF NOT EXISTS admin_passkeys (id TEXT PRIMARY KEY, public_key TEXT NOT NULL, counter INTEGER NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS passkey_challenges (id TEXT PRIMARY KEY, kind TEXT NOT NULL, challenge TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS host_commands (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS host_commands_pending ON host_commands (machine_id, delivered_at);

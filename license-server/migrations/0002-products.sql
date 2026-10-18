-- Existing installations only. New databases use schema.sql.
ALTER TABLE licenses ADD COLUMN product_id TEXT NOT NULL DEFAULT 'staiano-hvac';
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repository TEXT,
  executable TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO products (id, name, repository, executable, created_at)
VALUES ('staiano-hvac', 'Staiano HVAC', 'AvocadoOra/Staiano-3D', 'StaianoHVAC.exe', datetime('now'));

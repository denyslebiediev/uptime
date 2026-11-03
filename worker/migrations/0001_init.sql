CREATE TABLE span (
  id          INTEGER PRIMARY KEY,
  device      TEXT    NOT NULL,           -- 'centralna' | 'rayduzhna'
  boot_id     TEXT    NOT NULL,
  boot_at     INTEGER NOT NULL,           -- unix s, MIN(receive_time - up) over this boot
  first_seen  INTEGER NOT NULL,           -- unix s, Worker receive time
  last_seen   INTEGER NOT NULL,           -- unix s, Worker receive time
  alive_until INTEGER,                    -- unix s, from the next boot's previous-boot report
  shutdown    TEXT    NOT NULL DEFAULT 'none'  -- 'none' | 'reboot' | 'poweroff'
);
-- index must not be touched by the per-heartbeat UPDATE (each updated index = +1 row written)
CREATE INDEX span_device_id ON span(device, id);

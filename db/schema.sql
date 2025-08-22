-- Schema normalizzato per Paris League (Netlify + Neon)
CREATE TABLE IF NOT EXISTS players (
  id text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id text PRIMARY KEY,
  date timestamptz NOT NULL DEFAULT now(),
  team_a text[] NOT NULL,
  team_b text[] NOT NULL,
  sets jsonb NOT NULL  -- es. [{a:6,"b":4},{a:6,"b":3}]
);

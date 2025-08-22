import { neon } from '@netlify/neon';

const sql = neon();

async function ensureInit(){
  await sql`CREATE TABLE IF NOT EXISTS players(
    id text PRIMARY KEY,
    name text NOT NULL
  )`;
  await sql`CREATE TABLE IF NOT EXISTS matches(
    id text PRIMARY KEY,
    date timestamptz NOT NULL DEFAULT now(),
    team_a text[] NOT NULL,
    team_b text[] NOT NULL,
    sets jsonb NOT NULL
  )`;
}

export async function handler(event){
  try{
    await ensureInit();

    if(event.httpMethod === 'GET'){
      const players = await sql`SELECT id, name FROM players ORDER BY name`;
      const matches = await sql`SELECT id, date, team_a, team_b, sets FROM matches ORDER BY date`;
      return json(200, { players, matches });
    }

    if(event.httpMethod === 'POST'){
      const body = JSON.parse(event.body || '{}');
      const players = Array.isArray(body.players)? body.players: null;
      const matches = Array.isArray(body.matches)? body.matches: null;
      if(!players || !matches) return json(400, {error:'payload non valido: servono players[] e matches[]'});

      await sql`BEGIN`;
      try {
        await sql`DELETE FROM players`;
        if(players.length){
          const rows = players.map(p => [p.id, p.name]);
          await sql`INSERT INTO players (id, name) VALUES ${sql(rows)}`;
        }

        await sql`DELETE FROM matches`;
        if(matches.length){
          const rows = matches.map(m => [m.id, m.date || new Date().toISOString(), m.teamA || m.team_a, m.teamB || m.team_b, JSON.stringify(m.sets || [])]);
          await sql`INSERT INTO matches (id, date, team_a, team_b, sets) VALUES ${sql(rows)}`;
        }
        await sql`COMMIT`;
      } catch (e) {
        await sql`ROLLBACK`;
        throw e;
      }
      return json(200, { ok:true });
    }

    return json(405, {error:'method not allowed'});
  }catch(e){
    return json(500, {error:String(e)});
  }
}

function json(statusCode, body){
  return { statusCode, headers:{'Content-Type':'application/json','Cache-Control':'no-store'}, body: JSON.stringify(body) };
}

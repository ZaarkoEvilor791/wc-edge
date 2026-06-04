import pg from 'pg'

// All wc-edge tables live in the 'wc' Postgres schema on the shared Render DB.
const connectionString = process.env.DATABASE_URL
const isRemote =
  connectionString &&
  !connectionString.includes('localhost') &&
  !connectionString.includes('127.0.0.1')

// search_path=wc,public means unqualified table names resolve to wc.* first.
const pool = connectionString
  ? new pg.Pool({
      connectionString:
        connectionString + (connectionString.includes('?') ? '&' : '?') +
        'options=-c%20search_path%3Dwc%2Cpublic',
      max: 5,
      ssl: isRemote ? { rejectUnauthorized: false } : undefined,
    })
  : null

export const dbEnabled = pool != null

async function q<T>(sql: string, params?: unknown[]): Promise<T[]> {
  if (!pool) return []
  const { rows } = await pool.query(sql, params)
  return rows as T[]
}

// ---- Query functions ----

export async function getPlayers() {
  return q<{
    element: number; position: string; price: number; squad_id: number
    known_name: string | null; first_name: string | null; last_name: string | null
    percent_selected: number | null; status: string | null
  }>('SELECT element, position, price, squad_id, known_name, first_name, last_name, percent_selected, status FROM players ORDER BY element')
}

export async function getTeams() {
  return q<{ squad_id: number; name: string; abbr: string; seed: number | null; group_name: string | null }>(
    'SELECT squad_id, name, abbr, seed, group_name FROM teams ORDER BY squad_id'
  )
}

export async function getRounds() {
  return q<{ id: number; stage: string; start_date: string | null; end_date: string | null; status: string }>(
    'SELECT id, stage, start_date, end_date, status FROM rounds ORDER BY id'
  )
}

export async function getProjections(round: number) {
  return q<{ element: number; xp: number; p_play: number; mf: number; p_goal: number; p_cs: number; variance: number; low_sample: boolean }>(
    'SELECT element, xp, p_play, mf, p_goal, p_cs, variance, low_sample FROM projections WHERE round = $1 ORDER BY xp DESC',
    [round]
  )
}

export async function getSuggestedSquad() {
  const rows = await q<{ id: number; round: number; squad_json: unknown; total_xp: number; total_cost: number; computed_at: string }>(
    'SELECT id, round, squad_json, total_xp, total_cost, computed_at FROM suggested_squad ORDER BY computed_at DESC LIMIT 1'
  )
  return rows[0] ?? null
}

export async function matchPlayersByName(name: string) {
  const like = `%${name.toLowerCase()}%`
  const rows = await q<{
    element: number; position: string; price: number; squad_id: number
    name: string; team_abbr: string; xp: number; low_sample: boolean
  }>(`
    SELECT
      p.element,
      p.position,
      p.price,
      p.squad_id,
      COALESCE(p.known_name, TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))) AS name,
      COALESCE(t.abbr, '') AS team_abbr,
      COALESCE(proj.xp, 0) AS xp,
      false AS low_sample
    FROM players p
    LEFT JOIN teams t ON t.squad_id = p.squad_id
    LEFT JOIN (SELECT element, xp FROM projections WHERE round = 1) proj ON proj.element = p.element
    WHERE lower(COALESCE(p.known_name, '')) ILIKE $1
       OR lower(COALESCE(p.last_name, '')) ILIKE $1
       OR lower(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,''))) ILIKE $1
    ORDER BY p.price DESC
    LIMIT 1
  `, [like])
  return rows[0] ?? null
}

export async function getCurrentRoundId(): Promise<number> {
  const rows = await q<{ id: number }>(
    "SELECT id FROM rounds WHERE status = 'active' ORDER BY id LIMIT 1"
  )
  if (rows.length) return rows[0].id
  const all = await q<{ id: number }>('SELECT id FROM rounds ORDER BY id LIMIT 1')
  return all[0]?.id ?? 1
}

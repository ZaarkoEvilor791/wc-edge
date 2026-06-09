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
  return q<{ squad_id: number; name: string; abbr: string; seed: number | null; group_name: string | null; is_active: boolean }>(
    'SELECT squad_id, name, abbr, seed, group_name, is_active FROM teams ORDER BY squad_id'
  )
}

export async function getRounds() {
  return q<{ id: number; stage: string; start_date: string | null; end_date: string | null; status: string }>(
    'SELECT id, stage, start_date, end_date, status FROM rounds ORDER BY id'
  )
}

export async function getProjections(round: number) {
  return q<{ element: number; round: number; xp: number; p_play: number; mf: number; p_goal: number; p_cs: number; variance: number; low_sample: boolean }>(
    'SELECT element, round, xp, p_play, mf, p_goal, p_cs, variance, low_sample FROM projections WHERE round = $1 ORDER BY xp DESC',
    [round]
  )
}

export async function getSuggestedSquad(variant = 'max_xp') {
  const rows = await q<{ id: number; round: number; variant: string; squad_json: unknown; total_xp: number; total_cost: number; computed_at: string }>(
    `SELECT id, round, variant, squad_json, total_xp, total_cost, computed_at
     FROM suggested_squad
     WHERE variant = $1
     ORDER BY computed_at DESC LIMIT 1`,
    [variant]
  )
  // Fall back to any variant if requested one doesn't exist yet
  if (!rows[0]) {
    const fallback = await q<{ id: number; round: number; variant: string; squad_json: unknown; total_xp: number; total_cost: number; computed_at: string }>(
      'SELECT id, round, variant, squad_json, total_xp, total_cost, computed_at FROM suggested_squad ORDER BY computed_at DESC LIMIT 1'
    )
    return fallback[0] ?? null
  }
  return rows[0]
}

export type PlayerMatchResult = {
  method: 'positioned' | 'fallback'
  element: number
  position: string
  price: number
  squad_id: number
  name: string
  team_abbr: string
  xp: number
  low_sample: boolean
}

export async function matchPlayersByName(rawName: string, position?: string, round?: number): Promise<PlayerMatchResult | null> {
  // Normalize: strip FIFA UI truncation ("..."), remove diacritics, replace Unicode
  // lookalikes (e.g. Cyrillic і → i) so "Martínez", "Nuno Men...", "Cherkі" all match.
  const cleaned = rawName
    .trim()
    .replace(/\.{2,}$/, '')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip combining diacritics
    .replace(/[^\x00-\x7F]/g, 'i')   // non-ASCII lookalikes (Cyrillic і etc.) → i
    .toLowerCase()
    .trim()

  if (!cleaned) return null

  // $1 = substring match (full names), $2 = prefix match (truncated names)
  // Always try both; prefer substring hits in ORDER BY.
  const subLike = `%${cleaned}%`
  const prefLike = `${cleaned}%`

  // When position is known (from screenshot pitch layout / bench badges), filter to that
  // position first. Falls back to position-agnostic search if no rows are found.
  // Use $3 parameterized placeholder — never interpolate position into SQL.
  // $3 = position filter (when provided), $4 = round for projection join
  const effectiveRound = round ?? 1
  const posFilter = position ? 'AND p.position = $3' : ''
  const baseParams: unknown[] = [subLike, prefLike, effectiveRound]
  // When position filter is used: $1=subLike, $2=prefLike, $3=position, $4=round
  // Without position filter: $1=subLike, $2=prefLike, $3=round
  const posParams: unknown[] = position ? [subLike, prefLike, position, effectiveRound] : baseParams

  const tryMatch = async (extraFilter: string, params: unknown[], roundParam: string) => {
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
        COALESCE(proj.low_sample, false) AS low_sample
      FROM players p
      LEFT JOIN teams t ON t.squad_id = p.squad_id
      LEFT JOIN (SELECT element, xp, low_sample FROM projections WHERE round = ${roundParam}) proj ON proj.element = p.element
      WHERE (
        unaccent(lower(COALESCE(p.known_name, '')))                                              ILIKE $1
        OR unaccent(lower(COALESCE(p.last_name, '')))                                            ILIKE $1
        OR unaccent(lower(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')))) ILIKE $1
        OR unaccent(lower(COALESCE(p.known_name, '')))                                          ILIKE $2
        OR unaccent(lower(COALESCE(p.last_name, '')))                                            ILIKE $2
        OR unaccent(lower(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')))) ILIKE $2
      ) ${extraFilter}
      ORDER BY
        CASE
          WHEN unaccent(lower(COALESCE(p.known_name, '')))                                              ILIKE $1 THEN 0
          WHEN unaccent(lower(COALESCE(p.last_name, '')))                                              ILIKE $1 THEN 0
          WHEN unaccent(lower(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')))) ILIKE $1 THEN 0
          ELSE 1
        END,
        p.price DESC
      LIMIT 1
    `, params)
    return rows[0] ?? null
  }

  // Try position-filtered match first; fall back to position-agnostic if no result
  if (posFilter) {
    // With position: params are [subLike, prefLike, position, round] → round is $4
    const hit = await tryMatch(posFilter, posParams, '$4')
    if (hit) return { ...hit, method: 'positioned' as const }
  }
  // Without position: params are [subLike, prefLike, round] → round is $3
  const hit = await tryMatch('', baseParams, '$3')
  return hit ? { ...hit, method: 'fallback' as const } : null
}

export async function getTeamFdr(round: number) {
  return q<{ squad_id: number; lambda_posterior: number }>(
    'SELECT squad_id, lambda_posterior FROM team_fdr WHERE round = $1',
    [round]
  )
}

export async function getCurrentRoundId(): Promise<number> {
  const rows = await q<{ id: number }>(
    "SELECT id FROM rounds WHERE status = 'active' ORDER BY id LIMIT 1"
  )
  if (rows.length) return rows[0].id
  const all = await q<{ id: number }>('SELECT id FROM rounds ORDER BY id LIMIT 1')
  return all[0]?.id ?? 1
}

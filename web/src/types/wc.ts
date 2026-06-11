// Core domain types for wc-edge. Match wc.* Postgres schema exactly.

export interface Player {
  element: number
  first_name: string | null
  last_name: string | null
  known_name: string | null
  squad_id: number | null
  position: 'GK' | 'DEF' | 'MID' | 'FWD'
  price: number | null
  status: string | null
  percent_selected: number | null
  // Derived convenience field
  name: string
}

export interface Team {
  squad_id: number
  name: string
  abbr: string
  seed: number | null
  group_name: string | null
  is_active: boolean
}

export interface Round {
  id: number
  stage: string
  start_date: string | null
  end_date: string | null
  status: string
}

export interface Projection {
  element: number
  round: number
  xp: number
  p_play: number
  mf: number
  p_goal: number
  p_cs: number
  variance: number
  low_sample: boolean
}

export interface SquadPlayer {
  element: number
  name: string
  position: 'GK' | 'DEF' | 'MID' | 'FWD'
  price: number
  xp: number
  team_abbr: string
  squad_id: number
  low_sample: boolean
}

export interface SuggestedSquad {
  id: number
  round: number
  variant?: string
  squad_json: SquadPlayer[]
  total_xp: number
  total_cost: number
  computed_at: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type ChatAction =
  | { type: 'navigate'; path: '/squad' | '/transfers' | '/captain' | '/boosters' | '/live' }
  | { type: 'set_captain'; name: string }
  | { type: 'set_vice_captain'; name: string }
  | { type: 'suggest_transfers' }
  | { type: 'optimise_xi' }
  | { type: 'show_tip'; page: 'squad' | 'transfers' | 'captain' | 'boosters' | 'live' }

export interface Fixture {
  round: number
  stage: string
  date: string | null
  homeTeamId: number
  homeTeamName: string
  awayTeamId: number
  awayTeamName: string
  kickoff: string | null
}

export interface TransferCard {
  element: number
  name: string
  position: 'GK' | 'DEF' | 'MID' | 'FWD'
  price: number
  xp: number
  team_abbr: string
  squad_id: number
  low_sample: boolean
}

export interface TransferSuggestion {
  out: TransferCard
  in: TransferCard
  xp_gain: number
  price_delta: number  // positive = frees budget
}

export interface TransferSuggestResponse {
  transfers: TransferSuggestion[]
}

export interface TeamFdr {
  squad_id: number
  fdr: number  // 1-5, 1=easiest (highest attack lambda / most likely to score)
}

// Squad store shape (mirrors squadStore.ts)
export type SquadState = {
  squad: SquadPlayer[]
  captain: number | null   // element id
  budget: number
}

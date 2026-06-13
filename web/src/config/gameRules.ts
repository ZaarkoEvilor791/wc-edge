// Squad composition: total players required per position
export const POS_REQUIRED: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 }

// XI starters per position (bench = POS_REQUIRED - POS_COUNT)
export const POS_COUNT: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 }

export const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'] as const

export const TOTAL_ROUNDS = 8

// Complete FIFA WC 2026 Fantasy scoring rules — single source of truth for frontend + AI system prompt.
// Mirrors engine/engine/config.py. Keep both in sync when rules change.
export const SCORING = {
  APPEARANCE_PART: 1,            // < 60 min played
  APPEARANCE_FULL: 2,            // ≥ 60 min played

  GOAL_PTS: { GK: 9, DEF: 7, MID: 6, FWD: 5 },
  CLEAN_SHEET_PTS: { GK: 5, DEF: 5, MID: 1, FWD: 0 },
  ASSIST: 3,
  SAVES_PER_PT: 3,               // GK: +1 per 3 saves
  PENALTY_SAVE: 3,               // GK only
  GOAL_CONCEDED_PER: -1,         // GK/DEF: per goal conceded after the 1st

  TACKLES_PER_PT: 3,             // MID: +1 per 3 tackles
  CHANCES_PER_PT: 2,             // MID: +1 per 2 chances created
  SHOTS_ON_TARGET_PER_PT: 2,     // FWD: +1 per 2 shots on target

  YELLOW_CARD: -1,
  RED_CARD: -2,
  OWN_GOAL: -2,
  PENALTY_WON: 2,
  PENALTY_CONCEDED: -1,

  FREE_KICK_GOAL_BONUS: 1,       // extra point when goal is scored from a direct free kick
  SCOUTING_BONUS: 2,             // >4 pts scored AND <5% ownership
  QUALIFICATION_BOOSTER: 2,      // per XI player who advances to next round (chip mechanic, R32+ only)
} as const

// Free transfers per tournament phase. Keep in sync with engine/config.py.
export const FREE_TRANSFERS_BY_PHASE: Record<string, number> = {
  group: 2, r32: 6, r16: 4, qf: 4, sf: 5, final: 6,
}

// Squad composition: total players required per position
export const POS_REQUIRED: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 }

// XI starters per position (bench = POS_REQUIRED - POS_COUNT)
export const POS_COUNT: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 }

export const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'] as const

export const TOTAL_ROUNDS = 8

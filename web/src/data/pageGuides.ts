export type GuidePage = 'squad' | 'transfers' | 'captain' | 'boosters' | 'live'

export interface PageGuide {
  title: string
  actions: string[]
  path: string
}

export const PAGE_GUIDES: Record<GuidePage, PageGuide> = {
  squad: {
    title: 'Squad',
    actions: [
      'Tap a player to view their stats or start a positional swap',
      'Green ring = eligible swap partner · tap to complete swap',
      'Squad: 2 GK, 5 DEF, 5 MID, 3 FWD — XI is top 11 by position order',
    ],
    path: '/squad',
  },
  transfers: {
    title: 'Transfers',
    actions: [
      'Tap a squad player to transfer them out',
      'Pick a replacement from the player pool',
      'Smart suggest ranks AI-recommended swaps automatically',
    ],
    path: '/transfers',
  },
  captain: {
    title: 'Captain Picker',
    actions: [
      'Players ranked by projected xP this round',
      'Tap a row to set as captain · tap VC for vice-captain',
    ],
    path: '/captain',
  },
  boosters: {
    title: 'Boosters',
    actions: [
      'Each card shows the best recommended round to play',
      'Tap a chip card to activate it for that round',
    ],
    path: '/boosters',
  },
  live: {
    title: 'Live',
    actions: [
      'Live scores and stats for the current round',
      'Informational only — no actions needed here',
    ],
    path: '/live',
  },
}

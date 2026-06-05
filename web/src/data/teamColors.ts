export type KitPattern = 'solid' | 'stripes' | 'hoops'

export interface TeamKit {
  primary: string
  secondary: string
  pattern: KitPattern
}

export const TEAM_COLORS: Record<string, TeamKit> = {
  ARG: { primary: '#75AADB', secondary: '#FFFFFF', pattern: 'stripes' },
  AUS: { primary: '#002B5C', secondary: '#FFD700', pattern: 'solid' },
  BEL: { primary: '#CC0000', secondary: '#000000', pattern: 'solid' },
  BRA: { primary: '#FFDF00', secondary: '#009C3B', pattern: 'solid' },
  CMR: { primary: '#007A5E', secondary: '#CC0000', pattern: 'solid' },
  CAN: { primary: '#CC0000', secondary: '#FFFFFF', pattern: 'solid' },
  CIV: { primary: '#F77F00', secondary: '#009A44', pattern: 'solid' },
  COL: { primary: '#FCD116', secondary: '#003087', pattern: 'solid' },
  CRO: { primary: '#CC0000', secondary: '#FFFFFF', pattern: 'hoops' },
  DEN: { primary: '#C8102E', secondary: '#FFFFFF', pattern: 'solid' },
  ECU: { primary: '#FFD100', secondary: '#034694', pattern: 'solid' },
  EGY: { primary: '#CC0000', secondary: '#FFFFFF', pattern: 'solid' },
  ENG: { primary: '#FFFFFF', secondary: '#CC0000', pattern: 'solid' },
  ESP: { primary: '#C8102E', secondary: '#FFB81C', pattern: 'solid' },
  FRA: { primary: '#002395', secondary: '#FFFFFF', pattern: 'solid' },
  GER: { primary: '#FFFFFF', secondary: '#000000', pattern: 'solid' },
  GHA: { primary: '#FFFFFF', secondary: '#000000', pattern: 'solid' },
  HON: { primary: '#003DA5', secondary: '#FFFFFF', pattern: 'solid' },
  IRN: { primary: '#239F40', secondary: '#FFFFFF', pattern: 'solid' },
  ITA: { primary: '#003DA5', secondary: '#FFFFFF', pattern: 'solid' },
  JAM: { primary: '#000000', secondary: '#FFB81C', pattern: 'solid' },
  JPN: { primary: '#003087', secondary: '#FFFFFF', pattern: 'solid' },
  JOR: { primary: '#007A3D', secondary: '#FFFFFF', pattern: 'solid' },
  KOR: { primary: '#C8102E', secondary: '#FFFFFF', pattern: 'solid' },
  MAR: { primary: '#C1121F', secondary: '#006233', pattern: 'solid' },
  MEX: { primary: '#006847', secondary: '#FFFFFF', pattern: 'solid' },
  MLI: { primary: '#14B53A', secondary: '#FFD700', pattern: 'solid' },
  NED: { primary: '#FF6600', secondary: '#FFFFFF', pattern: 'solid' },
  NGA: { primary: '#008751', secondary: '#FFFFFF', pattern: 'solid' },
  NZL: { primary: '#FFFFFF', secondary: '#000000', pattern: 'solid' },
  PAN: { primary: '#CC0000', secondary: '#FFFFFF', pattern: 'solid' },
  PAR: { primary: '#CC0000', secondary: '#FFFFFF', pattern: 'stripes' },
  POL: { primary: '#FFFFFF', secondary: '#DC143C', pattern: 'solid' },
  POR: { primary: '#C8102E', secondary: '#006600', pattern: 'solid' },
  QAT: { primary: '#862633', secondary: '#FFFFFF', pattern: 'solid' },
  RSA: { primary: '#007A4D', secondary: '#FFB81C', pattern: 'solid' },
  SAU: { primary: '#006C35', secondary: '#FFFFFF', pattern: 'solid' },
  SCO: { primary: '#003380', secondary: '#FFFFFF', pattern: 'solid' },
  SEN: { primary: '#FFFFFF', secondary: '#00853F', pattern: 'solid' },
  SRB: { primary: '#C6363C', secondary: '#003DA5', pattern: 'solid' },
  SUI: { primary: '#CC0000', secondary: '#FFFFFF', pattern: 'solid' },
  TUN: { primary: '#CC0000', secondary: '#FFFFFF', pattern: 'solid' },
  TUR: { primary: '#CC0000', secondary: '#FFFFFF', pattern: 'solid' },
  UKR: { primary: '#FFD700', secondary: '#005BBB', pattern: 'solid' },
  URU: { primary: '#5BA4CF', secondary: '#FFFFFF', pattern: 'solid' },
  USA: { primary: '#002868', secondary: '#FFFFFF', pattern: 'solid' },
  UZB: { primary: '#1EB53A', secondary: '#FFFFFF', pattern: 'solid' },
  VEN: { primary: '#CF142B', secondary: '#FFFFFF', pattern: 'solid' },
  WAL: { primary: '#C8102E', secondary: '#FFFFFF', pattern: 'solid' },
}

export const DEFAULT_KIT: TeamKit = { primary: '#334155', secondary: '#64748B', pattern: 'solid' }

export function getKit(teamAbbr: string): TeamKit {
  return TEAM_COLORS[teamAbbr] ?? DEFAULT_KIT
}

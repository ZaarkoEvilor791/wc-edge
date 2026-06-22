import type { TransferCard, TransferSuggestion } from '../../src/types/wc'

export function suggestTransfers(
  squad: TransferCard[],
  pool: TransferCard[],   // all players, sorted xp DESC
  budget: number,
  maxPerCountry = 3,
): TransferSuggestion[] {
  const currentSquad = squad.map((p) => p.element)
  const squadSet = new Set(currentSquad)
  let currentCost = squad.reduce((s, p) => s + p.price, 0)
  const cardByEl = new Map<number, TransferCard>(squad.map((p) => [p.element, p]))
  const countryCounts = new Map<string, number>()
  for (const p of squad) countryCounts.set(p.team_abbr, (countryCounts.get(p.team_abbr) ?? 0) + 1)

  const transfers: TransferSuggestion[] = []

  for (let i = 0; i < 6; i++) {
    let best: { outEl: number; inCard: TransferCard; gain: number; newCost: number } | null = null

    for (const outEl of currentSquad) {
      const outCard = cardByEl.get(outEl)!

      for (const inCard of pool) {
        if (squadSet.has(inCard.element)) continue
        if (inCard.position !== outCard.position) continue
        const newCost = currentCost - outCard.price + inCard.price
        if (newCost > budget) continue
        const gain = inCard.xp - outCard.xp
        if (gain <= 0) continue
        // Country limit: only applies when bringing in from a different team
        if (inCard.team_abbr !== outCard.team_abbr &&
            (countryCounts.get(inCard.team_abbr) ?? 0) >= maxPerCountry) continue
        if (!best || gain > best.gain) best = { outEl, inCard, gain, newCost }
      }
    }

    if (!best) break

    const outCard = cardByEl.get(best.outEl)!
    transfers.push({
      out: outCard,
      in: best.inCard,
      xp_gain: best.gain,
      price_delta: outCard.price - best.inCard.price,
    })

    const idx = currentSquad.indexOf(best.outEl)
    currentSquad[idx] = best.inCard.element
    squadSet.delete(best.outEl)
    squadSet.add(best.inCard.element)
    currentCost = best.newCost
    cardByEl.delete(best.outEl)
    cardByEl.set(best.inCard.element, best.inCard)
    // Update country counts for the applied transfer
    countryCounts.set(outCard.team_abbr, (countryCounts.get(outCard.team_abbr) ?? 1) - 1)
    countryCounts.set(best.inCard.team_abbr, (countryCounts.get(best.inCard.team_abbr) ?? 0) + 1)
  }

  return transfers
}

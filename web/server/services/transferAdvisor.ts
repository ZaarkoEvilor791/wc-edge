import type { TransferCard, TransferSuggestion } from '../../src/types/wc'

export function suggestTransfers(
  squad: TransferCard[],
  pool: TransferCard[],   // all players, sorted xp DESC
  budget: number,
): TransferSuggestion[] {
  const currentSquad = squad.map((p) => p.element)
  const squadSet = new Set(currentSquad)
  let currentCost = squad.reduce((s, p) => s + p.price, 0)
  const cardByEl = new Map<number, TransferCard>(squad.map((p) => [p.element, p]))

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
  }

  return transfers
}

export interface RechargePack {
  id: string;
  name: string;
  amountInr: number; // rupees, matches transactions.amount_inr
  tokens: number;
}

export const RECHARGE_PACKS: RechargePack[] = [
  { id: 'starter', name: 'Starter Pack', amountInr: 10, tokens: 20 },
  { id: 'popular', name: 'Popular Pack', amountInr: 49, tokens: 110 },
  { id: 'pro', name: 'Pro Pack', amountInr: 199, tokens: 500 },
];

export function findPackById(id: string): RechargePack | undefined {
  return RECHARGE_PACKS.find((p) => p.id === id);
}

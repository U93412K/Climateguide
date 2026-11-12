export const RESOURCES = ['food', 'water', 'medicine'];
export const UNITS = { food: 'kg', water: 'L', medicine: 'kits' };

const need = (people, a) => ({
  food: Math.ceil(people * a.foodKgPerPersonPerDay * a.planningDays),
  water: Math.ceil(people * a.waterLPerPersonPerDay * a.planningDays),
  medicine: Math.ceil(people * a.medicineKitsPerPerson),
});

/**
 * Food     = affected * foodKgPerPersonPerDay  * planningDays
 * Water    = affected * waterLPerPersonPerDay  * planningDays
 * Medicine = affected * medicineKitsPerPerson
 * Shortage = max(0, demand - local stock)
 * (Set planningDays = 1 to match the per-person formulas in the spec literally.)
 */
export function estimateDemand(exposure, region, assumptions) {
  if (!exposure?.available) {
    return { regionCode: region.code, available: false, reason: 'No affected-population data: demand cannot be estimated.' };
  }
  const people = exposure.totals.expected;
  const required = need(people, assumptions);
  const upperBound = need(exposure.totals.max, assumptions);
  const local = { ...region.localInventory };
  const shortage = Object.fromEntries(RESOURCES.map((r) => [r, Math.max(0, required[r] - (local[r] ?? 0))]));
  const shortageUpperBound = Object.fromEntries(RESOURCES.map((r) => [r, Math.max(0, upperBound[r] - (local[r] ?? 0))]));
  return {
    regionCode: region.code, available: true, partial: exposure.partial, affectedExpected: people,
    affectedRange: { min: exposure.totals.min, max: exposure.totals.max },
    planningDays: assumptions.planningDays, required, upperBound, local, shortage, shortageUpperBound,
    units: UNITS,
  };
}

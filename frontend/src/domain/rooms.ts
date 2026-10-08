// Where a room is, from its name: "3-114" is block 3, floor 1 (the first digit
// after the dash). UTM's exceptions: A-01…A-03 are on the first floor, D-01…D-04
// in the basement, and the short names (3-3, 5-1, 6-2) on the second floor.

/** -1 = basement, 0 = ground floor, then the floor number; null when the name does not say. */
export function floorOf(name: string): number | null {
  const n = name.trim().toUpperCase();
  if (/^A-0\d/.test(n)) return 1;
  if (/^D-0\d/.test(n)) return -1;
  const m = /^[^-]+-(\d+)/.exec(n);
  if (!m) return null;
  return m[1].length === 1 ? 2 : Number(m[1][0]);
}

import { describe, expect, it } from 'vitest';
import { floorOf } from './rooms';

describe('floorOf', () => {
  it('reads the floor as the first digit after the dash', () => {
    expect(floorOf('3-114')).toBe(1);
    expect(floorOf('3-405')).toBe(4);
    expect(floorOf('3-722')).toBe(7);
  });
  it('knows UTM’s exceptions', () => {
    expect(floorOf('A-02')).toBe(1);
    expect(floorOf('D-04')).toBe(-1);
    expect(floorOf('6-2')).toBe(2);
    expect(floorOf('3-3 ')).toBe(2);
  });
  it('gives up on names without a dash', () => {
    expect(floorOf('501A')).toBeNull();
    expect(floorOf('Sala de sport')).toBeNull();
  });
});

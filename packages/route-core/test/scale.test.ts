import { describe, expect, it } from 'vitest';
import { ScaleFactorTable } from '../src/scale.js';

describe('ScaleFactorTable', () => {
  it('defaults to 1.0 with nothing learned', () => {
    const table = new ScaleFactorTable();
    expect(table.get(48.13, 11.57)).toBe(1);
    expect(table.correctedRequest(48.13, 11.57, 8000)).toBe(8000);
  });

  it('adopts the first observed ratio and converges via EWMA', () => {
    const table = new ScaleFactorTable(0.3);
    // Engine realizes 1.3× what we requested in this area.
    table.observe(48.13, 11.57, 8000, 10_400);
    expect(table.get(48.13, 11.57)).toBeCloseTo(1.3, 5);
    // Corrected request now shrinks the engine parameter.
    expect(table.correctedRequest(48.13, 11.57, 8000)).toBeCloseTo(8000 / 1.3, 3);
    // Further consistent observations keep it stable.
    table.observe(48.13, 11.57, 6154, 8000);
    expect(table.get(48.13, 11.57)).toBeCloseTo(1.3, 2);
  });

  it('keeps areas independent', () => {
    const table = new ScaleFactorTable();
    table.observe(48.13, 11.57, 8000, 10_400); // Munich
    expect(table.get(59.33, 18.06)).toBe(1); // Stockholm untouched
  });

  it('ignores invalid observations', () => {
    const table = new ScaleFactorTable();
    table.observe(48.13, 11.57, 0, 8000);
    table.observe(48.13, 11.57, 8000, 0);
    expect(table.get(48.13, 11.57)).toBe(1);
  });

  it('round-trips through JSON', () => {
    const table = new ScaleFactorTable();
    table.observe(48.13, 11.57, 8000, 10_400);
    const restored = ScaleFactorTable.fromJSON(table.toJSON());
    expect(restored.get(48.13, 11.57)).toBeCloseTo(1.3, 5);
  });
});

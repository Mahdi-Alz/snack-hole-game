import { describe, expect, it } from 'vitest';
import { OBJECT_TYPES } from '../src/config/objects';
import { BUILDERS } from '../src/render/props';

describe('prop models', () => {
  it('every object type has a model builder that makes a non-empty mesh', () => {
    const missing = OBJECT_TYPES.map((t) => t.id).filter((id) => typeof BUILDERS[id] !== 'function');
    expect(missing).toEqual([]);
    for (const t of OBJECT_TYPES) {
      const g = BUILDERS[t.id]();
      expect(g.getAttribute('position').count, t.id).toBeGreaterThan(0);
      g.dispose();
    }
  });
});

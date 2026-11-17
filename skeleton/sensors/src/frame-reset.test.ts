import { describe, expect, it } from 'vitest';
import { invalidates, type FrameResetCause } from './frame-reset';

const CAUSES: readonly FrameResetCause[] = [
  'hidden',
  'blur',
  'pagehide',
  'restart',
  'frame_change',
];

describe('invalidates (Req 5.17, D9)', () => {
  it('lets every cause invalidate a Relative-frame reference', () => {
    expect(CAUSES.map((cause) => invalidates('relative', cause))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('lets only frame_change invalidate an Absolute-frame reference', () => {
    expect(CAUSES.filter((cause) => invalidates('absolute', cause))).toEqual(['frame_change']);
  });
});

// The registry: the tools in the order `tools/list` returns them, which never changes.

import type { ToolDefinition } from './tool-definition.ts';
import { FIX_FROM_BEARINGS } from './tools/fix-from-bearings.ts';
import { LOCAL_OFFSET } from './tools/local-offset.ts';
import { MAGNETIC_DECLINATION } from './tools/magnetic-declination.ts';

export const TOOLS: readonly ToolDefinition[] = [
  FIX_FROM_BEARINGS,
  MAGNETIC_DECLINATION,
  LOCAL_OFFSET,
];

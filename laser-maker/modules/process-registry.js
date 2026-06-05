// =============================================================================
// process-registry.js — fabrication process definitions (single source of truth)
// =============================================================================

export const PROCESS_DEFINITIONS = {
  mainCut: {
    label: 'Main Cut',
    prefix: 'MAIN CUT',
    stroke: '#0000FF',
    strokeWidth: 1,
    fill: 'none',
    locked: true,
  },
  fold: {
    label: 'Fold / Score',
    prefix: 'FOLD',
    stroke: '#FF0000',
    strokeWidth: 1,
    fill: 'none',
    locked: true,
  },
  finalCut: {
    label: 'Final Cut',
    prefix: 'FINAL CUT',
    stroke: '#00FF00',
    strokeWidth: 1,
    fill: 'none',
    locked: true,
  },
  etch: {
    label: 'Etch',
    prefix: 'ETCH',
    color: '#000000',
    locked: false,
    colorLocked: true,
  },
  free: {
    label: 'Free',
    prefix: 'FREE',
    locked: false,
    colorLocked: false,
  },
};

// Returns the effective fill/stroke/strokeWidth for rendering and export.
// Process type is the source of truth for locked types.
export function resolveAppearance(sh) {
  const pt = sh.processType ?? 'free';
  const def = PROCESS_DEFINITIONS[pt] ?? PROCESS_DEFINITIONS.free;

  if (def.locked) {
    return {
      fill: def.fill,
      stroke: def.stroke,
      strokeWidth: def.strokeWidth,
    };
  }

  if (pt === 'etch') {
    // Color locked to black; stroke/fill on-off and strokeWidth are user-controlled.
    // Stored values are already normalized to '#000000' or 'none' when etch was assigned.
    return {
      fill: sh.fill ?? 'none',
      stroke: sh.stroke ?? 'none',
      strokeWidth: sh.strokeWidth ?? 1,
    };
  }

  // free — pass through stored appearance unchanged
  return {
    fill: sh.fill ?? 'none',
    stroke: sh.stroke ?? 'none',
    strokeWidth: sh.strokeWidth ?? 1,
  };
}

// Normalize stored fill/stroke values when switching to a new process type.
// Ensures etch shapes always store '#000000' or 'none', never arbitrary colors.
export function normalizeForProcess(sh, pt) {
  if (pt === 'etch') {
    sh.fill   = (sh.fill   && sh.fill   !== 'none') ? '#000000' : 'none';
    sh.stroke = (sh.stroke && sh.stroke !== 'none') ? '#000000' : 'none';
  }
}

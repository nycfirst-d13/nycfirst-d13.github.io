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
    label: 'Free Appearance',
    prefix: 'FREE',
    locked: false,
    colorLocked: false,
  },
};

// Returns the effective fill/stroke/strokeWidth for rendering and export.
// Process type is the source of truth for locked types.
// For fold shapes with foldDash.enabled, also returns strokeDasharray/strokeDashoffset/strokeLinecap.
export function resolveAppearance(sh) {
  const pt = sh.processType ?? 'free';
  const def = PROCESS_DEFINITIONS[pt] ?? PROCESS_DEFINITIONS.free;

  if (def.locked) {
    const result = {
      fill: def.fill,
      stroke: def.stroke,
      strokeWidth: def.strokeWidth,
    };
    if (pt === 'fold' && sh.foldDash?.enabled) {
      const fd = sh.foldDash;
      const dashLen = fd.dashLen ?? 8;
      const gapLen  = fd.gapLen  ?? 4;
      result.strokeDasharray  = `${dashLen} ${gapLen}`;
      result.strokeDashoffset = fd.align === 'centered' ? -(dashLen / 2) : 0;
      result.strokeLinecap    = 'butt';
    }
    return result;
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

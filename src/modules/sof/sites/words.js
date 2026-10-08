// The few words the site profiles share, with no imports so that any module can use them without an import cycle.

/** True when the profile has no magnetic variation of its own (generic.js's stand-in of 0). */
export const magVarUnknown = (profile) => String(profile?.magVarDegE?.source ?? '').startsWith('unknown');

/** "9° E variation" ("2.9° W variation" for a West one), or, when the base has none set, a plain statement that 0° is only a stand-in. */
export const magVarWords = (profile) => {
  if (magVarUnknown(profile)) return 'magnetic variation not set for this base, shown as 0° (estimate)';
  const v = profile.magVarDegE.value;
  return `${Math.abs(v)}° ${v < 0 ? 'W' : 'E'} variation`;
};

/** The words for a feed with no source: "Lightning: no source for this base, can't tell". Shown in amber with ⚠, never a tick. */
export const noSourceWords = (label) => `${label}: no source for this base, can't tell`;

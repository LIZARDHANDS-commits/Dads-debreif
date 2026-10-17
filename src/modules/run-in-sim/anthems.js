// The anthems for the flyover (RS-25; Dad, 17 Oct 2026: "national anthem starts playing ... us or Canada as options"; his
// card: the browser plays the tune itself, no recording). Each melody is a list of notes, [MIDI pitch, beats], from its
// first note to its last; anthem-player.js plays it as simple tones, scaled so the whole tune lasts the set length (the
// tempo follows the length). Plain values only.
//
// Sources (both melodies are public domain):
//  - The Star-Spangled Banner (John Stafford Smith's melody): Jack Campin's public-domain ABC transcription, X:26 in
//    "americanfifeopus.abc" (music21's corpus, miscFolk), in D major, its first half sung twice as the anthem is. Its opening
//    has the same intervals as the anthem-scores note data's (from a public-domain Wikimedia Commons MIDI, in B flat).
//  - O Canada (Calixa Lavallée's melody): its FIRST LINE ("O Canada! Our home and native land!") from the anthem-scores
//    note data (from the public-domain Wikimedia Commons MIDI "O_Canada.mid"), in F major. **THE REST IS WRITTEN FROM
//    MEMORY AND NOT CHECKED** (no sheet could be reached from here); the Setup says so until Dad or Patrick checks it by
//    ear (plan.md Step 8). Each line below is marked.

/** One line of notes: [MIDI pitch, beats]. */
const n = (...pairs) => pairs;

/** O Canada, F major, 4/4. */
const O_CANADA = Object.freeze([
  // "O Canada! Our home and native land!" (sourced: anthem-scores, from Wikimedia Commons' public-domain MIDI)
  ...n([69, 2], [72, 1.75], [72, 0.25], [65, 3], [67, 1], [69, 1], [70, 1], [72, 1], [74, 1], [67, 4]),
  // "True patriot love in all thy sons command." (from memory, unchecked)
  ...n([69, 2], [71, 1.75], [71, 0.25], [72, 3], [74, 1], [76, 1], [77, 1], [79, 1], [79, 1], [72, 4]),
  // "With glowing hearts we see thee rise," (from memory, unchecked)
  ...n([69, 1], [69, 1.5], [67, 0.5], [65, 1], [64, 1], [65, 1.5], [67, 0.5], [69, 2]),
  // "The True North strong and free!" (from memory, unchecked)
  ...n([67, 1], [67, 1.5], [65, 0.5], [64, 1], [62, 1], [67, 3]),
  // "From far and wide, O Canada," (from memory, unchecked)
  ...n([60, 1], [62, 1], [64, 1], [65, 2], [67, 1], [69, 1.5], [70, 0.5], [72, 2]),
  // "We stand on guard for thee." (from memory, unchecked)
  ...n([72, 1], [74, 1.5], [72, 0.5], [70, 1], [69, 1], [67, 3]),
  // "God keep our land glorious and free!" (from memory, unchecked)
  ...n([72, 2], [73, 1], [74, 1], [70, 2], [72, 1], [74, 1], [76, 1], [77, 3]),
  // "O Canada, we stand on guard for thee." (from memory, unchecked)
  ...n([69, 2], [72, 1.75], [72, 0.25], [65, 3], [67, 1], [69, 1], [70, 1], [72, 2], [67, 2]),
  // "O Canada, we stand on guard for thee." (from memory, unchecked)
  ...n([69, 2], [72, 1.75], [72, 0.25], [77, 3], [74, 1], [72, 1.5], [70, 0.5], [67, 1], [69, 1], [65, 4]),
].map(Object.freeze));

/** The Star-Spangled Banner, D major, 3/4 (Campin's ABC, eighth = 0.5 beat; key D: F and C sharp). */
const FIRST_HALF = n(
  [69, 0.75], [66, 0.25], // "O say" (A>F)
  [62, 1], [66, 1], [69, 1], [74, 2], [78, 0.75], [76, 0.25], // "can you see by the" (D2 F2 A2 | d4 f>e)
  [74, 1], [66, 1], [68, 1], [69, 2], [69, 1], // "dawn's early light what so" (d2 F2 ^G2 | A4 A2)
  [78, 1.5], [76, 0.5], [74, 1], [73, 2], [71, 0.5], [73, 0.5], // "proudly we hailed at the" (f3 e d2 | c4 Bc)
  [74, 1], [74, 1], [69, 1], [66, 1], [62, 1], // "twilight's last gleaming" (d2 d2 A2 | F2 D2)
);
const STAR_SPANGLED = Object.freeze([
  ...FIRST_HALF, // "O say can you see ... twilight's last gleaming"
  ...FIRST_HALF, // "Whose broad stripes and bright stars ... gallantly streaming"
  ...n(
    [78, 0.75], [78, 0.25], [78, 1], [79, 1], [81, 1], [81, 2], // "And the rockets' red glare" (f>f | f2 g2 a2 | a4)
    [79, 0.75], [78, 0.25], [76, 1], [78, 1], [79, 1], [79, 2], [79, 1], // "the bombs bursting in air, gave" (g>f | e2 f2 g2 | g4 g2)
    [78, 1.5], [76, 0.5], [74, 1], [73, 2], [71, 0.75], [73, 0.25], // "proof through the night that our" (f3 e d2 | c4 B>c)
    [74, 1], [66, 1], [68, 1], [69, 2], [69, 1], // "flag was still there. O" (d2 F2 ^G2 | A4 A2)
    [74, 1], [74, 1], [74, 0.5], [73, 0.5], [71, 1], [71, 1], [71, 1], // "say does that star-spangled" (d2 d2 dc | B2 B2 B2)
    [76, 1], [79, 0.5], [78, 0.5], [76, 0.5], [74, 0.5], [74, 1], [73, 1], // "banner yet wave" (e2 gf ed | d2 c2)
    [69, 0.75], [69, 0.25], [74, 1.5], [76, 0.5], [78, 0.5], [79, 0.5], [81, 2], // "O'er the land of the free" (A>A | d3 e fg | a4)
    [74, 0.75], [76, 0.25], [78, 1.5], [79, 0.5], [76, 1], [74, 3], // "and the home of the brave" (d>e | f3 g e2 | d6)
  ),
].map(Object.freeze));

/**
 * The anthems: their names, last words (the card's "last note"), melodies, default lengths (ESTIMATES: about how long
 * each is sung at a ceremony, settable under More), and whether the melody is all from a source.
 */
export const ANTHEMS = Object.freeze({
  canada: Object.freeze({ id: 'canada', label: 'O Canada', country: 'Canada', lastWords: '…we stand on guard for thee', notes: O_CANADA, defaultSec: 70, checked: false }),
  us: Object.freeze({ id: 'us', label: 'The Star-Spangled Banner', country: 'US', lastWords: '…home of the brave', notes: STAR_SPANGLED, defaultSec: 90, checked: true }),
});

/** The total beats of an anthem's melody. */
export const anthemBeats = (id) => ANTHEMS[id].notes.reduce((sum, [, beats]) => sum + beats, 0);

/**
 * The anthem's notes as times, scaled so the whole tune lasts lengthSec: [{ t (s from its start), dur (s), freq (Hz) }].
 * Equal temperament from A4 = 440 Hz (standard tuning).
 */
export function anthemSchedule(id, lengthSec) {
  const spb = lengthSec / anthemBeats(id); // seconds per beat: the tempo follows the length
  const out = [];
  let beat = 0;
  for (const [midi, beats] of ANTHEMS[id].notes) {
    out.push({ t: beat * spb, dur: beats * spb, freq: 440 * 2 ** ((midi - 69) / 12) });
    beat += beats;
  }
  return out;
}

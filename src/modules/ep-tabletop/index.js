// The EP Tabletop (docs/modules/ep-tabletop/spec.md): the student's screen (screen.js: the CT-156 front cockpit over Moose Jaw, the
// A-A-B-C-D-E-F step track, the situation and what the instructor has revealed, with the console behind an Instructor switch) or the
// instructor's phone (phone.js: the console, opened by the QR code the "Instructor's phone" button shows; plan Step 2, EP-8 to EP-10).
// mount() picks which from the address: the QR code's address (#/ep-tabletop?console&s=..&k=..) opens the phone's console, anything else
// the student's screen. Everything they start runs on the shell's scheduler and listeners, so the shell stops it all when the module closes.
// Split into these three files in plan Step 3, as plain moves.
import { createSettings } from '../../storage/settings.js';
import { RELAY_ADDRESS } from '../../wx/relay.js';
import { readConsoleHash } from './link.js';
import { mountScreen } from './screen.js';
import { mountPhone } from './phone.js';

const STYLESHEET = new URL('./ep-tabletop.css', import.meta.url).href;
/** The one version number of the whole tool (rule book, Git and names), shown in the bar. */
const VERSION = 'V2.423';
/**
 * The module's own settings: `relay`, the relay the phone link goes through, starting at the shared address (src/wx/relay.js). No box
 * on screen yet; a local stand-in relay for testing is set in the browser's storage (ooda:v1:ep-tabletop:settings).
 */
const SETTINGS_DEFAULTS = Object.freeze({ relay: RELAY_ADDRESS });

function addStylesheet() {
  const sheet = document.createElement('link');
  sheet.rel = 'stylesheet';
  sheet.href = STYLESHEET;
  document.head.append(sheet);
  return sheet;
}

function mount(root, app) {
  const relay = createSettings(app.storage, SETTINGS_DEFAULTS).get().relay;
  const phone = readConsoleHash(globalThis.location?.hash);
  const ctx = { relay, version: VERSION, addStylesheet };
  return phone ? mountPhone(root, app, phone, ctx) : mountScreen(root, app, ctx);
}

export default { id: 'ep-tabletop', title: 'EP Tabletop', mount };

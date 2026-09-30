// Saving a file to the computer and opening one from it, for every module
// (the debrief file R17, Turn Sim and Traffic setups). See specs/SPEC-storage.md.
//
// Nothing here reads what's in a file: the module that owns the format checks
// it (for example flight-data's readDebriefFile). This only moves text in and
// out, and refuses a file that is too big before reading any of it.

const MAX_NAME_CHARS = 120;
// Characters no file system accepts in a name, and control characters.
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

export class FileTooBigError extends Error {
  constructor(file, maxBytes) {
    super(`${file.name} is too big to open (${size(file.size)}; the limit is ${size(maxBytes)}).`);
    this.name = 'FileTooBigError';
    this.file = file.name;
  }
}

function size(bytes) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} kB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A name every system can save: no path, no reserved characters, not empty. */
export function safeFileName(name, fallback = 'download.txt') {
  const cleaned = String(name ?? '').replace(UNSAFE, '-').trim().replace(/^\.+/, '').slice(0, MAX_NAME_CHARS);
  return cleaned || fallback;
}

/**
 * Saves `text` as a file called `name` through the browser's normal download.
 * `type` is its media type, such as 'application/json'.
 */
export function downloadText(text, name, { type = 'text/plain', doc = globalThis.document } = {}) {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = doc.createElement('a');
  link.href = url;
  link.download = safeFileName(name);
  link.hidden = true;
  doc.body.append(link); // some browsers only download from a link on the page
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers; a minute is plenty.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Reads picked or dropped files as text: [{ name, size, text }] in the same
 * order. Throws FileTooBigError, reading nothing, if any is over `maxBytes`.
 */
export async function readTextFiles(files, { maxBytes = Infinity } = {}) {
  const list = [...files];
  const big = list.find((file) => file.size > maxBytes);
  if (big) throw new FileTooBigError(big, maxBytes);
  return Promise.all(list.map(async (file) => ({ name: file.name, size: file.size, text: await file.text() })));
}

/**
 * Opens the browser's file picker and reads what's chosen (readTextFiles).
 * Resolves to [] if the picker is closed without choosing. Call it from a
 * click, since browsers only open a picker in answer to one.
 */
export function pickTextFiles({ accept = '', multiple = false, maxBytes = Infinity, doc = globalThis.document } = {}) {
  return new Promise((resolve, reject) => {
    const input = doc.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;
    const done = () => input.remove();
    input.addEventListener('change', () => {
      done();
      readTextFiles(input.files, { maxBytes }).then(resolve, reject);
    });
    input.addEventListener('cancel', () => {
      done();
      resolve([]);
    });
    doc.body.append(input);
    input.click();
  });
}

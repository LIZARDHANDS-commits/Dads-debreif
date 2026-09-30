// A tiny server for the built site that a test can change while it runs, for
// things the preview server can't do (like publishing a "new version" of sw.js,
// which the browser fetches without going through Playwright's routing).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

// rewrite(path, body) may change a file's text before it's sent.
export async function serveDist({ dir = 'dist', rewrite = (path, body) => body } = {}) {
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(dir, path));
    if (!file.startsWith(normalize(dir))) {
      res.writeHead(403).end();
      return;
    }
    try {
      let body = await readFile(file);
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      if (type.startsWith('text/')) body = rewrite(path, body.toString('utf8'));
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

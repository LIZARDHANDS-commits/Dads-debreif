// Home screen: one card per module, plus About. Mounted by the host like a
// module, so its video watching stops when you leave it.
// Card videos load only when their card is on screen and motion is allowed
// (R15, #41). See specs/SPEC-shell.md.
import { h } from '../ui-kit/dom.js';
import { MODULES, isBuilt } from './registry.js';

// 'system' follows the computer's reduced-motion setting; 'full' and 'reduced' override it.
export function motionAllowed(setting, systemPrefersReduced) {
  if (setting === 'full') return true;
  if (setting === 'reduced') return false;
  return !systemPrefersReduced;
}

// The badge on a module card: 'Coming soon' until it is hooked in, then
// 'PROTOTYPE' until the combined sign-off (D135), else none.
export function cardBadge(entry) {
  if (!isBuilt(entry)) return 'Coming soon';
  return entry.prototype ? 'PROTOTYPE' : null;
}

function cardMedia(media) {
  const still = h('img', { class: 'card-still', src: media.still, alt: '', loading: 'lazy', decoding: 'async' });
  if (!media.webm) return { element: h('div', { class: 'card-media' }, still), video: null };
  const video = h('video', { class: 'card-video', muted: true, loop: true, playsinline: true, preload: 'none', 'aria-hidden': 'true', dataset: { webm: media.webm, mp4: media.mp4 } });
  video.muted = true; // the attribute alone isn't enough for autoplay in some browsers
  return { element: h('div', { class: 'card-media' }, still, video), video };
}

function moduleCard(entry) {
  const { element: media, video } = cardMedia(entry.media);
  const badge = cardBadge(entry);
  const text = h(
    'span',
    { class: 'card-text' },
    h('span', { class: 'eyebrow' }, entry.eyebrow),
    h('span', { class: 'card-title' }, entry.title),
    h('span', { class: 'card-blurb' }, entry.blurb),
    badge ? h('span', { class: badge === 'PROTOTYPE' ? 'badge badge-prototype' : 'badge' }, badge) : null,
  );
  const card = isBuilt(entry)
    ? h('a', { class: 'card', href: `#/${entry.id}`, dataset: { module: entry.id } }, media, text)
    : h('div', { class: 'card is-planned', dataset: { module: entry.id } }, media, text);
  return { card, video };
}

function aboutCard() {
  const { element: media } = cardMedia({ still: 'media/cards/about.jpg' });
  const text = h(
    'span',
    { class: 'card-text' },
    h('span', { class: 'eyebrow' }, 'About the project'),
    h('span', { class: 'card-title' }, 'About Dad'),
    h('span', { class: 'card-blurb' }, 'Who built these tools, and why'),
  );
  return h('a', { class: 'card card-about', href: '#/about', dataset: { module: 'about' } }, media, text);
}

function loadVideo(video) {
  if (video.dataset.loaded) return;
  video.dataset.loaded = 'true';
  video.append(h('source', { src: video.dataset.webm, type: 'video/webm' }), h('source', { src: video.dataset.mp4, type: 'video/mp4' }));
  video.load();
}

export default {
  id: 'home',
  title: 'Home',
  mount(root, app) {
    const cards = MODULES.map(moduleCard);
    root.append(
      h(
        'section',
        { class: 'home' },
        h(
          'div',
          { class: 'hero' },
          h('p', { class: 'eyebrow' }, "DAD's • Aviators webtool suite"),
          h('h1', {}, "DAD's OODA LOOP ", h('span', { class: 'version-badge' }, 'V2.145')),
          h('p', { class: 'lede' }, 'Debrief, formation, BFM, traffic and SOF tools for T-6 flying training. Open one below.'),
        ),
        h('div', { class: 'card-grid' }, cards.map((c) => c.card), aboutCard()),
      ),
    );

    const videos = cards.map((c) => c.video).filter(Boolean);
    const visible = new Set();
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
    // Card videos aren't kept for offline use, so offline the stills stay up.
    const online = () => globalThis.navigator?.onLine !== false;
    const allowed = () => online() && motionAllowed(app.settings.get().motion, reduced?.matches ?? false);

    const update = () => {
      for (const video of videos) {
        if (visible.has(video) && allowed()) {
          loadVideo(video);
          video.play()?.catch(() => {}); // a refused autoplay just leaves the still showing
          video.classList.add('is-playing');
        } else {
          video.pause();
          video.classList.remove('is-playing');
        }
      }
    };

    let observer = null;
    if ('IntersectionObserver' in globalThis) {
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        update();
      });
      for (const video of videos) observer.observe(video);
    }
    app.settings.subscribe(update);
    if (reduced) app.listen(reduced, 'change', update);
    app.listen(globalThis, 'online', update);
    app.listen(globalThis, 'offline', update);

    return () => {
      observer?.disconnect();
      for (const video of videos) video.pause();
    };
  },
};

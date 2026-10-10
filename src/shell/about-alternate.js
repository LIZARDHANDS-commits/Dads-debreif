// Alternate About page proposal: Elegant, borderless editorial layout with cinematic hero framing.
// Eliminates "box-itis", gives breathing room to the photography, and pairs the exterior photo
// directly with the Canadian-American exchange partnership story.
import { h } from '../ui-kit/dom.js';

const CONTACT_EMAIL = 'kennynatelli@gmail.com';
const CONTACT_SUBJECT = 'OODA LOOP Feedback';
const VENMO_URL = 'https://www.venmo.com/u/Kenny-Natelli';

export default {
  id: 'about-alternate',
  title: 'About OODA LOOP (Alternate)',
  mount(root) {
    root.append(
      h(
        'article',
        { class: 'about about-editorial' },
        // Top navigation & quiet draft pill
        h(
          'header',
          { class: 'about-header' },
          h(
            'div',
            { class: 'about-nav-row' },
            h('p', { class: 'back' }, h('a', { href: '#/' }, '← Home')),
            h('p', { class: 'switch-view' }, h('a', { href: '#/about' }, 'View Current About Page →')),
          ),
          h('p', { class: 'eyebrow' }, 'About the project'),
          h('h1', { class: 'about-title' }, 'About OODA LOOP'),
          h('p', { class: 'about-subtitle' }, 'Aviator Training & Debrief Suite'),
        ),

        // Hero 1: Full-width cinematic cockpit panorama
        h(
          'figure',
          { class: 'about-hero-cockpit' },
          h('img', {
            src: 'media/kenny-cockpit-formation.png',
            alt: 'Kenny flying CT-156 Harvard II #121 in 3-ship tactical formation',
            width: '1024',
            height: '435',
          }),
          h('figcaption', {}, 'Inside the Cockpit: Kenny flying Aircraft 121 in 3-ship tactical formation'),
        ),

        // Mission & Purpose (Clean editorial text, no box borders)
        h(
          'section',
          { class: 'about-section about-intro' },
          h('h2', { class: 'section-heading' }, 'Visualizing the Flight Before and After the Chocks'),
          h(
            'p',
            { class: 'lede' },
            'OODA LOOP is an aviator-built suite of flight debriefing, tactical simulation, and operational decision-support tools developed directly for the military flight training environment.',
          ),
          h(
            'p',
            {},
            'In high-performance flight training, the margin between understanding a maneuver and falling behind the aircraft comes down to visual clarity. This suite exists to bridge the gap between 2D whiteboard stick figures and dynamic 3D flight geometry—giving student pilots and instructors an accessible, browser-based sandbox to visualize energy states, debrief sorties, rehearse patterns, and make informed operational decisions.',
          ),
        ),

        // Co-Creators Dossiers (Clean 2-column layout with subtle badges)
        h(
          'section',
          { class: 'about-section about-creators-editorial' },
          h('h2', { class: 'eyebrow' }, 'Co-Creators'),
          h(
            'div',
            { class: 'dossier-grid' },
            // Kenny's Profile
            h(
              'div',
              { class: 'dossier-profile' },
              h(
                'div',
                { class: 'dossier-avatar' },
                h('img', {
                  src: 'media/kenny-natelli.jpg',
                  alt: 'Kenny "Dad" Natelli in cockpit',
                }),
              ),
              h(
                'div',
                { class: 'dossier-info' },
                h('h3', {}, 'Kenny "Dad" Natelli'),
                h('p', { class: 'dossier-role' }, 'USAF Exchange Instructor Pilot · 15 Wing Moose Jaw'),
                h(
                  'p',
                  { class: 'dossier-bio' },
                  'A U.S. Air Force exchange instructor pilot serving at 15 Wing. Kenny conceived and built the original V1–V6 debrief tools in the flight room and developed the real-time SOF Dashboard, embedding USAF and 15 Wing operational weather limits and divert criteria to safeguard flight operations.',
                ),
              ),
            ),
            // Pat's Profile
            h(
              'div',
              { class: 'dossier-profile' },
              h(
                'div',
                { class: 'dossier-avatar' },
                h('img', {
                  src: 'media/big2-badge.png',
                  alt: '2 CFFTS The Big Two Squadron Crest',
                }),
              ),
              h(
                'div',
                { class: 'dossier-info' },
                h('h3', {}, 'Pat'),
                h('p', { class: 'dossier-role' }, '2 CFFTS Instructor Pilot & Engineer'),
                h(
                  'p',
                  { class: 'dossier-bio' },
                  'A 2 CFFTS instructor pilot and engineer. Pat re-architected the suite into its modular engine, developing the tactical formation trainer, BFM fight simulator, and traffic pattern visualizer—calibrated to 15 Wing manuals, aerodynamic energy-maneuverability, and flight line instruction.',
                ),
              ),
            ),
          ),
        ),

        // Hero 2 & International Partnership (Split Feature)
        h(
          'section',
          { class: 'about-section partnership-feature' },
          h(
            'div',
            { class: 'partnership-content' },
            h('p', { class: 'eyebrow' }, 'International Partnership'),
            h('h2', { class: 'section-heading' }, 'Built on the Flight Line in Moose Jaw'),
            h(
              'p',
              {},
              'The suite is the product of an authentic Canadian-American instructor exchange at 15 Wing Moose Jaw (2 CFFTS "The Big Two"). It brings together USAF Air Education & Training Command (AETC) fighter/turboprop doctrine and RCAF primary flying standards into a shared instructional toolkit for the CT-156 Harvard II and T-6 Texan II communities.',
            ),
          ),
          h(
            'figure',
            { class: 'partnership-photo' },
            h('img', {
              src: 'media/about-hero-formation.png',
              alt: 'CT-156 Harvard II 3-ship tactical formation in echelon over Saskatchewan',
              width: '1000',
              height: '750',
            }),
            h('figcaption', {}, 'Fly • Learn • Debrief • Improve — 2 CFFTS "The Big Two"'),
          ),
        ),

        // Tactical Brevity Strip (Replaces the 5 bulky text boxes)
        h(
          'section',
          { class: 'about-section suite-brevity' },
          h('h2', { class: 'eyebrow' }, 'The Integrated Suite'),
          h(
            'div',
            { class: 'brevity-strip' },
            h(
              'div',
              { class: 'brevity-pill' },
              h('span', { class: 'pill-tag' }, 'DEBRIEF'),
              h('span', { class: 'pill-desc' }, '2D/3D Telemetry Replay & E-M Curves'),
            ),
            h(
              'div',
              { class: 'brevity-pill' },
              h('span', { class: 'pill-tag' }, 'FORMATION'),
              h('span', { class: 'pill-desc' }, 'Tactical Turns, TRJ & Station-Keeping'),
            ),
            h(
              'div',
              { class: 'brevity-pill' },
              h('span', { class: 'pill-tag' }, 'BFM FIGHT'),
              h('span', { class: 'pill-desc' }, '1-Circle & 2-Circle Turn Dynamics'),
            ),
            h(
              'div',
              { class: 'brevity-pill' },
              h('span', { class: 'pill-tag' }, 'TRAFFIC'),
              h('span', { class: 'pill-desc' }, 'Overhead Breaks & Pattern Spacing'),
            ),
            h(
              'div',
              { class: 'brevity-pill' },
              h('span', { class: 'pill-tag' }, 'SOF DASHBOARD'),
              h('span', { class: 'pill-desc' }, 'Real-Time Minima, Crosswinds & Radar'),
            ),
          ),
        ),

        // Flight-Line Doctrine (Clean quotation / editorial block)
        h(
          'section',
          { class: 'about-section doctrine-editorial' },
          h('p', { class: 'eyebrow' }, 'Flight-Line Doctrine'),
          h('h2', { class: 'section-heading' }, 'Why "OODA LOOP"?'),
          h(
            'p',
            {},
            'Named in honor of Col. John Boyd, the legendary fighter pilot who created Energy-Maneuverability (E-M) theory and the Observe • Orient • Decide • Act loop. In high-performance military flight, victory and safety belong to the pilot who cycles through the loop fastest. This suite was built to train that exact scan—helping aircrew observe geometry, orient to energy states, decide decisively, and debrief effectively.',
          ),
        ),

        // Integrated Minimalist Footer (Contact, Support & Disclaimer)
        h(
          'footer',
          { class: 'about-editorial-footer' },
          h(
            'div',
            { class: 'footer-actions' },
            h(
              'a',
              {
                class: 'button',
                href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(CONTACT_SUBJECT)}`,
              },
              `✉ Contact Instructors (${CONTACT_EMAIL})`,
            ),
            h(
              'a',
              { class: 'button secondary', href: VENMO_URL, target: '_blank', rel: 'noopener noreferrer' },
              '♡ Voluntary Venmo Support',
            ),
          ),
          h(
            'p',
            { class: 'fine footer-disclaimer' },
            'OODA LOOP is an unofficial instructional aid developed by the creators in their personal capacity. It is not an official product, publication, or endorsement of the Royal Canadian Air Force (RCAF), the Department of National Defence (DND), the United States Air Force (USAF), 15 Wing Moose Jaw, or 2 CFFTS. It does not replace official flight manuals, orders, or standard operating procedures. Contains no classified, controlled goods, or proprietary defense data.',
          ),
        ),
      ),
    );
  },
};

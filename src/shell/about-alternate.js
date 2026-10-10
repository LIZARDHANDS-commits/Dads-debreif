// Alternate About page proposal for review and discussion (Pat & Kenny "Dad" Natelli).
// Keeps the current About Us page intact while demonstrating the updated branding,
// instructor dossiers, international exchange partnership, and module architecture.
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
        { class: 'about about-dossier' },
        h(
          'div',
          { class: 'about-nav-row' },
          h('p', { class: 'back' }, h('a', { href: '#/' }, '← Home')),
          h('p', { class: 'switch-view' }, h('a', { href: '#/about' }, 'View Current About Page →')),
        ),
        h(
          'div',
          { class: 'notice about-draft-notice' },
          h('strong', {}, 'Draft Concept: '),
          'This is an alternate About page layout prepared for review and discussion. It introduces the unified OODA LOOP branding, dual instructor dossiers, and flight training context.',
        ),
        h('p', { class: 'eyebrow' }, 'About the project'),
        h('h1', { class: 'about-title' }, 'About OODA LOOP'),
        h('p', { class: 'about-subtitle' }, 'Aviator Training & Debrief Suite'),
        h(
          'figure',
          { class: 'about-photo' },
          h('img', {
            src: 'media/about-hero-formation.png',
            alt: 'CT-156 Harvard II 3-ship tactical formation flight over Saskatchewan',
            width: '1000',
            height: '750',
          }),
          h('figcaption', {}, 'Fly • Learn • Debrief • Improve — 15 Wing Moose Jaw'),
        ),
        h(
          'section',
          { class: 'about-intro' },
          h('h2', { class: 'section-heading' }, 'Visualizing the Flight Before and After the Chocks'),
          h(
            'p',
            {},
            'OODA LOOP is an aviator-built suite of flight debriefing, tactical simulation, and operational decision-support tools developed directly for the military flight training environment.',
          ),
          h(
            'p',
            {},
            'In high-performance flight training, the margin between understanding a maneuver and falling behind the aircraft comes down to visual clarity. This suite exists to bridge the gap between 2D whiteboard stick figures and dynamic 3D flight geometry—giving student pilots and instructors an accessible, browser-based sandbox to visualize energy states, debrief sorties, rehearse patterns, and make informed operational decisions.',
          ),
        ),
        h(
          'section',
          { class: 'about-creators-section' },
          h('h2', { class: 'eyebrow' }, 'Co-Creators & Flight Instruction'),
          h(
            'div',
            { class: 'about-boxes about-creators' },
            h(
              'section',
              { class: 'about-box creator-card' },
              h(
                'div',
                { class: 'creator-header' },
                h(
                  'div',
                  { class: 'creator-badge' },
                  h('img', {
                    src: 'media/usaf-badge.png',
                    alt: 'USAF Pilot Wings',
                    onerror: (e) => { e.currentTarget.style.display = 'none'; },
                  }),
                ),
                h(
                  'div',
                  { class: 'creator-titles' },
                  h('p', { class: 'eyebrow' }, 'Co-creator · USAF Exchange'),
                  h('h3', {}, 'Kenny "Dad" Natelli'),
                  h('p', { class: 'creator-rank' }, 'USAF Exchange Instructor Pilot'),
                ),
              ),
              h(
                'p',
                {},
                'A U.S. Air Force exchange instructor pilot serving at 15 Wing Moose Jaw, Saskatchewan. Kenny conceived and built the original V1–V6 debrief tools in the flight room and developed the real-time SOF Dashboard, embedding USAF and 15 Wing operational weather limits and divert criteria to safeguard flight operations.',
              ),
            ),
            h(
              'section',
              { class: 'about-box creator-card' },
              h(
                'div',
                { class: 'creator-header' },
                h(
                  'div',
                  { class: 'creator-badge' },
                  h('img', {
                    src: 'media/big2-badge.png',
                    alt: '2 CFFTS The Big Two Squadron Crest',
                  }),
                ),
                h(
                  'div',
                  { class: 'creator-titles' },
                  h('p', { class: 'eyebrow' }, 'Co-creator · 2 CFFTS'),
                  h('h3', {}, 'Pat'),
                  h('p', { class: 'creator-rank' }, '2 CFFTS Instructor Pilot & Engineer'),
                ),
              ),
              h(
                'p',
                {},
                'A 2 CFFTS instructor pilot and engineer. Pat re-architected the suite into its modular engine, developing the tactical formation trainer, BFM fight simulator, and traffic pattern visualizer—calibrated to 15 Wing manuals, aerodynamic energy-maneuverability, and flight line instruction.',
              ),
            ),
          ),
          h(
            'div',
            { class: 'about-partnership-banner' },
            h('strong', {}, 'An International Partnership in Flight Training: '),
            'Built on the flight line at 15 Wing Moose Jaw through a Canadian-American instructor exchange, blending USAF doctrine with RCAF 2 CFFTS primary flying standards.',
          ),
        ),
        h(
          'section',
          { class: 'about-suite-section' },
          h('h2', { class: 'eyebrow' }, 'The Suite at a Glance'),
          h(
            'div',
            { class: 'about-modules-grid' },
            h(
              'div',
              { class: 'about-module-card' },
              h('h3', {}, 'Debrief Viewer'),
              h('p', {}, '2D and 3D GPS/telemetry track replay, Debrief Focus Points (DFPs), formation geometry, and Energy-Maneuverability (E-M) flight envelope comparison.'),
            ),
            h(
              'div',
              { class: 'about-module-card' },
              h('h3', {}, 'Formation Simulator'),
              h('p', {}, 'Interactive step-by-step tactical formation turns, rejoin practice (TRJ, SARJ), station-keeping, and rollout judging against standards.'),
            ),
            h(
              'div',
              { class: 'about-module-card' },
              h('h3', {}, 'Fight & Turn Sim (BFM)'),
              h('p', {}, '1-circle, 2-circle, and 3D BFM visualizer matched to the CT-156 Harvard II 5.0 G flight envelope and turn rates.'),
            ),
            h(
              'div',
              { class: 'about-module-card' },
              h('h3', {}, 'Traffic Pattern Sim'),
              h('p', {}, 'Military overhead breaks, entry procedures, spacing, wind-shaped trajectories, and closed traffic management.'),
            ),
            h(
              'div',
              { class: 'about-module-card' },
              h('h3', {}, 'SOF Dashboard'),
              h('p', {}, 'Real-time Supervisor of Flying situational awareness—live weather minima, runway crosswind limits, METAR/TAF parsing, and radar.'),
            ),
          ),
        ),
        h(
          'section',
          { class: 'about-doctrine-card' },
          h('h2', { class: 'eyebrow' }, 'Flight-Line Doctrine'),
          h('h3', {}, 'Why "OODA LOOP"?'),
          h(
            'p',
            {},
            'Named in honor of Col. John Boyd, the legendary fighter pilot who pioneered Energy-Maneuverability (E-M) theory and the Observe • Orient • Decide • Act loop. In high-performance flight, victory and safety belong to the pilot who cycles through the loop fastest. This suite was built to train that exact scan—helping aircrew observe geometry, orient to energy states, decide decisively, and debrief effectively.',
          ),
        ),
        h(
          'div',
          { class: 'about-boxes' },
          h(
            'section',
            { class: 'about-box' },
            h('h2', {}, 'Contact / feedback'),
            h(
              'p',
              {},
              'Built by instructors for instructors and students. If you notice a bug, have an idea for a new tactical scenario, or want to suggest an improvement to flight calculations, your feedback directly shapes future updates.',
            ),
            h(
              'a',
              {
                class: 'button',
                href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(CONTACT_SUBJECT)}`,
              },
              `✉ ${CONTACT_EMAIL}`,
            ),
          ),
          h(
            'section',
            { class: 'about-box' },
            h('h2', {}, 'Support the project'),
            h(
              'p',
              {},
              'OODA LOOP is independently developed, hosted, and maintained for the aviation training community. If these tools have been valuable to your debriefs, preparation, or instruction, voluntary contributions help keep the web services and live weather feeds running.',
            ),
            h(
              'a',
              { class: 'button', href: VENMO_URL, target: '_blank', rel: 'noopener noreferrer' },
              '♡ Support via Venmo',
            ),
            h('p', { class: 'fine' }, 'Opens Venmo in a new tab or app.'),
          ),
        ),
        h(
          'section',
          { class: 'about-disclaimer-card' },
          h('h2', { class: 'eyebrow' }, 'Notice & Disclaimer'),
          h(
            'p',
            { class: 'fine' },
            'OODA LOOP is an unofficial instructional aid developed by the creators in their personal capacity. It is not an official product, publication, or endorsement of the Royal Canadian Air Force (RCAF), the Department of National Defence (DND), the United States Air Force (USAF), 15 Wing Moose Jaw, or 2 CFFTS. It does not replace official flight manuals, orders, or standard operating procedures. Contains no classified, controlled goods, or proprietary defense data.',
          ),
        ),
      ),
    );
  },
};

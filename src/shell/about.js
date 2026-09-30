// About Dad: V6's About page content, as Dad wrote it.
import { h } from '../ui-kit/dom.js';

const CONTACT_EMAIL = 'kennynatelli@gmail.com';
const CONTACT_SUBJECT = "DAD'S Aviators Webtool Suite Feedback";
const VENMO_URL = 'https://www.venmo.com/u/Kenny-Natelli';

export default {
  id: 'about',
  title: 'About Dad',
  mount(root) {
    root.append(
      h(
        'article',
        { class: 'about' },
        h('p', { class: 'back' }, h('a', { href: '#/' }, '← Home')),
        h('p', { class: 'eyebrow' }, 'About the project'),
        h('h1', {}, 'About Dad'),
        h(
          'figure',
          { class: 'about-photo' },
          h('img', { src: 'media/about-photo.jpg', alt: 'CT-156 Harvard II formation flight', width: '1400', height: '595' }),
          h('figcaption', {}, 'Fly • Learn • Debrief • Improve'),
        ),
        h(
          'div',
          { class: 'about-intro' },
          h('p', {}, "I'm a U.S. Air Force exchange officer in Moose Jaw, Saskatchewan. I built DAD'S Aviators Webtool Suite to help aviators visualize complex problems, make informed decisions, and improve the learning and debriefing process."),
          h('p', {}, 'These tools are built around a simple idea: make useful aviation concepts easier to see, understand, discuss, and learn from.'),
        ),
        h(
          'div',
          { class: 'about-boxes' },
          h(
            'section',
            { class: 'about-box' },
            h('h2', {}, 'Contact / feedback'),
            h('p', {}, 'Found a bug? Have an idea for a new tool? Think something could work better? Feedback is what makes the suite better.'),
            h('a', { class: 'button', href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(CONTACT_SUBJECT)}` }, `✉ ${CONTACT_EMAIL}`),
          ),
          h(
            'section',
            { class: 'about-box' },
            h('h2', {}, 'The mission'),
            h('p', {}, 'Build practical visualization and decision-support tools that help aviators learn faster, debrief better, and make more informed decisions.'),
          ),
          h(
            'section',
            { class: 'about-box' },
            h('h2', {}, 'Support the project'),
            h('p', {}, "If these tools have been useful and you'd like to support continued development, you can contribute to the project."),
            h('a', { class: 'button', href: VENMO_URL, target: '_blank', rel: 'noopener noreferrer' }, '♡ Support via Venmo'),
            h('p', { class: 'fine' }, 'Opens Venmo in a new tab or the Venmo app when supported.'),
          ),
        ),
        h('p', { class: 'fine about-ai' }, 'AI was leveraged to assist in the development of these tools.'),
      ),
    );
  },
};

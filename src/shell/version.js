// The footer's plain-English version line (R22): when this copy was published,
// in Zulu. The build commit stays in the tooltip and in bug reports.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// built: an ISO time such as "2026-09-30T02:01:13Z", or nothing in a dev copy.
export function updatedLabel(built) {
  const date = built ? new Date(built) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Development copy';
  const pad = (n) => String(n).padStart(2, '0');
  return `Updated ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
}

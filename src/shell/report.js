// Link for the "Report a problem" button (R20): GitHub's new-issue form for
// this repo, with the open page and app version filled in.

export const REPO_URL = 'https://github.com/LIZARDHANDS-commits/Dads-debreif';

export function reportUrl({ page = 'Home', version = 'dev' } = {}) {
  const params = new URLSearchParams({
    template: 'problem.yml',
    title: `Problem: ${page}`,
    page,
    version,
  });
  return `${REPO_URL}/issues/new?${params}`;
}

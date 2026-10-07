// Which attempt of a task run a preview or media report should show.
//
// A run's latest attempt only replaces an earlier one when it published
// something itself (publish or publish-failed succeeded). A GitHub Re-run that
// the task rejected, or that otherwise published nothing, leaves the earlier
// attempt's build PR in place, so its preview and media stay deployable; that
// includes replays where the operator names the earlier attempt explicitly.
const PUBLISHERS = new Set(['publish', 'publish-failed']);

export const publishedBy = (jobs) =>
  jobs.some((job) => PUBLISHERS.has(job.name) && job.conclusion === 'success');

// listJobs(attempt) returns that attempt's jobs. Returns
//   { superseded: n }   a later attempt n published, so skip this source;
//   { attempt, jobs }   the attempt to use: the selected one when it
//                       published, otherwise the newest earlier attempt that
//                       did, otherwise the selected one (which selects nothing).
export async function publicationAttempt(listJobs, selected, latest) {
  for (let attempt = latest; attempt > selected; attempt--)
    if (publishedBy(await listJobs(attempt))) return { superseded: attempt };
  const selectedJobs = await listJobs(selected);
  if (publishedBy(selectedJobs))
    return { attempt: selected, jobs: selectedJobs };
  for (let attempt = selected - 1; attempt >= 1; attempt--) {
    const jobs = await listJobs(attempt);
    if (publishedBy(jobs)) return { attempt, jobs };
  }
  return { attempt: selected, jobs: selectedJobs };
}

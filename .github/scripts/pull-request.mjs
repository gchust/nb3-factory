// Finding and creating a task's build PR. publish-pr.mjs is a script that
// runs on import; these helpers live apart so they can be tested.

// The open PR of this work branch into the target branch, if any.
export async function findOpenPull(
  client,
  { owner, workBranch, targetBranch },
) {
  const open = await client.request('GET', '/pulls', {
    query: { state: 'open', head: `${owner}:${workBranch}`, per_page: 100 },
  });
  return open.find((candidate) => candidate.base?.ref === targetBranch) ?? null;
}

// POST /pulls is not idempotent, so GitHubClient never retries it. A lost
// response (a timeout, a dropped connection, a 5xx) may still have created the
// PR, and a second POST then answers 422 "A pull request already exists":
// after any failure the open PR is looked up first, and the POST is repeated
// only while none exists and the failure could be transient.
export const CREATE_PULL_RETRY_DELAYS_MS = [5000, 15000];
export async function createPull(
  client,
  { owner, workBranch, targetBranch, body },
  {
    delays = CREATE_PULL_RETRY_DELAYS_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.request('POST', '/pulls', { body });
    } catch (error) {
      let existing = null;
      try {
        existing = await findOpenPull(client, {
          owner,
          workBranch,
          targetBranch,
        });
      } catch (lookup) {
        console.warn(
          `Cannot look up the pull request after a failed create: ${lookup.message}`,
        );
      }
      if (existing) {
        console.warn(
          `Creating the pull request failed (${error.message}); it exists, using it.`,
        );
        return existing;
      }
      const status = Number(/ failed \((\d{3})\)/.exec(error.message)?.[1]);
      const transient =
        !status ||
        status >= 500 ||
        (status === 422 && /already exists/i.test(error.message));
      if (!transient || attempt >= delays.length) throw error;
      console.warn(
        `Creating the pull request failed (${error.message}); retrying.`,
      );
      await sleep(delays[attempt]);
    }
  }
}

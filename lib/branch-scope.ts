/* The branch boundary for collaborators.
 *
 * collaboratorTable.branch shipped in the schema and was never read, so access
 * was repo-scoped: a client invited to edit a `draft` branch could switch to the
 * branch behind their live site and edit it directly, with nothing in the UI
 * marking the difference.
 *
 * Kept in its own module with no dependencies — lib/token.ts pulls in Octokit,
 * which cannot be imported by the test runner, and a security rule that cannot
 * be unit-tested tends to stop being true.
 */

/* Fails OPEN for the two cases that are not a boundary at all — an unscoped
 * collaborator, and a caller that is not branch-scoped (listing repos or
 * collaborators passes no branch; failing closed there would lock a scoped
 * client out of the app entirely) — and CLOSED for everything else.
 * Case-insensitive: git compares refs exactly, humans and URLs do not. */
const isBranchAllowed = (
  scopedBranch: string | null | undefined,
  requestedBranch: string | null | undefined,
): boolean => {
  if (!scopedBranch) return true;
  if (!requestedBranch) return true;
  return scopedBranch.toLowerCase() === requestedBranch.toLowerCase();
};

export { isBranchAllowed };

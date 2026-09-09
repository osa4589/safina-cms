export type ProvisionValue = {
  owner: string;
  repo: string;
  email: string;
  name?: string;
  /* The branch this person is confined to, or null for the whole repository.
     Deliberately NOT optional: the collaborator row's `branch` column shipped
     in the schema and nothing ever wrote it, so every client provisioned by
     this endpoint silently got full-repo access — including the branch behind
     their live site. A caller now has to say which it wants. */
  branch: string | null;
};
export type ParseResult = { ok: true; value: ProvisionValue } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* A conservative subset of git's ref rules: what a human would actually name a
   branch. The pattern rejects leading "-"/".", control characters and spaces;
   GIT_REFUSES catches what the pattern lets through but `git check-ref-format`
   does not — a trailing "/" or ".", a ".lock" suffix, "//", a dot-leading
   component. A client confined to a branch git cannot have can never load the
   repo, so this is checked here, at the only door. */
const BRANCH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/;
const GIT_REFUSES = /(^|\/)\.|\.lock(\/|$)|\/\/|[\/.]$/;
export const isPlausibleBranchName = (value: string) =>
  BRANCH_PATTERN.test(value) && !value.includes("..") && !GIT_REFUSES.test(value);

export const parseProvisionBody = (body: unknown): ParseResult => {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const { repo, email, name, branch } = body as Record<string, unknown>;

  if (typeof repo !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(repo.trim())) {
    return { ok: false, error: "repo must be in owner/name form" };
  }
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return { ok: false, error: "email must be a valid address" };
  }

  let parsedBranch: string | null;
  if (branch === undefined) {
    return {
      ok: false,
      error:
        'branch is required: the branch name to confine this person to (e.g. "draft"), ' +
        "or null to deliberately grant the whole repository including the live branch",
    };
  } else if (branch === null) {
    parsedBranch = null;
  } else if (typeof branch === "string" && isPlausibleBranchName(branch.trim())) {
    parsedBranch = branch.trim();
  } else {
    return { ok: false, error: "branch must be a plain branch name (letters, digits, . _ / -) or null" };
  }

  const [ownerPart, repoPart] = repo.trim().split("/");
  return {
    ok: true,
    value: {
      owner: ownerPart,
      repo: repoPart,
      // Same normalization as normalizeEmail() in lib/collaborator-access.ts, so
      // rows written here match what the rest of the app stores. (Inlined to
      // keep this module dependency-free and trivially unit-testable.)
      email: email.trim().toLowerCase(),
      name: typeof name === "string" ? name.trim() : undefined,
      branch: parsedBranch,
    },
  };
};

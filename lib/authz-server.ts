import "server-only";

import type { User } from "@/types/user";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { createHttpError } from "@/lib/api-error";
import { getUserToken } from "@/lib/token";
import { createOctokitInstance } from "@/lib/utils/octokit";

const requireGithubUserToken = async (
  user: Pick<User, "id" | "githubUsername">,
  identityErrorMessage = "Only GitHub users can perform this action.",
) => {
  /* Thrown as an HttpError on purpose: toErrorResponse maps a plain Error to
     500 unless its text happens to match a heuristic, so a denial from these
     gates surfaced as a server error instead of a 403. */
  if (!hasGithubIdentity(user)) throw createHttpError(identityErrorMessage, 403);
  return getUserToken(user.id);
};

const requireGithubRepoWriteAccess = async (
  user: Pick<User, "id" | "githubUsername">,
  owner: string,
  repo: string,
  identityErrorMessage = "Only GitHub users can perform this action.",
) => {
  const token = await requireGithubUserToken(user, identityErrorMessage);
  const octokit = createOctokitInstance(token);
  const response = await octokit.rest.repos.get({ owner, repo });

  if (!response.data.permissions?.push) {
    throw createHttpError(`You do not have write access to "${owner}/${repo}".`, 403);
  }

  const repoAccess = {
    repoId: response.data.id,
    ownerId: response.data.owner.id,
    ownerLogin: response.data.owner.login,
    repoName: response.data.name,
    ownerType: response.data.owner.type === "User" ? "user" : "org",
  };

  return { token, repoAccess };
};

export { requireGithubUserToken, requireGithubRepoWriteAccess };

/**
 * Token helper functions.
 */

import { cache } from "react";
import { App } from "@octokit/app";
import { decrypt, encrypt } from "@/lib/crypto";
import { createOctokitInstance } from "@/lib/utils/octokit";
import { db } from "@/db";
import {
  githubInstallationTokenTable
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { User } from "@/types/user";
import { getGithubAccount } from "@/lib/github-account";
import { createHttpError } from "@/lib/api-error";
import { collaboratorMatchesUserForRepo } from "@/lib/collaborator-access";
import { isBranchAllowed } from "@/lib/branch-scope";

const installationTokenRefreshInFlight = new Map<number, Promise<string>>();

/* Which branch a collaborator is confined to, or null for full-repo access.
 *
 * collaboratorTable.branch shipped in the schema but was never read: access was
 * repo-scoped, so a client invited to edit a draft could switch to the branch
 * behind their live site and edit it directly, with nothing in the UI marking
 * the difference. Reading it here makes the column mean what it says. */
const getCollaboratorBranch = cache(async (
  user: Pick<User, "id" | "email">,
  owner: string,
  repo: string,
): Promise<string | null> => {
  const permission = await db.query.collaboratorTable.findFirst({
    where: collaboratorMatchesUserForRepo(user, owner, repo),
  });
  return permission?.branch ?? null;
});

// Get a token for a user (including collagborators who need to provide an owner/repo scope).
const getToken = cache(async (
  user: User,
  owner: string,
  repo: string,
  verifyGithubAccess: boolean = false,
  branch?: string,
) => {
  const githubAccount = await getGithubAccount(user.id);
  if (githubAccount?.accessToken) {
    const hasGithubAccess = await canAccessRepoWithToken(githubAccount.accessToken, owner, repo);
    if (hasGithubAccess) return {
      token: githubAccount.accessToken,
      source: "user" as const,
    };
  }

  const permission = await db.query.collaboratorTable.findFirst({
    where: collaboratorMatchesUserForRepo(user, owner, repo),
  });
  if (permission) {
    /* THE branch boundary. A collaborator row carrying a branch may act on that
       branch and no other — checked here rather than in the UI, because the UI
       is a suggestion and this is the only thing an address-bar edit cannot get
       past. Callers that are not branch-scoped (listing repos, collaborators)
       pass no branch and are unaffected; a GitHub user with real repo access
       returned above and is never confined. */
    if (!isBranchAllowed(permission.branch, branch)) {
      throw createHttpError(
        `You can only make changes on the "${permission.branch}" branch of "${owner}/${repo}".`,
        403,
      );
    }

    const installationToken = await getInstallationToken(owner, repo);

    return {
      token: installationToken,
      source: "installation" as const,
    };
  }

  if (githubAccount?.accessToken && verifyGithubAccess) {
    throw createHttpError(
      `You do not have permission to access "${owner}/${repo}".`,
      403,
    );
  }

  throw createHttpError(
    `You do not have permission to access "${owner}/${repo}".`,
    403,
  );
});

// Get the GitHub App installation token for a specific repository.
const getInstallationToken = cache(async (owner: string, repo: string) => {
  const app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  });

  const repoInstallation = await app.octokit.request(
    "GET /repos/{owner}/{repo}/installation",
    { owner, repo },
  );
  if (!repoInstallation) throw new Error(`Installation token not found for "${owner}/${repo}".`);

  const installationId = repoInstallation.data.id;
  const tokenData = await db.query.githubInstallationTokenTable.findFirst({
    where: eq(githubInstallationTokenTable.installationId, installationId)
  });

  if (tokenData && Date.now() < tokenData.expiresAt.getTime() - 60_000) {
    const token = await decrypt(tokenData.ciphertext, tokenData.iv);
    if (!token) throw new Error(`Token could not be retrieved and/or decrypted.`);
    return token;
  }

  const existingRefresh = installationTokenRefreshInFlight.get(installationId);
  if (existingRefresh) {
    return existingRefresh;
  }

  const refreshJob = (async () => {
    const installationToken = await app.octokit.request(
      "POST /app/installations/{installation_id}/access_tokens",
      {
        installation_id: installationId,
      },
    );

    const { ciphertext, iv } = await encrypt(installationToken.data.token);
    const expiresAt = new Date(installationToken.data.expires_at);

    if (tokenData) {
      await db.update(githubInstallationTokenTable).set({
        ciphertext,
        iv,
        expiresAt
      }).where(
        eq(githubInstallationTokenTable.id, tokenData.id)
      );
    } else {
      await db.insert(githubInstallationTokenTable).values({
        ciphertext,
        iv,
        installationId,
        expiresAt
      }).onConflictDoUpdate({
        target: githubInstallationTokenTable.installationId,
        set: {
          ciphertext,
          iv,
          expiresAt,
        },
      });
    }

    return installationToken.data.token;
  })();

  installationTokenRefreshInFlight.set(installationId, refreshJob);
  try {
    return await refreshJob;
  } finally {
    installationTokenRefreshInFlight.delete(installationId);
  }
});

// Get the GitHub user token.
const getUserToken = cache(async (userId: string) => {
  const githubAccount = await getGithubAccount(userId);
  if (!githubAccount?.accessToken) throw new Error(`GitHub token not found for user ${userId}.`);

  return githubAccount.accessToken;
});

const canAccessRepoWithToken = async (
  token: string,
  owner: string,
  repo: string,
) => {
  try {
    const octokit = createOctokitInstance(token);
    await octokit.rest.repos.get({ owner, repo });
    return true;
  } catch {
    return false;
  }
};

export { getInstallationToken, getUserToken, getToken, getCollaboratorBranch };

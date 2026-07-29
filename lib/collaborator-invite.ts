import { and, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@/db";
import { collaboratorInviteTable } from "@/db/schema";

// Deliberately NOT a "use server" module: every exported async function in one
// of those is published as a server action with a public, unauthenticated action
// id. This helper deletes and replaces pending invites, so it must stay an
// ordinary server-side import used by callers that do their own authorization
// (lib/actions/collaborator.ts, app/api/provision/route.ts).

const generateInviteToken = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const bytes = randomBytes(32);
  let token = "";

  for (let i = 0; i < 32; i += 1) {
    token += alphabet[bytes[i] % alphabet.length];
  }

  return token;
};

export const createCollaboratorInviteUrl = async ({
  email,
  owner,
  repo,
  baseUrl,
}: {
  email: string;
  owner: string;
  repo: string;
  baseUrl: string;
}) => {
  const token = generateInviteToken();
  const expiresAt = new Date(
    Date.now() + ((Number(process.env.COLLABORATOR_INVITE_LINK_EXPIRES_IN) || 86400) * 1000),
  );

  await db
    .delete(collaboratorInviteTable)
    .where(
      and(
        sql`lower(${collaboratorInviteTable.email}) = lower(${email})`,
        sql`lower(${collaboratorInviteTable.owner}) = lower(${owner})`,
        sql`lower(${collaboratorInviteTable.repo}) = lower(${repo})`,
      ),
    );

  await db.insert(collaboratorInviteTable).values({
    token,
    email,
    owner,
    repo,
    expiresAt,
  });

  const inviteUrl = new URL("/sign-in/collaborator", baseUrl);
  inviteUrl.searchParams.set("token", token);

  return inviteUrl.toString();
};

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorInviteTable, collaboratorTable, userTable } from "@/db/schema";
import type { User } from "@/types/user";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const collaboratorMatchesUser = (user: Pick<User, "id" | "email">) => (
  or(
    eq(collaboratorTable.userId, user.id),
    and(
      isNull(collaboratorTable.userId),
      sql`lower(${collaboratorTable.email}) = lower(${user.email})`,
    ),
  )
);

const collaboratorMatchesUserForRepo = (
  user: Pick<User, "id" | "email">,
  owner: string,
  repo: string,
) => (
  and(
    collaboratorMatchesUser(user),
    sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
    sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
  )
);

const collaboratorMatchesInvite = (email: string, owner: string, repo: string) => (
  and(
    sql`lower(${collaboratorTable.email}) = lower(${email})`,
    sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
    sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
  )
);

const findVerifiedUserByEmail = async (email: string) => {
  return db.query.userTable.findFirst({
    where: and(
      sql`lower(${userTable.email}) = lower(${normalizeEmail(email)})`,
      eq(userTable.emailVerified, true),
    ),
  });
};

const bindCollaboratorInvitesToUser = async (user: Pick<User, "id" | "email" | "emailVerified">) => {
  if (!user.emailVerified) return;

  await db
    .update(collaboratorTable)
    .set({ userId: user.id })
    .where(
      and(
        isNull(collaboratorTable.userId),
        sql`lower(${collaboratorTable.email}) = lower(${normalizeEmail(user.email)})`,
      ),
    );

  await db
    .delete(collaboratorInviteTable)
    .where(sql`lower(${collaboratorInviteTable.email}) = lower(${normalizeEmail(user.email)})`);
};

/* True for an address that may receive a sign-in code: an existing user, an
   email with a collaborator row, or one holding a pending invite. Anyone else
   gets no code — and therefore never gets a user row — while the sign-in page
   still says "code sent", so the check cannot be used to enumerate addresses. */
const isKnownOrInvitedEmail = async (email: string): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  const [user, collaborator, invite] = await Promise.all([
    db.query.userTable.findFirst({ where: sql`lower(${userTable.email}) = ${normalized}` }),
    db.query.collaboratorTable.findFirst({ where: sql`lower(${collaboratorTable.email}) = ${normalized}` }),
    db.query.collaboratorInviteTable.findFirst({ where: sql`lower(${collaboratorInviteTable.email}) = ${normalized}` }),
  ]);
  return Boolean(user || collaborator || invite);
};

export {
  bindCollaboratorInvitesToUser,
  isKnownOrInvitedEmail,
  collaboratorMatchesInvite,
  collaboratorMatchesUser,
  collaboratorMatchesUserForRepo,
  findVerifiedUserByEmail,
  normalizeEmail,
};

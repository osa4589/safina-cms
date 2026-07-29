import { and, sql } from "drizzle-orm";
import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { sendEmail } from "@/lib/mailer";
import { verifyServiceToken } from "@/lib/provision-auth";
import { resolveInstallation } from "@/lib/provision-installation";

export const runtime = "nodejs";

type ProvisionValue = { owner: string; repo: string; email: string; name?: string };
type ParseResult = { ok: true; value: ProvisionValue } | { ok: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseProvisionBody = (body: unknown): ParseResult => {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be a JSON object" };
  const { repo, email, name } = body as Record<string, unknown>;

  if (typeof repo !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(repo.trim())) {
    return { ok: false, error: "repo must be in owner/name form" };
  }
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return { ok: false, error: "email must be a valid address" };
  }

  const [ownerPart, repoPart] = repo.trim().split("/");
  return {
    ok: true,
    value: {
      owner: ownerPart,
      repo: repoPart,
      email: email.trim(),
      name: typeof name === "string" ? name.trim() : undefined,
    },
  };
};

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function POST(request: Request) {
  if (!(await verifyServiceToken(request))) {
    return json({ error: "unauthorized" }, 401);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "body must be valid JSON" }, 400);
  }

  const parsed = parseProvisionBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { owner, repo, email, name } = parsed.value;

  const installation = await resolveInstallation(owner, repo);
  if (!installation) {
    return json(
      {
        error: `The Safina Studio CMS GitHub App is not installed on ${owner}/${repo}. Install it on that repository, then retry.`,
      },
      409,
    );
  }

  const existing = await db
    .select({ id: collaboratorTable.id })
    .from(collaboratorTable)
    .where(
      and(
        sql`lower(${collaboratorTable.owner}) = lower(${owner})`,
        sql`lower(${collaboratorTable.repo}) = lower(${repo})`,
        sql`lower(${collaboratorTable.email}) = lower(${email})`,
      ),
    )
    .limit(1);

  const status = existing.length > 0 ? "existing" : "created";

  if (status === "created") {
    await db
      .insert(collaboratorTable)
      .values({
        type: "collaborator",
        installationId: installation.installationId,
        ownerId: installation.ownerId,
        repoId: installation.repoId,
        owner,
        repo,
        email,
      })
      .onConflictDoNothing();
  }

  // Imported dynamically (rather than statically at module scope, as the task
  // brief's reference snippet does) because lib/actions/collaborator.ts
  // transitively imports @octokit/app, which ships ESM-only (its package.json
  // "exports" map has no "require" condition). Next's bundler handles that fine
  // either way, but a static import would make loading this route module for
  // just parseProvisionBody's unit tests eagerly evaluate that whole chain,
  // which plain `require()` cannot do (verified with a bare
  // `node -e "require('@octokit/app')"` failing independent of tsx/tests).
  // Deferring the import to here, where it's actually needed, avoids that
  // without touching lib/actions/collaborator.ts beyond the one permitted
  // export change.
  const { createCollaboratorInviteUrl } = await import("@/lib/actions/collaborator");

  const baseUrl = process.env.BASE_URL ?? "https://cms.safinastudio.com";
  const inviteUrl = await createCollaboratorInviteUrl({ email, owner, repo, baseUrl });

  const greeting = name ? `Hi ${name},` : "Hi,";
  try {
    await sendEmail({
      to: email,
      subject: "Your website is ready to edit",
      html: `<p>${greeting}</p><p>Your website editor is ready. Use the link below to sign in — no account or password needed.</p><p><a href="${inviteUrl}">Open your website editor</a></p>`,
      text: `${greeting}\n\nYour website editor is ready. Open this link to sign in:\n${inviteUrl}\n`,
    });
  } catch (error) {
    // Access already exists; only delivery failed. Return the link so the
    // caller can retry mail or deliver it another way.
    return json(
      { status, inviteUrl, error: `invite created but email failed: ${(error as Error).message}` },
      502,
    );
  }

  return json({ status, inviteUrl }, 200);
}

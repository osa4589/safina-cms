import { db } from "@/db";
import { collaboratorTable } from "@/db/schema";
import { createCollaboratorInviteUrl } from "@/lib/collaborator-invite";
import { sendEmail } from "@/lib/mailer";
import { verifyServiceToken } from "@/lib/provision-auth";
import { buildInviteEmail } from "@/lib/provision-email";
import { resolveInstallation } from "@/lib/provision-installation";
import { parseProvisionBody } from "@/lib/provision-request";

export const runtime = "nodejs";

const json = (payload: unknown, status: number) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });

export async function POST(request: Request) {
  try {
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

    // One atomic statement rather than SELECT-then-INSERT: concurrent webhook
    // retries would both see zero rows and both report "created". An empty
    // `returning` means uq_collaborator_owner_repo_email_ci already held the row.
    const inserted = await db
      .insert(collaboratorTable)
      .values({
        type: installation.ownerType,
        installationId: installation.installationId,
        ownerId: installation.ownerId,
        repoId: installation.repoId,
        owner,
        repo,
        email,
      })
      .onConflictDoNothing()
      .returning({ id: collaboratorTable.id });

    const status = inserted.length > 0 ? "created" : "existing";

    const baseUrl = process.env.BASE_URL ?? "https://cms.safinastudio.com";
    const inviteUrl = await createCollaboratorInviteUrl({ email, owner, repo, baseUrl });

    try {
      await sendEmail({ to: email, ...buildInviteEmail({ name, inviteUrl }) });
    } catch (error) {
      // Access already exists; only delivery failed. Return the link so the
      // caller can retry mail or deliver it another way.
      return json(
        { status, inviteUrl, error: `invite created but email failed: ${(error as Error).message}` },
        502,
      );
    }

    return json({ status, inviteUrl }, 200);
  } catch (error) {
    // The caller is a machine that parses JSON, so an unexpected throw must not
    // fall through to Next's HTML 500 page. The message is deliberately generic:
    // details go to the server log so no credential can leak in the response.
    console.error("POST /api/provision failed:", error);
    return json({ error: "provisioning failed" }, 500);
  }
}

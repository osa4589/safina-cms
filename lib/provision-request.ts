export type ProvisionValue = { owner: string; repo: string; email: string; name?: string };
export type ParseResult = { ok: true; value: ProvisionValue } | { ok: false; error: string };

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
      // Same normalization as normalizeEmail() in lib/collaborator-access.ts, so
      // rows written here match what the rest of the app stores. (Inlined to
      // keep this module dependency-free and trivially unit-testable.)
      email: email.trim().toLowerCase(),
      name: typeof name === "string" ? name.trim() : undefined,
    },
  };
};

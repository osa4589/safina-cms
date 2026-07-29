const sha256 = async (value: string): Promise<Uint8Array> => {
  const data = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
};

const constantTimeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a[i] ^ b[i];
  return difference === 0;
};

// Authenticates machine-to-machine callers (e.g. the site builder's
// POST /api/provision request) against a single shared bearer token.
// Never fails open: an unset or empty PROVISION_SERVICE_TOKEN rejects every request.
export const verifyServiceToken = async (request: Request): Promise<boolean> => {
  const expected = process.env.PROVISION_SERVICE_TOKEN;
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  // Hashing both sides fixes the compared length, so no length is leaked.
  const [presented, known] = await Promise.all([sha256(match[1]), sha256(expected)]);
  return constantTimeEqual(presented, known);
};

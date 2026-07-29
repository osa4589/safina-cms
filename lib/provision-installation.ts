type Installation = {
  installationId: number;
  ownerId: number;
  repoId: number;
  ownerType: "user" | "org";
};

const base64url = (input: ArrayBuffer | string): string => {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// --- PKCS#1 -> PKCS#8 -------------------------------------------------------
// GitHub issues App private keys as PKCS#1 ("-----BEGIN RSA PRIVATE KEY-----"),
// but WebCrypto's importKey only understands PKCS#8. Wrapping the bare
// RSAPrivateKey DER in an RFC 5208 PrivateKeyInfo is a purely structural
// transform, so both PEM formats work without shelling out to openssl.

// AlgorithmIdentifier for rsaEncryption (OID 1.2.840.113549.1.1.1) with NULL params.
const RSA_ENCRYPTION_ALGORITHM_ID = Uint8Array.from([
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
]);
// PrivateKeyInfo.version = INTEGER 0
const PKCS8_VERSION = Uint8Array.from([0x02, 0x01, 0x00]);

// Return types are left to inference so the element buffer stays `ArrayBuffer`
// (not `ArrayBufferLike`), which is what crypto.subtle's BufferSource requires.
const concatBytes = (...parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const derLength = (length: number) => {
  if (length < 0x80) return Uint8Array.from([length]);
  const bytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) {
    bytes.unshift(remaining % 256);
  }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
};

const derWrap = (tag: number, contents: Uint8Array) =>
  concatBytes(Uint8Array.from([tag]), derLength(contents.length), contents);

const pkcs1ToPkcs8 = (pkcs1: Uint8Array) =>
  derWrap(
    0x30,
    concatBytes(PKCS8_VERSION, RSA_ENCRYPTION_ALGORITHM_ID, derWrap(0x04, pkcs1)),
  );

// Exported for tests.
export const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
  // Some secret stores hand back the PEM with newlines escaped as literal "\n".
  const normalized = pem.replace(/\\n/g, "\n").trim();
  const isPkcs1 = normalized.includes("-----BEGIN RSA PRIVATE KEY-----");
  const isPkcs8 = normalized.includes("-----BEGIN PRIVATE KEY-----");
  if (!isPkcs1 && !isPkcs8) {
    throw new Error(
      "GITHUB_APP_PRIVATE_KEY must be an RSA private key PEM starting with " +
        '"-----BEGIN RSA PRIVATE KEY-----" (PKCS#1, what GitHub issues) or ' +
        '"-----BEGIN PRIVATE KEY-----" (PKCS#8).',
    );
  }

  const body = normalized
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    isPkcs1 ? pkcs1ToPkcs8(der) : der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
};

const createAppJwt = async (): Promise<string> => {
  const appId = process.env.GITHUB_APP_ID;
  const pem = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !pem) throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set.");

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }));
  const signingInput = `${header}.${payload}`;

  const key = await importPrivateKey(pem);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(signature)}`;
};

const gh = async (url: string, token: string, scheme: "Bearer" | "token") => {
  const response = await fetch(`https://api.github.com${url}`, {
    headers: {
      authorization: `${scheme} ${token}`,
      accept: "application/vnd.github+json",
      "user-agent": "safina-cms",
    },
  });
  return response;
};

export const resolveInstallation = async (
  owner: string,
  repo: string,
): Promise<Installation | null> => {
  const jwt = await createAppJwt();

  // Authoritative, single-call lookup for this specific repository. Unlike
  // listing /app/installations it needs no pagination, and unlike probing the
  // repo with an installation token it cannot false-negative on a public repo
  // the app was never granted. 404 means "the app is not installed on this
  // repository" — exactly the 409 condition the route reports.
  const installationResponse = await gh(`/repos/${owner}/${repo}/installation`, jwt, "Bearer");
  if (installationResponse.status === 404) return null;
  if (!installationResponse.ok) {
    throw new Error(`GitHub /repos/{owner}/{repo}/installation failed (${installationResponse.status})`);
  }
  const installation = (await installationResponse.json()) as {
    id: number;
    account: { id: number; type?: string } | null;
  };
  if (!installation.account) return null;

  const tokenResponse = await fetch(
    `https://api.github.com/app/installations/${installation.id}/access_tokens`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${jwt}`,
        accept: "application/vnd.github+json",
        "user-agent": "safina-cms",
      },
    },
  );
  if (!tokenResponse.ok) {
    throw new Error(`GitHub access_tokens failed (${tokenResponse.status})`);
  }
  const { token } = (await tokenResponse.json()) as { token: string };

  // The repo's numeric id isn't on the installation payload, so read it with the
  // installation token we just minted.
  const repoResponse = await gh(`/repos/${owner}/${repo}`, token, "token");
  if (!repoResponse.ok) throw new Error(`GitHub /repos failed (${repoResponse.status})`);
  const repoJson = (await repoResponse.json()) as { id: number };

  return {
    installationId: installation.id,
    ownerId: installation.account.id,
    repoId: repoJson.id,
    // Matches how lib/authz-server.ts and lib/accounts.ts normalize the GitHub
    // account type; lib/github-app.ts branches on exactly "org".
    ownerType: installation.account.type === "User" ? "user" : "org",
  };
};

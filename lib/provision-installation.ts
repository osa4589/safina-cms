type Installation = { installationId: number; ownerId: number; repoId: number };

const base64url = (input: ArrayBuffer | string): string => {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const importPrivateKey = async (pem: string): Promise<CryptoKey> => {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
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

  const installationsResponse = await gh("/app/installations?per_page=100", jwt, "Bearer");
  if (!installationsResponse.ok) {
    throw new Error(`GitHub /app/installations failed (${installationsResponse.status})`);
  }
  const installations = (await installationsResponse.json()) as {
    id: number;
    account: { id: number; login: string } | null;
  }[];

  const installation = installations.find(
    (candidate) => candidate.account?.login?.toLowerCase() === owner.toLowerCase(),
  );
  if (!installation || !installation.account) return null;

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

  // 404 here means the app is installed on the org but not on this repository.
  const repoResponse = await gh(`/repos/${owner}/${repo}`, token, "token");
  if (repoResponse.status === 404) return null;
  if (!repoResponse.ok) throw new Error(`GitHub /repos failed (${repoResponse.status})`);
  const repoJson = (await repoResponse.json()) as { id: number };

  return {
    installationId: installation.id,
    ownerId: installation.account.id,
    repoId: repoJson.id,
  };
};

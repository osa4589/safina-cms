import assert from "node:assert/strict";
import test from "node:test";
import { importPrivateKey } from "../lib/provision-installation";

// Keys are generated at test time via WebCrypto — nothing is read from disk and
// no key material is committed.

const toPem = (label: string, der: Uint8Array) => {
  let binary = "";
  der.forEach((byte) => { binary += String.fromCharCode(byte); });
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
};

// Minimal DER reader, only enough to walk PrivateKeyInfo.
const readTlv = (bytes: Uint8Array, offset: number) => {
  let length = bytes[offset + 1];
  let headerLength = 2;
  if (length & 0x80) {
    const lengthBytes = length & 0x7f;
    length = 0;
    for (let i = 0; i < lengthBytes; i += 1) length = length * 256 + bytes[offset + 2 + i];
    headerLength = 2 + lengthBytes;
  }
  return { start: offset + headerLength, end: offset + headerLength + length };
};

// PrivateKeyInfo ::= SEQUENCE { version, algorithm, privateKey OCTET STRING }
// The OCTET STRING contents are exactly the PKCS#1 RSAPrivateKey DER.
const pkcs8ToPkcs1 = (pkcs8: Uint8Array) => {
  const outer = readTlv(pkcs8, 0);
  const version = readTlv(pkcs8, outer.start);
  const algorithm = readTlv(pkcs8, version.end);
  const privateKey = readTlv(pkcs8, algorithm.end);
  return pkcs8.subarray(privateKey.start, privateKey.end);
};

const generateKeyMaterial = async () => {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;

  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  return { publicKey: keyPair.publicKey, pkcs8, pkcs1: pkcs8ToPkcs1(pkcs8) };
};

const signsCorrectly = async (pem: string, publicKey: CryptoKey) => {
  const key = await importPrivateKey(pem);
  const data = new TextEncoder().encode("header.payload");
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, data);
};

test("imports a PKCS#8 PEM and signs with it", async () => {
  const { publicKey, pkcs8 } = await generateKeyMaterial();
  assert.equal(await signsCorrectly(toPem("PRIVATE KEY", pkcs8), publicKey), true);
});

test("imports a PKCS#1 PEM (the format GitHub issues) and signs with it", async () => {
  const { publicKey, pkcs1 } = await generateKeyMaterial();
  assert.equal(await signsCorrectly(toPem("RSA PRIVATE KEY", pkcs1), publicKey), true);
});

test("accepts a PEM whose newlines arrive escaped as literal \\n", async () => {
  const { publicKey, pkcs1 } = await generateKeyMaterial();
  const escaped = toPem("RSA PRIVATE KEY", pkcs1).replace(/\n/g, "\\n");
  assert.equal(await signsCorrectly(escaped, publicKey), true);
});

test("rejects a non-PEM value with an actionable message", async () => {
  await assert.rejects(
    () => importPrivateKey("not-a-pem"),
    /BEGIN RSA PRIVATE KEY/,
  );
});

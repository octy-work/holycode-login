import crypto from "crypto";
import { describe, expect, test } from "vitest";
import { leadingZeroBits, solvePow } from "../pow";
import { issueChallenge, verifySolution } from "./pow";

const nodeDigest = async (data: Uint8Array) => {
  const hash = crypto.createHash("sha256").update(data).digest();
  return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength) as ArrayBuffer;
};

describe("proof-of-work", () => {
  test("leading zero bits", () => {
    expect(leadingZeroBits(new Uint8Array([0, 0, 0x0f]))).toBe(20);
    expect(leadingZeroBits(new Uint8Array([0x80]))).toBe(0);
    expect(leadingZeroBits(new Uint8Array([0, 1]))).toBe(15);
  });

  test("a solved challenge passes once; forged, reused and stale ones do not", async () => {
    const { challenge, difficulty } = issueChallenge();
    const nonce = (await solvePow(challenge, difficulty, nodeDigest)) as string;
    expect(nonce).toMatch(/^\d+$/);

    expect(verifySolution(challenge, nonce)).toBe(true);
    expect(verifySolution(challenge, nonce)).toBe(false); // single use

    const [ts, random] = challenge.split(".");
    expect(verifySolution(`${ts}.${random}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`, nonce)).toBe(false);

    const old = issueChallenge(Date.now() - 11 * 60 * 1000);
    const oldNonce = (await solvePow(old.challenge, old.difficulty, nodeDigest)) as string;
    expect(verifySolution(old.challenge, oldNonce)).toBe(false);
  });

  test("an unsolved nonce does not pass", () => {
    const { challenge } = issueChallenge();
    // Nonce 0 almost never has 16 zero bits; find one that does not.
    let n = 0;
    while (leadingZeroBits(new Uint8Array(crypto.createHash("sha256").update(`${challenge}:${n}`).digest())) >= 16) n++;
    expect(verifySolution(challenge, String(n))).toBe(false);
  });
});

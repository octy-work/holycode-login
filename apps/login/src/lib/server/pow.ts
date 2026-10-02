import "server-only";

import crypto from "crypto";
import { leadingZeroBits, POW_DIFFICULTY } from "../pow";

const TTL_MS = 10 * 60 * 1000;
// A fresh secret per process unless one is configured: a restart only makes the
// browser solve a new challenge.
const SECRET = process.env.HC_POW_SECRET || crypto.randomBytes(32).toString("hex");
const used = new Map<string, number>();

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url").slice(0, 32);
}

export function issueChallenge(now = Date.now()): { challenge: string; difficulty: number } {
  const payload = `${now}.${crypto.randomBytes(12).toString("base64url")}`;
  return { challenge: `${payload}.${sign(payload)}`, difficulty: POW_DIFFICULTY };
}

/** Our signature, not older than 10 minutes, not used before, and the work is done. */
export function verifySolution(challenge: string, nonce: string, now = Date.now()): boolean {
  if (typeof challenge !== "string" || typeof nonce !== "string" || challenge.length > 200 || !/^\d{1,9}$/.test(nonce)) {
    return false;
  }
  const parts = challenge.split(".");
  if (parts.length !== 3) return false;
  const [ts, random, signature] = parts;
  const payload = `${ts}.${random}`;
  const expected = sign(payload);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false;
  }
  const issued = Number(ts);
  if (!Number.isFinite(issued) || now - issued > TTL_MS || issued - now > 60_000) return false;
  used.forEach((at, key) => {
    if (now - at > TTL_MS) used.delete(key);
  });
  if (used.has(challenge)) return false;
  const hash = crypto.createHash("sha256").update(`${challenge}:${nonce}`).digest();
  if (leadingZeroBits(new Uint8Array(hash)) < POW_DIFFICULTY) return false;
  used.set(challenge, now);
  return true;
}

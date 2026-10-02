/**
 * HolyCode: proof-of-work on the form that creates a HolyCode mailbox (02.10.2026).
 *
 * The browser finds a nonce so that sha256(challenge + ":" + nonce) starts with
 * `difficulty` zero bits — about a second of work for a person, real cost for a
 * script creating mailboxes by the thousand. No third-party captcha (works in
 * Russia, nothing to load). The challenge is issued and checked by our server
 * (lib/server/pow.ts); this file is the shared, pure part.
 */

export const POW_DIFFICULTY = 16;

export function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** Browser side: find the nonce (WebCrypto; yields between batches so the page stays responsive). */
export async function solvePow(
  challenge: string,
  difficulty: number,
  digest: (data: Uint8Array) => Promise<ArrayBuffer> = (data) => crypto.subtle.digest("SHA-256", data as BufferSource),
  signal?: { cancelled: boolean },
): Promise<string | null> {
  const encoder = new TextEncoder();
  for (let nonce = 0; nonce < 50_000_000; nonce++) {
    if (signal?.cancelled) return null;
    const hash = new Uint8Array(await digest(encoder.encode(`${challenge}:${nonce}`)));
    if (leadingZeroBits(hash) >= difficulty) {
      return String(nonce);
    }
  }
  return null;
}

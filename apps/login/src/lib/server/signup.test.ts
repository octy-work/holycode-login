import { beforeEach, describe, expect, test, vi } from "vitest";
import { CONSENT_VERSION, serializeSignupState, SIGNUP_COOKIE_NAME } from "../signup";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "1.2.3.4" }),
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("../service-url", () => ({ getServiceConfig: () => ({ serviceConfig: { baseUrl: "https://id.test" } }) }));
vi.mock("../logger", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }));
vi.mock("@/lib/zitadel", () => ({
  addHumanUser: vi.fn(),
  addIDPLink: vi.fn(),
  getLoginSettings: vi.fn(),
  getSession: vi.fn(),
  listAuthenticationMethodTypes: vi.fn(),
  registerTOTP: vi.fn(),
  generateRecoveryCodes: vi.fn(),
  setUserMetadata: vi.fn(),
  verifyTOTPRegistration: vi.fn(),
}));
vi.mock("@/lib/server/cookie", () => ({ createSessionForIdpAndUpdateCookie: vi.fn() }));
vi.mock("../cookies", () => ({ getSessionCookieByLoginName: vi.fn() }));
vi.mock("../client", () => ({ completeFlowOrGetUrl: vi.fn() }));
vi.mock("../verify-helper", () => ({ checkMFAFactors: vi.fn() }));
vi.mock("./passkeys", () => ({ registerPasskeyLink: vi.fn(), verifyPasskeyRegistration: vi.fn() }));
vi.mock("./pow", () => ({ issueChallenge: vi.fn(), verifySolution: vi.fn(() => true) }));
vi.mock("./rate-limit", () => ({ allow: vi.fn(() => true) }));
vi.mock("./daenerys-signup", () => ({
  activateMailbox: vi.fn(),
  checkMailbox: vi.fn(),
  clientIpFrom: () => "1.2.3.4",
  createSignupOrg: vi.fn(),
  listSignupDomains: vi.fn(),
  recordConsent: vi.fn(),
  reserveMailbox: vi.fn(),
}));

const zitadel = await import("@/lib/zitadel");
const cookieMod = await import("@/lib/server/cookie");
const cookiesMod = await import("../cookies");
const client = await import("../client");
const verify = await import("../verify-helper");
const dny = await import("./daenerys-signup");
const powMod = await import("./pow");
const rateMod = await import("./rate-limit");
const {
  completeIdpSignup,
  confirmTotpSetup,
  startSignup,
  checkMailboxName,
  generateSignupRecoveryCodes,
  createSignupOrganization,
} = await import("./signup");

const base = {
  idpId: "idp1",
  idpUserId: "google-42",
  idpUserName: "rodion",
  idpIntent: { idpIntentId: "i1", idpIntentToken: "t1" },
  organization: "org1",
  requestId: "oidc_1",
  firstName: "Родион",
  lastName: "Отлетов",
  ownEmail: "rodion@gmail.com",
};

beforeEach(() => {
  jar.clear();
  vi.clearAllMocks();
  vi.mocked(zitadel.getLoginSettings).mockResolvedValue({ allowRegister: true } as any);
  vi.mocked(zitadel.addHumanUser).mockResolvedValue({ userId: "u1" } as any);
  vi.mocked(zitadel.addIDPLink).mockResolvedValue({} as any);
  vi.mocked(zitadel.listAuthenticationMethodTypes).mockResolvedValue({ authMethodTypes: [] } as any);
  vi.mocked(zitadel.setUserMetadata).mockResolvedValue({} as any);
  vi.mocked(cookieMod.createSessionForIdpAndUpdateCookie).mockResolvedValue({
    id: "s1",
    factors: { user: { id: "u1", loginName: "x", organizationId: "org1" } },
  } as any);
  vi.mocked(dny.recordConsent).mockResolvedValue({ ok: true, data: { ok: true } });
  vi.mocked(dny.listSignupDomains).mockResolvedValue([
    { domain: "holycode.org", group: "holycode" },
    { domain: "sozv.one", group: "product" },
  ]);
  vi.mocked(verify.checkMFAFactors).mockResolvedValue(undefined as any);
  vi.mocked(powMod.verifySolution).mockReturnValue(true);
  vi.mocked(rateMod.allow).mockReturnValue(true);
  vi.mocked(client.completeFlowOrGetUrl).mockResolvedValue({ redirect: "https://chat.holycode.org/" } as any);
});

describe("startSignup", () => {
  test("both consents are required", async () => {
    expect(await startSignup({ who: "personal", terms: true, pd: false })).toEqual({ error: "errors.consents" });
    expect(jar.has(SIGNUP_COOKIE_NAME)).toBe(false);
  });

  test("keeps who and the consent version in the cookie", async () => {
    expect(await startSignup({ who: "team", terms: true, pd: true, requestId: "oidc_1" })).toEqual({ ok: true });
    expect(JSON.parse(jar.get(SIGNUP_COOKIE_NAME) as string)).toMatchObject({
      w: "team",
      t: CONSENT_VERSION,
      p: CONSENT_VERSION,
      r: "oidc_1",
    });
  });
});

describe("completeIdpSignup", () => {
  test("no consents (no step 1, none ticked here) — nothing is created", async () => {
    const res = await completeIdpSignup({ ...base, mail: { kind: "own" } });
    expect(res).toEqual({ error: "errors.consents" });
    expect(zitadel.addHumanUser).not.toHaveBeenCalled();
  });

  test("own e-mail: account with the provider's address, link, consent journal, back to the service", async () => {
    const res = await completeIdpSignup({ ...base, mail: { kind: "own" }, consents: { terms: true, pd: true } });

    expect(zitadel.addHumanUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "rodion@gmail.com", emailVerified: false, organization: "org1" }),
    );
    expect(zitadel.addIDPLink).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", idp: { id: "idp1", userId: "google-42", userName: "rodion" } }),
    );
    expect(dny.recordConsent).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", version: CONSENT_VERSION }));
    expect(res).toEqual({ redirect: "https://chat.holycode.org/" });
  });

  test("new mailbox: reserved in Daenerys, the account gets the address verified, then the second-factor step", async () => {
    jar.set(SIGNUP_COOKIE_NAME, serializeSignupState({ who: "personal", terms: CONSENT_VERSION, pd: CONSENT_VERSION }));
    vi.mocked(dny.reserveMailbox).mockResolvedValue({
      ok: true,
      data: { reservation_id: "res1", address: "rodion@holycode.org", aliases: ["rodion@sozv.one"] },
    });

    const res = await completeIdpSignup({
      ...base,
      mail: { kind: "hosted", local: "Rodion", domain: "holycode.org", aliases: ["sozv.one", "evil.com"] },
      pow: { challenge: "c", nonce: "1" },
    });

    expect(dny.reserveMailbox).toHaveBeenCalledWith(
      expect.objectContaining({ local: "rodion", domain: "holycode.org", aliases: ["sozv.one"] }),
    );
    expect(zitadel.addHumanUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "rodion@holycode.org", emailVerified: true }),
    );
    expect(res).toEqual({ redirect: "/register/protect" });
    expect(JSON.parse(jar.get(SIGNUP_COOKIE_NAME) as string).m).toEqual({
      i: "res1",
      a: "rodion@holycode.org",
      x: ["rodion@sozv.one"],
    });
  });

  test("a taken name is refused before any account exists", async () => {
    jar.set(SIGNUP_COOKIE_NAME, serializeSignupState({ who: "personal", terms: CONSENT_VERSION, pd: CONSENT_VERSION }));
    vi.mocked(dny.reserveMailbox).mockResolvedValue({ ok: false, status: 409, code: "taken" });
    const res = await completeIdpSignup({
      ...base,
      mail: { kind: "hosted", local: "rodion", domain: "holycode.org", aliases: [] },
      pow: { challenge: "c", nonce: "1" },
    });
    expect(res).toEqual({ error: "errors.mailboxTaken" });
    expect(zitadel.addHumanUser).not.toHaveBeenCalled();
  });

  test("Daenerys journal down: the consent mark goes to Zitadel metadata", async () => {
    vi.mocked(dny.recordConsent).mockResolvedValue({ ok: false, status: 503, code: "signup_disabled" });
    await completeIdpSignup({ ...base, mail: { kind: "own" }, consents: { terms: true, pd: true } });
    expect(zitadel.setUserMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", entries: [expect.objectContaining({ key: "hc_consent" })] }),
    );
  });
});

test("a new mailbox without the proof-of-work is refused", async () => {
  jar.set(SIGNUP_COOKIE_NAME, serializeSignupState({ who: "personal", terms: CONSENT_VERSION, pd: CONSENT_VERSION }));
  vi.mocked(powMod.verifySolution).mockReturnValueOnce(false);
  const res = await completeIdpSignup({
    ...base,
    mail: { kind: "hosted", local: "rodion", domain: "holycode.org", aliases: [] },
    pow: { challenge: "forged", nonce: "1" },
  });
  expect(res).toEqual({ error: "errors.pow" });
  expect(dny.reserveMailbox).not.toHaveBeenCalled();
});

describe("second factor and switching the mailbox on", () => {
  beforeEach(() => {
    jar.set(
      SIGNUP_COOKIE_NAME,
      serializeSignupState({
        who: "personal",
        terms: CONSENT_VERSION,
        pd: CONSENT_VERSION,
        organization: "org1",
        reservation: { id: "res1", address: "rodion@holycode.org", aliases: [] },
      }),
    );
    vi.mocked(cookiesMod.getSessionCookieByLoginName).mockResolvedValue({ id: "s1", token: "tok" } as any);
    vi.mocked(zitadel.getSession).mockResolvedValue({ session: { factors: { user: { id: "u1" } } } } as any);
  });

  test("a wrong TOTP code does not reach Daenerys", async () => {
    vi.mocked(zitadel.verifyTOTPRegistration).mockRejectedValue(new Error("invalid"));
    expect(await confirmTotpSetup("123456")).toEqual({ error: "errors.totpCode" });
    expect(dny.activateMailbox).not.toHaveBeenCalled();
  });

  test("TOTP confirmed → Daenerys switches the mailbox on → step 6", async () => {
    vi.mocked(zitadel.verifyTOTPRegistration).mockResolvedValue({} as any);
    vi.mocked(dny.activateMailbox).mockResolvedValue({ ok: true, data: { address: "rodion@holycode.org", aliases: [] } });
    expect(await confirmTotpSetup("123 456")).toEqual({ redirect: "/register/done?address=rodion%40holycode.org" });
    expect(dny.activateMailbox).toHaveBeenCalledWith({ reservationId: "res1", userId: "u1" });

    // Step 6: ten recovery codes, once.
    vi.mocked(zitadel.generateRecoveryCodes).mockResolvedValue({ recoveryCodes: ["A1", "B2"] } as any);
    expect(await generateSignupRecoveryCodes()).toEqual({ codes: ["A1", "B2"] });
    expect(zitadel.generateRecoveryCodes).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", count: 10 }));
    expect(await generateSignupRecoveryCodes()).toEqual({ error: "done.codes.gone" });
  });

  test("Daenerys refuses without a second factor — the person is told so", async () => {
    vi.mocked(zitadel.verifyTOTPRegistration).mockResolvedValue({} as any);
    vi.mocked(dny.activateMailbox).mockResolvedValue({ ok: false, status: 409, code: "second_factor_required" });
    expect(await confirmTotpSetup("123456")).toEqual({ error: "errors.secondFactor" });
  });
});

describe("checkMailboxName", () => {
  test("bad names are answered here, without Daenerys", async () => {
    expect((await checkMailboxName({ local: "ab", domain: "holycode.org", aliases: [] })).status).toBe("short");
    expect(dny.checkMailbox).not.toHaveBeenCalled();
  });

  test("a domain not offered is refused, aliases outside the list are dropped", async () => {
    expect((await checkMailboxName({ local: "rodion", domain: "evil.com", aliases: [] })).status).toBe("domain");
    vi.mocked(dny.checkMailbox).mockResolvedValue({
      ok: true,
      data: {
        address: "rodion@holycode.org",
        available: true,
        aliases: [{ address: "rodion@sozv.one", available: false, reason: "taken" }],
      },
    });
    const answer = await checkMailboxName({ local: "rodion", domain: "holycode.org", aliases: ["sozv.one", "evil.com"] });
    expect(dny.checkMailbox).toHaveBeenCalledWith(expect.objectContaining({ aliases: ["sozv.one"] }));
    expect(answer).toEqual({
      status: "available",
      address: "rodion@holycode.org",
      aliases: [{ address: "rodion@sozv.one", available: false }],
    });
  });
});

describe("for a team", () => {
  test("after the account, the organization step instead of the service", async () => {
    jar.set(SIGNUP_COOKIE_NAME, serializeSignupState({ who: "team", terms: CONSENT_VERSION, pd: CONSENT_VERSION }));
    vi.mocked(cookieMod.createSessionForIdpAndUpdateCookie).mockResolvedValue({
      id: "s1",
      factors: { user: { id: "u1", loginName: "rodion@gmail.com", organizationId: "org1" } },
    } as any);

    const res = await completeIdpSignup({ ...base, mail: { kind: "own" } });

    expect(res).toEqual({ redirect: "/register/organization" });
    expect(client.completeFlowOrGetUrl).not.toHaveBeenCalled();
    expect(JSON.parse(jar.get(SIGNUP_COOKIE_NAME) as string).g).toBe("rodion@gmail.com");
  });

  test("the organization is created for that account and the admin opens with the domain", async () => {
    jar.set(
      SIGNUP_COOKIE_NAME,
      serializeSignupState({ who: "team", terms: CONSENT_VERSION, pd: CONSENT_VERSION, team: "rodion@gmail.com" }),
    );
    vi.mocked(cookiesMod.getSessionCookieByLoginName).mockResolvedValue({ id: "s1", token: "tok" } as any);
    vi.mocked(zitadel.getSession).mockResolvedValue({ session: { factors: { user: { id: "u1" } } } } as any);
    vi.mocked(dny.createSignupOrg).mockResolvedValue({ ok: true, data: { account_id: "acct-acme", name: "Acme" } });

    expect(await createSignupOrganization({ name: "A", domain: "" })).toEqual({ error: "org.errors.name" });
    expect(await createSignupOrganization({ name: "Acme", domain: "not a domain" })).toEqual({ error: "org.errors.domain" });

    const res = await createSignupOrganization({ name: " Acme ", domain: "https://Acme.RU/" });
    expect(dny.createSignupOrg).toHaveBeenCalledWith({ userId: "u1", name: "Acme" });
    expect(res).toEqual({ redirect: "https://chat.holycode.org/admin?org=acct-acme&domain=acme.ru" });
    expect(jar.has(SIGNUP_COOKIE_NAME)).toBe(false);
  });
});

"use client";

import {
  buildSilentSignInUrl,
  createDaenerysClient,
  daenerysApiUrl,
  DaenerysClient,
  DaenerysFailure,
  DaenerysResult,
  DaenerysUser,
  normalizeAccounts,
  normalizeUser,
  Organization,
  planSilentSignIn,
  profileReturnTo,
  readSsoMarker,
  stripSsoMarker,
} from "@/lib/daenerys";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DaenerysStatus = "loading" | "ready" | "unauthorized" | "unavailable";

export type DaenerysState = {
  status: DaenerysStatus;
  reason: DaenerysFailure | null;
  user: DaenerysUser | null;
  orgs: Organization[];
  client: DaenerysClient;
  /** A manual sign-in into the platform (regular SSO through the ID), back to the profile. */
  signInUrl: string;
  reload: () => void;
};

/**
 * The person's Daenerys session, once per page: GET /api/auth/me with the
 * .holycode.org cookie (renewed through the refresh cookie when expired). With
 * no cookie at all the page goes to Daenerys for one silent sign-in
 * (prompt=none) and comes back; if that did not yield a session either, the
 * Daenerys blocks show as unavailable and the rest of the profile works.
 */
export function useDaenerys(baseUrl: string): DaenerysState {
  const client = useMemo(() => createDaenerysClient({ baseUrl: daenerysApiUrl(baseUrl) }), [baseUrl]);
  const [status, setStatus] = useState<DaenerysStatus>("loading");
  const [reason, setReason] = useState<DaenerysFailure | null>(null);
  const [user, setUser] = useState<DaenerysUser | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [tick, setTick] = useState(0);
  const [signInUrl, setSignInUrl] = useState("");
  const leaving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const marker = readSsoMarker(window.location.href);
    if (marker.sso || marker.error) {
      try {
        window.history.replaceState(window.history.state, "", stripSsoMarker(window.location.href));
      } catch {
        // the markers stay; nothing breaks
      }
    }
    const returnTo = profileReturnTo(window.location);
    const manual = new URL(`${daenerysApiUrl(baseUrl)}/api/auth/oidc/start`);
    manual.searchParams.set("return_to", returnTo);
    setSignInUrl(manual.toString());

    setStatus("loading");
    client.me().then((result) => {
      if (cancelled || leaving.current) return;
      if (result.ok) {
        setUser(normalizeUser(result.data));
        setOrgs(normalizeAccounts(result.data));
        setReason(null);
        setStatus("ready");
        return;
      }
      setReason(result.reason);
      if (result.reason === "unauthorized") {
        let tabStorage: Storage | null;
        try {
          tabStorage = window.sessionStorage;
        } catch {
          tabStorage = null;
        }
        if (planSilentSignIn({ reason: result.reason, marker, tabStorage }) === "go") {
          leaving.current = true;
          window.location.assign(buildSilentSignInUrl(baseUrl, returnTo));
          return;
        }
        setStatus("unauthorized");
        return;
      }
      setStatus("unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [client, baseUrl, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return { status, reason, user, orgs, client, signInUrl, reload };
}

export type ResourceStatus = "idle" | "loading" | "ready" | "missing" | "unauthorized" | "unavailable";

export type Resource<T> = { status: ResourceStatus; data: T | null; message?: string; reload: () => void };

/**
 * One Daenerys block (sessions, activity, keys, deletion): loaded when the
 * session is ready, with its own unavailable states — `missing` when the route
 * does not exist yet (404/405/501).
 */
export function useDaenerysResource<T>(
  daenerys: DaenerysState,
  load: (client: DaenerysClient) => Promise<DaenerysResult<unknown>>,
  normalize: (data: unknown) => T,
  enabled = true,
): Resource<T> {
  const [status, setStatus] = useState<ResourceStatus>("idle");
  const [data, setData] = useState<T | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  const normalizeRef = useRef(normalize);
  loadRef.current = load;
  normalizeRef.current = normalize;

  useEffect(() => {
    if (!enabled) return;
    if (daenerys.status === "loading") {
      setStatus("loading");
      return;
    }
    if (daenerys.status === "unauthorized") {
      setStatus("unauthorized");
      return;
    }
    if (daenerys.status === "unavailable") {
      setStatus("unavailable");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    loadRef.current(daenerys.client).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setData(normalizeRef.current(result.data));
        setMessage(undefined);
        setStatus("ready");
        return;
      }
      setMessage(result.message);
      setStatus(result.reason === "missing" ? "missing" : result.reason === "unauthorized" ? "unauthorized" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [daenerys.status, daenerys.client, enabled, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return { status, data, message, reload };
}

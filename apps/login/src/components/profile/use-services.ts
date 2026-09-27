"use client";

import { normalizeServices, ServiceEntry, ServiceOrg, ServicesDirectory } from "@/lib/services";
import { useMemo } from "react";
import { DaenerysState, ResourceStatus, useDaenerysResource } from "./use-daenerys";

export type ServicesSource = "server" | "fallback";

export type ServicesState = {
  services: ServiceEntry[];
  org: ServiceOrg | null;
  /** Where the list came from: Daenerys, or the fallback (environment / production addresses). */
  source: ServicesSource;
  status: ResourceStatus;
};

/**
 * The directory of HolyCode services for the switcher: `GET /api/services` of
 * Daenerys through the profile's client (cookie, one refresh on 401), loaded
 * once the Daenerys session is known. Until then, and whenever the call fails
 * (no session, CORS on a local run, the route not there yet), the fallback list
 * is shown — without the panel, which only the server hands out. The active
 * organization for the links comes from the directory, or from the session
 * (`/api/auth/me`) when the directory did not come.
 */
export function useServices(daenerys: DaenerysState, fallback: ServiceEntry[]): ServicesState {
  const directory = useDaenerysResource<ServicesDirectory>(daenerys, (client) => client.services(), normalizeServices, {
    label: "services",
  });

  const activeOrg = daenerys.orgs.find((o) => o.active) ?? null;

  return useMemo(() => {
    const fromServer = directory.status === "ready" && directory.data && directory.data.services.length > 0;
    if (fromServer) {
      const org =
        directory.data!.org ?? (activeOrg ? { account_id: activeOrg.id, name: activeOrg.name, role: activeOrg.role } : null);
      return { services: directory.data!.services, org, source: "server" as const, status: directory.status };
    }
    const org: ServiceOrg | null = activeOrg
      ? { account_id: activeOrg.id, name: activeOrg.name, role: activeOrg.role }
      : null;
    return { services: fallback, org, source: "fallback" as const, status: directory.status };
  }, [directory.status, directory.data, activeOrg, fallback]);
}

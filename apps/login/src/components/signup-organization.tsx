"use client";

import { handleServerActionResponse } from "@/lib/client-utils";
import { createSignupOrganization, skipSignupOrganization } from "@/lib/server/signup";
import { BuildingOffice2Icon, GlobeAltIcon } from "@heroicons/react/24/solid";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "./alert";
import { Button, ButtonVariants } from "./button";
import { TextInput } from "./input";
import { OptionCardButton } from "./option-card";
import { Spinner } from "./spinner";

/**
 * HolyCode registration "for a team" (C1, 02.10.2026): the organization's name and
 * whether it has its own domain. Daenerys creates the organization with the person
 * as its owner; the domain is connected in the organization's admin (NS to
 * ns1–3.holycode.org or records only, ownership confirmed by DNS).
 */
export function SignupOrganization({ account }: { account: string }) {
  const t = useTranslations("signup");
  const router = useRouter();
  const [name, setName] = useState("");
  const [hasDomain, setHasDomain] = useState(true);
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => ReturnType<typeof createSignupOrganization>) {
    setError("");
    setLoading(true);
    try {
      if (!handleServerActionResponse(await action(), router, () => {}, setError)) {
        setError(t("errors.generic"));
      }
    } catch {
      setError(t("errors.generic"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex w-full flex-col space-y-1 text-left">
        <h1>{t("org.title")}</h1>
        <p className="ztdl-p">{t("org.description", { account })}</p>
      </div>
      <div className="mt-4 w-full">
        <TextInput
          type="text"
          autoComplete="organization"
          value={name}
          onChange={(e) => setName(e.target.value)}
          label={t("org.name")}
          hideErrorLine
          data-testid="org-name"
        />
        <span className="text-hc-text-2 mt-4 mb-1.5 block text-[12.5px] leading-4 font-semibold">
          {t("org.domainTitle")}
        </span>
        <div className="flex flex-col gap-2.5" role="radiogroup">
          <OptionCardButton
            icon={<GlobeAltIcon />}
            title={t("org.hasDomain")}
            description={t("org.hasDomainHint")}
            selected={hasDomain}
            onClick={() => setHasDomain(true)}
            trailing={null}
            role="radio"
            aria-checked={hasDomain}
            data-testid="org-has-domain"
          />
          {hasDomain && (
            <TextInput
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              label={t("org.domain")}
              placeholder="acme.ru"
              hideErrorLine
              data-testid="org-domain"
            />
          )}
          <OptionCardButton
            icon={<BuildingOffice2Icon />}
            title={t("org.noDomain")}
            description={t("org.noDomainHint")}
            selected={!hasDomain}
            onClick={() => setHasDomain(false)}
            trailing={null}
            role="radio"
            aria-checked={!hasDomain}
            data-testid="org-no-domain"
          />
        </div>
        {error && (
          <div className="mt-3" data-testid="error">
            <Alert>{error}</Alert>
          </div>
        )}
        <Button
          type="button"
          className="mt-4"
          variant={ButtonVariants.Primary}
          disabled={loading || name.trim().length < 2 || (hasDomain && !domain.trim())}
          onClick={() => run(() => createSignupOrganization({ name, domain: hasDomain ? domain : undefined }))}
          data-testid="org-create"
        >
          {loading && <Spinner className="h-5 w-5" />}
          {t("org.create")}
        </Button>
        <Button
          type="button"
          className="mt-2"
          variant={ButtonVariants.Ghost}
          disabled={loading}
          onClick={() => run(() => skipSignupOrganization())}
          data-testid="org-skip"
        >
          {t("org.skip")}
        </Button>
      </div>
    </>
  );
}

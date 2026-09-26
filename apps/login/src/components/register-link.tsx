"use client";

import { useRouter } from "next/navigation";
import { Translated } from "./translated";

/** "No account? Create one" — centered link under the sign-in options. */
export function RegisterLink({ organization, requestId }: { organization?: string; requestId?: string }) {
  const router = useRouter();

  return (
    <div className="flex justify-center">
      <button
        className="text-hc-link hover:text-hc-p500 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
        onClick={() => {
          const registerParams = new URLSearchParams();
          if (organization) {
            registerParams.append("organization", organization);
          }
          if (requestId) {
            registerParams.append("requestId", requestId);
          }

          router.push("/register?" + registerParams);
        }}
        type="button"
        data-testid="register-button"
      >
        <Translated i18nKey="register" namespace="loginname" />
      </button>
    </div>
  );
}

"use client";

import { Label, Radio, RadioGroup } from "@headlessui/react";
import { FingerPrintIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { optionCardClasses } from "./option-card";
import { OptionalTranslated } from "./optional-translated";
import { Translated } from "./translated";

export enum AuthenticationMethod {
  Passkey = "passkey",
  Password = "password",
}

export const methods = [AuthenticationMethod.Passkey, AuthenticationMethod.Password];

/** "How will you sign in?" — passkey first, password second, as stacked option cards. */
export function AuthenticationMethodRadio({
  selected,
  selectionChanged,
}: {
  selected: any;
  selectionChanged: (value: any) => void;
}) {
  return (
    <div className="w-full">
      <RadioGroup value={selected} onChange={selectionChanged} className="flex flex-col gap-2.5">
        <Label className="sr-only">
          <Translated i18nKey="selectMethod" namespace="register" />
        </Label>
        {methods.map((method) => (
          <Radio
            key={method}
            value={method}
            data-testid={method + "-radio"}
            className={({ checked }) => clsx(optionCardClasses({ selected: checked, interactive: true }))}
          >
            {({ checked }) => (
              <>
                <div className="bg-hc-soft text-hc-p400 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]">
                  {method === AuthenticationMethod.Passkey ? (
                    <FingerPrintIcon className="h-5 w-5" />
                  ) : (
                    <LockClosedIcon className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Label className="block text-[15px] leading-tight font-semibold">
                    <Translated i18nKey={`methods.${method}`} namespace="register" />
                  </Label>
                  <div className="text-hc-muted mt-0.5 text-[12.5px] leading-snug">
                    <OptionalTranslated i18nKey={`methodDescriptions.${method}`} namespace="register" />
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  className={clsx(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                    checked ? "border-hc-p500 bg-hc-p500" : "border-hc-input-border",
                  )}
                >
                  {checked && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
              </>
            )}
          </Radio>
        ))}
      </RadioGroup>
    </div>
  );
}

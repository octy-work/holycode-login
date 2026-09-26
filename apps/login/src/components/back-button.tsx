"use client";

import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { useRouter } from "next/navigation";
import { Button, ButtonVariants } from "./button";
import { Translated } from "./translated";

export function BackButton(props: { "data-testid"?: string; className?: string }) {
  const router = useRouter();
  return (
    <Button onClick={() => router.back()} type="button" variant={ButtonVariants.Ghost} {...props}>
      <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
      <Translated i18nKey="back" namespace="common" />
    </Button>
  );
}

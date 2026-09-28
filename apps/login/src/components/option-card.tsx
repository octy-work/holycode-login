import { ChevronRightIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import Link from "next/link";
import { ComponentProps, ReactNode } from "react";

type BaseProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Right-hand slot; defaults to a chevron for links/buttons. */
  trailing?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
};

export const optionCardClasses = (opts: { selected?: boolean; disabled?: boolean; interactive?: boolean }) =>
  clsx(
    "flex w-full items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-all duration-200",
    "bg-hc-input border-hc-input-border text-hc-text",
    opts.interactive &&
      !opts.disabled &&
      "hover:border-hc-p500 focus-visible:border-hc-p500 focus-visible:ring-hc-ring cursor-pointer focus-visible:ring-[3px] focus-visible:outline-none",
    opts.selected && "border-hc-p500 ring-hc-ring ring-[3px]",
    opts.disabled && "cursor-default opacity-50",
  );

function OptionCardBody({ icon, title, description, trailing, interactive }: BaseProps & { interactive: boolean }) {
  return (
    <>
      {icon && (
        <div className="bg-hc-soft text-hc-p400 flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] leading-tight font-semibold">{title}</div>
        {description && <div className="text-hc-muted mt-0.5 text-[12.5px] leading-snug">{description}</div>}
      </div>
      {trailing !== undefined
        ? trailing
        : interactive && <ChevronRightIcon className="text-hc-muted h-4 w-4 shrink-0" aria-hidden="true" />}
    </>
  );
}

/** A choice rendered as a card — auth methods, accounts, mail options. */
export function OptionCard(props: BaseProps & { as?: "div" }) {
  const { selected, disabled, className, ...rest } = props;
  return (
    <div className={clsx(optionCardClasses({ selected, disabled, interactive: false }), className)} aria-disabled={disabled}>
      <OptionCardBody {...rest} interactive={false} />
    </div>
  );
}

export function OptionCardLink(props: BaseProps & Omit<ComponentProps<typeof Link>, "title" | "className">) {
  const { icon, title, description, trailing, selected, disabled, className, ...linkProps } = props;
  return (
    <Link {...linkProps} className={clsx(optionCardClasses({ selected, disabled, interactive: true }), className)}>
      <OptionCardBody icon={icon} title={title} description={description} trailing={trailing} interactive />
    </Link>
  );
}

export function OptionCardButton(props: BaseProps & Omit<ComponentProps<"button">, "title" | "className" | "disabled">) {
  const { icon, title, description, trailing, selected, disabled, className, type = "button", ...buttonProps } = props;
  return (
    <button
      type={type}
      disabled={disabled}
      aria-pressed={selected}
      {...buttonProps}
      className={clsx(optionCardClasses({ selected, disabled, interactive: true }), className)}
    >
      <OptionCardBody icon={icon} title={title} description={description} trailing={trailing} interactive />
    </button>
  );
}

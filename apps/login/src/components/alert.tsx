import { ExclamationTriangleIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { clsx } from "clsx";
import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  type?: AlertType;
};

export enum AlertType {
  ALERT,
  INFO,
}

const error = "border-hc-err-border bg-hc-err-bg text-hc-err-text";
const info = "border-hc-p500/35 bg-hc-soft text-hc-text-2";

export function Alert({ children, type = AlertType.ALERT }: Props) {
  return (
    <div
      role={type === AlertType.ALERT ? "alert" : "status"}
      className={clsx(
        "flex w-full flex-row items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] leading-snug",
        {
          [error]: type === AlertType.ALERT,
          [info]: type === AlertType.INFO,
        },
      )}
    >
      {type === AlertType.ALERT && <ExclamationTriangleIcon className="mt-px h-4 w-4 flex-shrink-0" />}
      {type === AlertType.INFO && <InformationCircleIcon className="text-hc-p400 mt-px h-4 w-4 flex-shrink-0" />}
      <span className="w-full">{children}</span>
    </div>
  );
}

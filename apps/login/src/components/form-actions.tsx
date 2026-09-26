import { ReactNode } from "react";

/**
 * Bottom of a form: the primary action stretched to the card width, secondary
 * actions (back, alternative method) centered underneath.
 */
export function FormActions({
  primary,
  secondary,
  className = "mt-5",
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex w-full flex-col items-stretch gap-1.5 ${className}`}>
      {primary}
      {secondary && <div className="flex flex-wrap items-center justify-center gap-x-2">{secondary}</div>}
    </div>
  );
}

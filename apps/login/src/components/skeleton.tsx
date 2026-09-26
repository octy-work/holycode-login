import { ReactNode } from "react";

export function Skeleton({ children }: { children?: ReactNode }) {
  return (
    <div className="skeleton border-hc-border flex flex-row items-center justify-center rounded-[20px] border px-8 py-12">
      {children}
    </div>
  );
}

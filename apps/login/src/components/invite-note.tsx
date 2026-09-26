import { ReactNode } from "react";

/** Soft purple note card ("Were you invited?", invitation context on register). */
export function Note({ title, children, icon }: { title?: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="bg-hc-soft border-hc-p500/35 text-hc-text-2 flex gap-3 rounded-[14px] border px-3.5 py-3 text-left text-[13px] leading-snug">
      {icon && <div className="text-hc-p400 mt-0.5 shrink-0 [&>svg]:h-5 [&>svg]:w-5">{icon}</div>}
      <div className="min-w-0">
        {title && <div className="text-hc-text mb-0.5 font-semibold">{title}</div>}
        {children}
      </div>
    </div>
  );
}

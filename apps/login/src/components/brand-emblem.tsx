// Эмблема HolyCode отдельным модулем: её рисуют и знак карточки (brand-mark.tsx), и
// кнопка провайдера «HolyCode» на страницах входа организаций (idps/idp-icons.tsx).
/**
 * HolyCode emblem (apps/holycode-web/public/favicon.svg of the site), inlined so it
 * needs no extra request and works under any basePath.
 */
export function BrandEmblem({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 250 250" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <rect width="250" height="250" rx="59" fill="url(#hc-emblem-gradient)" />
      <path
        d="M163.196 83H90.125C67.1954 83 48.6072 101.588 48.6072 124.518C48.6072 147.448 67.1954 166.036 90.125 166.036H163.196C186.126 166.036 204.714 147.448 204.714 124.518C204.714 101.588 186.126 83 163.196 83Z"
        stroke="white"
        strokeOpacity="0.58"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M103.411 83C126.661 83 126.661 166.036 149.911 166.036"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M103.411 166.036C126.661 166.036 126.661 83 149.911 83"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M178.143 83H71.8572C48.9275 83 30.3394 101.588 30.3394 124.518C30.3394 147.448 48.9275 166.036 71.8572 166.036H178.143C201.073 166.036 219.661 147.448 219.661 124.518C219.661 101.588 201.073 83 178.143 83Z"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="hc-emblem-gradient" x1="3" y1="226" x2="234.5" y2="29.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7941FF" />
          <stop offset="1" stopColor="#6FA7FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

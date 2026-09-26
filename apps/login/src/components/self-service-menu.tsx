import Link from "next/link";

export function SelfServiceMenu() {
  const list: any[] = [];

  // if (!!config.selfservice.change_password.enabled) {
  //   list.push({
  //     link:
  //       `/me/change-password?` +
  //       new URLSearchParams({
  //         sessionId: sessionId,
  //       }),
  //     name: "Change password",
  //   });
  // }

  return (
    <div className="flex w-full flex-col space-y-2">
      {list.map((menuitem, index) => {
        return <SelfServiceItem link={menuitem.link} key={"self-service-" + index} name={menuitem.name} />;
      })}
    </div>
  );
}

const SelfServiceItem = ({ name, link }: { name: string; link: string }) => {
  return (
    <Link
      prefetch={false}
      href={link}
      className="group bg-hc-input border-hc-input-border hover:border-hc-p500 flex w-full flex-row items-center rounded-[14px] border px-3.5 py-3 transition-all"
    >
      {name}
    </Link>
  );
};

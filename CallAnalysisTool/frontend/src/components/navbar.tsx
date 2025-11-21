"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import React from "react";

import normanPDLogo from "@/../public/norman-pd-logo.svg";
import evaluateIconBlack from "@/../public/evaluate-icon-black.svg";
import evaluateIconWhite from "@/../public/evaluate-icon-white.svg";
import dispatcherIconWhite from "@/../public/employee-icon-white.png";
import dispatcherIconBlack from "@/../public/employee-icon-black.png";
import helpIconWhite from "@/../public/help-icon-white.svg";
import helpIconBlack from "@/../public/help-icon-black.svg";

const Navbar = () => {
  const pathname = usePathname();

  const iconSizes = {
    dashboard: { width: 40, height: 40 },
    evaluate: { width: 40, height: 40 },
    help: { width: 28, height: 32 },
  };

  const navItem = (
    href: string,
    title: string,
    iconWhite: any,
    iconBlack: any,
    sizeKey: keyof typeof iconSizes
  ) => {
    const isActive = pathname === href;

    return (
      <Link
        href={href}
        className={`${
          isActive ? "text-[#002d62] bg-white" : "text-white"
        } font-roboto font-bold text-2xl rounded-[10px] px-6 py-3 flex items-center gap-4 w-full`}
      >
        <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
          <Image
            src={isActive ? iconBlack : iconWhite}
            alt={title}
            width={iconSizes[sizeKey].width}
            height={iconSizes[sizeKey].height}
            className="object-contain"
          />
        </div>
        <span className="flex-1 text-left">{title}</span>
      </Link>
    );
  };

  return (
    <div className="w-[180px] sm:w-[220px] md:w-[260px] lg:w-[290px] min-h-screen bg-[#002d62] flex flex-col sticky top-0">
      {/* Logo */}
      <div className="flex justify-center pt-8 pb-8">
        <Link href="/">
          <Image src={normanPDLogo} alt="logo" width={180} height={180} />
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex flex-col gap-8 items-center px-6">
        {navItem("/", "Dispatchers", dispatcherIconWhite, dispatcherIconBlack, "dashboard")}
        {navItem("/evaluate-calls", "Evaluate", evaluateIconWhite, evaluateIconBlack, "evaluate")}
        {navItem("/help", "Help", helpIconWhite, helpIconBlack, "help")}
      </div>
    </div>
  );
};

export default Navbar;

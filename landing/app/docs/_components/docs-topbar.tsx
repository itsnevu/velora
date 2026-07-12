"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VeloraLogo } from "@/components/ui/velora-logo";
import { GITHUB_URL } from "../_content/site";
import { GitHubMark } from "./icons";
import { NavList } from "./docs-sidebar";
import { cn } from "@/lib/cn";

/** Sticky docs top bar: brand, back-to-site, GitHub, and the mobile nav drawer. */
export function DocsTopbar() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="docs-topbar">
        <div className="docs-topbar-inner">
          <Link href="/docs" className="docs-brand">
            <VeloraLogo size={30} />
            <span>
              VELORA<span className="docs-brand-sub">/ DOCS</span>
            </span>
          </Link>

          <div className="docs-topbar-actions">
            <Link href="/" className="docs-top-link">
              ← Site
            </Link>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="docs-top-link gh">
              <GitHubMark />
              GitHub
            </a>
            <button
              type="button"
              className="docs-burger"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <div className={cn("docs-drawer", open && "open")} role="dialog" aria-modal={open} aria-label="Navigation">
        <div className="docs-drawer-head">
          <span className="docs-drawer-title">DOCUMENTATION</span>
          <button type="button" className="docs-drawer-close" aria-label="Close navigation" onClick={() => setOpen(false)}>
            ✕
          </button>
        </div>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="docs-drawer-gh">
          <GitHubMark /> github.com/itsnevu/velora
        </a>
        <NavList onNavigate={() => setOpen(false)} />
      </div>
    </>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_SECTIONS = [
  {
    label: "Getting Started",
    links: [
      { href: "/", label: "Introduction" },
      { href: "/how-it-works", label: "How It Works" },
      { href: "/quickstart", label: "Quick Start" },
    ],
  },
  {
    label: "CLI",
    links: [
      { href: "/cli/overview", label: "Overview" },
      { href: "/cli/reference", label: "Command Reference" },
    ],
  },
  {
    label: "SDK",
    links: [
      { href: "/sdk", label: "SDK Reference" },
    ],
  },
  {
    label: "Architecture",
    links: [
      { href: "/architecture", label: "Architecture" },
      { href: "/self-hosting", label: "Self-Hosting" },
    ],
  },
];

export function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <nav className="nav">
        <Link href="/" className="nav-logo">
          <span className="nav-logo-mark">F</span>
          FlowDB
        </Link>
        <span className="nav-badge">v0.1 · Beta</span>
        <div className="nav-links">
          <Link href="/" className="nav-link">Docs</Link>
          <a
            href="https://github.com/Vijayaa21/flowDB"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-github"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            GitHub
          </a>
        </div>
      </nav>

      <div className="shell">
        <aside className="sidebar">
          {NAV_SECTIONS.map((section) => (
            <div className="sidebar-section" key={section.label}>
              <div className="sidebar-label">{section.label}</div>
              <ul className="sidebar-nav">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={`sidebar-link${pathname === link.href ? " active" : ""}`}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <main className="main prose">
          {children}
        </main>
      </div>
    </>
  );
}

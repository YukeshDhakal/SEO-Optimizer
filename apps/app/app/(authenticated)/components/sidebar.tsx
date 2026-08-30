"use client";

import { UserMenu } from "@repo/auth/components/user-menu";
import type { Tables } from "@repo/database";
import { ModeToggle } from "@repo/design-system/components/mode-toggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@repo/design-system/components/ui/sidebar";
import { StatusDot } from "@repo/design-system/components/status-pill";
import { cn } from "@repo/design-system/lib/utils";
import { FileTextIcon, GlobeIcon, LayoutGridIcon, ShieldIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface SidebarSite {
  readonly id: string;
  readonly display_name: string;
  readonly status: string;
  readonly paused: boolean;
  readonly consecutive_publish_failures: number;
}

interface GlobalSidebarProperties {
  readonly children: ReactNode;
  readonly organization: Tables<"organizations">;
  readonly sites: SidebarSite[];
  readonly requireApproval: boolean;
}

const siteDotStatus = (site: SidebarSite) => {
  if (site.paused) {
    return "paused" as const;
  }
  if (site.status === "error" || site.consecutive_publish_failures >= 3) {
    return "failed" as const;
  }
  if (site.status === "connected") {
    return "ok" as const;
  }
  return "await" as const;
};

// Dark shell (see --sidebar/-foreground/-accent/-border tokens in
// packages/design-system/styles/globals.css - these already matched the
// Quillrun Design handoff's palette from the earlier partial reskin,
// commit 6e5492e; the component itself just never applied them). Four
// flat nav destinations, no nested submenu, matching the handoff exactly
// - Billing lives inside Settings instead of its own nav slot, Webhooks
// (a next-forge Svix demo, unconfigured per PRD.md §5, not part of the
// designed product) is dropped rather than carried forward unstyled.
export const GlobalSidebar = ({
  children,
  organization,
  sites,
  requireApproval,
}: GlobalSidebarProperties) => {
  const pathname = usePathname();
  const initials = organization.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const navItems = [
    { key: "overview", label: "Overview", href: "/", icon: LayoutGridIcon },
    { key: "sites", label: "Sites", href: "/sites", icon: GlobeIcon },
    { key: "audit", label: "Audit log", href: "/settings/audit", icon: FileTextIcon },
    {
      key: "settings",
      label: "Settings",
      href: "/settings",
      icon: ShieldIcon,
      badge: requireApproval ? null : "off",
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const onSitePage = pathname.startsWith("/sites/") && pathname !== "/sites";

  return (
    <>
      <Sidebar variant="inset">
        <SidebarHeader className="gap-0 border-sidebar-border border-b px-3 py-3.5">
          <div className="flex items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-sidebar-primary font-mono font-semibold text-[10.5px] text-sidebar-primary-foreground">
              {initials}
            </div>
            <span className="truncate font-semibold text-[13px] text-sidebar-foreground">
              {organization.name}
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-0 px-2 py-3">
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-2.5 font-mono text-[10px] text-sidebar-foreground/45 uppercase tracking-widest">
              Workspace
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      isActive(item.href) &&
                        "bg-sidebar-accent text-sidebar-foreground"
                    )}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {item.badge && (
                    <SidebarMenuBadge className="rounded-[4px] bg-status-warning-bg font-mono text-[10px] text-status-warning-fg">
                      {item.badge}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup className="mt-3 p-0">
            <SidebarGroupLabel className="px-2.5 font-mono text-[10px] text-sidebar-foreground/45 uppercase tracking-widest">
              Sites
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {sites.length === 0 && (
                <p className="px-2.5 py-1.5 text-[12px] text-sidebar-foreground/45">
                  No sites yet
                </p>
              )}
              {sites.map((site) => (
                <SidebarMenuItem key={site.id}>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      "gap-2.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      onSitePage &&
                        pathname.startsWith(`/sites/${site.id}`) &&
                        "bg-sidebar-accent text-sidebar-foreground"
                    )}
                    size="sm"
                  >
                    <Link href={`/sites/${site.id}`}>
                      <StatusDot status={siteDotStatus(site)} />
                      <span className="truncate">{site.display_name}</span>
                    </Link>
                  </SidebarMenuButton>
                  {site.paused && site.consecutive_publish_failures >= 3 && (
                    <SidebarMenuBadge className="font-mono text-[10px] text-status-error-fg">
                      ✕
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="gap-2 border-sidebar-border border-t px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-sidebar-foreground/70 text-xs [&_button]:text-sidebar-foreground/50 [&_button:hover]:text-sidebar-foreground [&_span]:text-sidebar-foreground/85">
              <UserMenu />
            </div>
            <ModeToggle />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>{children}</SidebarInset>
    </>
  );
};

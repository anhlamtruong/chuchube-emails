import { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { cn } from "@/lib/utils";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  Table,
  FileCode,
  Paperclip,
  Send,
  Calendar,
  Settings,
  Menu,
  X,
  Mail,
  Coffee,
  Heart,
  ShieldAlert,
} from "lucide-react";
import { checkAdmin } from "../api/client";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/recruiters", label: "Recruiters", icon: Users },
  { to: "/referrals", label: "Referrals", icon: UserCheck },
  { to: "/campaigns", label: "Campaigns", icon: Table },
  { to: "/templates", label: "Templates", icon: FileCode },
  { to: "/documents", label: "Documents", icon: Paperclip },
  { to: "/send", label: "Send Emails", icon: Send },
  { to: "/scheduled-jobs", label: "Scheduled Jobs", icon: Calendar },
  { to: "/settings", label: "Settings", icon: Settings },
];

function SidebarContent({
  onNavigate,
  isAdmin,
}: {
  onNavigate?: () => void;
  isAdmin?: boolean;
}) {
  return (
    <>
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Mail size={16} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-sidebar-foreground leading-none">
              ChuChuBe
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Emails</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
        {isAdmin && (
          <NavLink
            to="/admin"
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )
            }
          >
            <ShieldAlert size={18} />
            Admin
          </NavLink>
        )}
      </nav>
      {/* Buy Me a Coffee */}
      <div className="px-3 pb-2">
        <a
          href="https://www.buymeacoffee.com/alantruong"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200/60 hover:from-amber-100 hover:to-yellow-100 hover:border-amber-300 hover:shadow-sm transition-all duration-200"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 group-hover:bg-amber-500 transition-colors shadow-sm">
            <Coffee size={14} className="text-white" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-900 leading-none">
              Support Our Team
            </p>
            <p className="text-[10px] text-amber-700/70 mt-0.5 flex items-center gap-0.5">
              Buy us a coffee{" "}
              <Heart
                size={8}
                className="inline fill-amber-400 text-amber-400"
              />
            </p>
          </div>
        </a>
      </div>

      <div className="p-4 border-t border-sidebar-border flex items-center gap-3">
        <UserButton
          afterSignOutUrl="/login"
          appearance={{
            elements: { avatarBox: "w-8 h-8" },
          }}
        />
        <span className="text-sm text-sidebar-foreground/70">Account</span>
      </div>
    </>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  useScrollToTop();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdmin()
      .then((res) => setIsAdmin(res.is_admin))
      .catch(() => setIsAdmin(false));
  }, []);

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        <SidebarContent isAdmin={isAdmin} />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-72 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
            <SidebarContent
              onNavigate={() => setMobileOpen(false)}
              isAdmin={isAdmin}
            />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-primary" />
            <span className="font-semibold text-sm">ChuChuBe Emails</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>

        {/* Footer */}
        <footer className="border-t border-border px-4 py-3 bg-muted/30">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Link
              to="/terms"
              className="hover:text-foreground hover:underline transition-colors"
            >
              Terms of Service
            </Link>
            <span className="hidden sm:inline">&middot;</span>
            <Link
              to="/privacy"
              className="hover:text-foreground hover:underline transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="hidden sm:inline">&middot;</span>
            <Link
              to="/consent"
              className="hover:text-foreground hover:underline transition-colors"
            >
              Consent &amp; Security
            </Link>
            <span className="hidden sm:inline">&middot;</span>
            <a
              href="https://www.buymeacoffee.com/alantruong"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-amber-600 transition-colors"
            >
              <Coffee size={12} className="text-amber-500" />
              Support Us
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

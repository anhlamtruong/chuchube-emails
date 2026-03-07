import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  KeyRound,
  Loader2,
  Building2,
  ShieldAlert,
  Bot,
  MailWarning,
  Users,
  CalendarX2,
  Briefcase,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { checkAdmin } from "../api/client";
import AccessKeysTab from "./admin/AccessKeysTab";
import OrgAccountsTab from "./admin/OrgAccountsTab";
import BounceMonitorTab from "./admin/BounceMonitorTab";
import OllamaTab from "./admin/OllamaTab";
import OooManagementTab from "./admin/OooManagementTab";
import AdminJobsTab from "./admin/AdminJobsTab";
import UsersRolesTab from "./admin/UsersRolesTab";

export default function AdminPage() {
  usePageTitle("Admin");
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [adminRole, setAdminRole] = useState<string>("");
  const [activeTab, setActiveTab] = useState("access-keys");

  useEffect(() => {
    checkAdmin()
      .then((res) => {
        if (!res.is_admin) {
          toast.error("Admin access required");
          navigate("/");
        } else {
          setIsAdmin(true);
          setAdminRole(res.role || "admin");
        }
      })
      .catch(() => {
        toast.error("Admin access required");
        navigate("/");
      });
  }, [navigate]);

  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Admin Panel</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap gap-1 h-auto p-1">
          <TabsTrigger value="access-keys" className="gap-1.5">
            <KeyRound size={14} /> Access Keys
          </TabsTrigger>
          <TabsTrigger value="org-accounts" className="gap-1.5">
            <Building2 size={14} /> Org Accounts
          </TabsTrigger>
          <TabsTrigger value="bounce-monitor" className="gap-1.5">
            <MailWarning size={14} /> Bounce Monitor
          </TabsTrigger>
          <TabsTrigger value="ollama" className="gap-1.5">
            <Bot size={14} /> Ollama / AI
          </TabsTrigger>
          <TabsTrigger value="ooo-management" className="gap-1.5">
            <CalendarX2 size={14} /> OOO Management
          </TabsTrigger>
          {adminRole === "master_admin" && (
            <TabsTrigger value="admin-jobs" className="gap-1.5">
              <Briefcase size={14} /> All Jobs
            </TabsTrigger>
          )}
          {adminRole === "master_admin" && (
            <TabsTrigger value="users-roles" className="gap-1.5">
              <Users size={14} /> Users & Roles
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="access-keys" className="mt-4">
          <AccessKeysTab />
        </TabsContent>

        <TabsContent value="org-accounts" className="mt-4">
          <OrgAccountsTab />
        </TabsContent>

        <TabsContent value="bounce-monitor" className="mt-4">
          <BounceMonitorTab />
        </TabsContent>

        <TabsContent value="ollama" className="mt-4">
          <OllamaTab />
        </TabsContent>

        <TabsContent value="ooo-management" className="mt-4">
          <OooManagementTab />
        </TabsContent>

        {adminRole === "master_admin" && (
          <TabsContent value="admin-jobs" className="mt-4">
            <AdminJobsTab />
          </TabsContent>
        )}

        {adminRole === "master_admin" && (
          <TabsContent value="users-roles" className="mt-4">
            <UsersRolesTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

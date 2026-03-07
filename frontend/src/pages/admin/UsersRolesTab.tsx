import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, Loader2, Users, Check, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  listUserRoles,
  createUserRole,
  updateUserRole,
  deleteUserRole,
} from "../../api/client";
import type { UserRoleItem } from "../../api/client";

export default function UsersRolesTab() {
  const [userRoles, setUserRoles] = useState<UserRoleItem[]>([]);
  const [userRolesLoading, setUserRolesLoading] = useState(false);
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "user">("user");
  const [addingUser, setAddingUser] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editRoleValue, setEditRoleValue] = useState<"admin" | "user">("user");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const fetchUserRoles = useCallback(async () => {
    setUserRolesLoading(true);
    try {
      setUserRoles(await listUserRoles());
    } catch {
      // Not master_admin — silently ignore
    } finally {
      setUserRolesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserRoles();
  }, [fetchUserRoles]);

  const handleAddUser = async () => {
    if (!newUserId.trim()) {
      toast.error("User ID is required");
      return;
    }
    setAddingUser(true);
    try {
      await createUserRole({
        user_id: newUserId.trim(),
        email: newUserEmail.trim() || undefined,
        role: newUserRole,
      });
      toast.success(`Role '${newUserRole}' assigned to ${newUserId.trim()}`);
      setShowAddUserDialog(false);
      setNewUserId("");
      setNewUserEmail("");
      setNewUserRole("user");
      fetchUserRoles();
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail;
      toast.error(
        typeof detail === "string" ? detail : "Failed to add user role",
      );
    } finally {
      setAddingUser(false);
    }
  };

  const handleUpdateRole = async (userId: string) => {
    try {
      await updateUserRole(userId, editRoleValue);
      toast.success(`Role updated to '${editRoleValue}'`);
      setEditingRole(null);
      fetchUserRoles();
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail;
      toast.error(
        typeof detail === "string" ? detail : "Failed to update role",
      );
    }
  };

  const handleDeleteRole = async (userId: string) => {
    try {
      await deleteUserRole(userId);
      toast.success("User role removed");
      fetchUserRoles();
    } catch (e: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detail = (e as any)?.response?.data?.detail;
      toast.error(
        typeof detail === "string" ? detail : "Failed to delete role",
      );
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Manage user roles. Assign <strong>admin</strong> or{" "}
            <strong>user</strong> roles to Clerk users.
          </p>
          <Button
            size="sm"
            onClick={() => {
              setNewUserId("");
              setNewUserEmail("");
              setNewUserRole("user");
              setShowAddUserDialog(true);
            }}
          >
            <Plus size={14} className="mr-1" /> Add User
          </Button>
        </div>

        {userRolesLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin w-5 h-5 text-muted-foreground" />
          </div>
        ) : userRoles.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No user roles configured.
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">User ID</th>
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-left px-4 py-2 font-medium">Role</th>
                  <th className="text-left px-4 py-2 font-medium">
                    Assigned By
                  </th>
                  <th className="text-left px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {userRoles.map((ur) => (
                  <tr key={ur.id} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-mono text-xs">
                      {ur.user_id.length > 20
                        ? `${ur.user_id.slice(0, 20)}...`
                        : ur.user_id}
                    </td>
                    <td className="px-4 py-2 text-xs">{ur.email || "—"}</td>
                    <td className="px-4 py-2">
                      {editingRole === ur.user_id ? (
                        <div className="flex items-center gap-1">
                          <select
                            className="text-xs border rounded px-1 py-0.5"
                            value={editRoleValue}
                            onChange={(e) =>
                              setEditRoleValue(
                                e.target.value as "admin" | "user",
                              )
                            }
                          >
                            <option value="admin">admin</option>
                            <option value="user">user</option>
                          </select>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1"
                            onClick={() => handleUpdateRole(ur.user_id)}
                          >
                            <Check size={12} />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1"
                            onClick={() => setEditingRole(null)}
                          >
                            <ShieldX size={12} />
                          </Button>
                        </div>
                      ) : (
                        <Badge
                          variant={
                            ur.role === "master_admin"
                              ? "default"
                              : ur.role === "admin"
                                ? "secondary"
                                : "outline"
                          }
                          className="cursor-pointer"
                          onClick={() => {
                            if (ur.role !== "master_admin") {
                              setEditingRole(ur.user_id);
                              setEditRoleValue(ur.role as "admin" | "user");
                            }
                          }}
                        >
                          {ur.role}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {ur.assigned_by
                        ? `${ur.assigned_by.slice(0, 12)}...`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {ur.created_at
                        ? new Date(ur.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {ur.role !== "master_admin" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteTarget(ur.user_id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add User Role Dialog */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add User Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-user-id">Clerk User ID *</Label>
              <Input
                id="new-user-id"
                placeholder="user_..."
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The Clerk user ID (starts with user_)
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-user-email">Email (optional)</Label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="user@example.com"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <div className="flex gap-2">
                <Button
                  variant={newUserRole === "user" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewUserRole("user")}
                >
                  User
                </Button>
                <Button
                  variant={newUserRole === "admin" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setNewUserRole("admin")}
                >
                  Admin
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddUser} disabled={addingUser}>
              {addingUser ? (
                <Loader2 size={14} className="mr-1 animate-spin" />
              ) : (
                <Users size={14} className="mr-1" />
              )}
              {addingUser ? "Adding..." : "Add User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User Role?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the assigned role for this user. They will lose
              access until a new role is assigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteTarget) handleDeleteRole(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Remove
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

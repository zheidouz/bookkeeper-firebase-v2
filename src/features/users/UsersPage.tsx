// UsersPage — admin-only. Lists every user doc, with "Create user",
// "Change role", and "Disable" actions. Non-admins see <Forbidden />.

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import CreateUserDialog from "@/features/users/CreateUserDialog";
import UserRowActions from "@/features/users/UserRowActions";
import { useUsers } from "@/features/users/useUsers";
import { useAuth } from "@/features/auth/useAuth";
import Forbidden from "@/routes/Forbidden";
import RoleChip from "@/features/auth/RoleChip";

function formatCreated(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== "function") return "—";
  try {
    return ts.toDate().toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function UsersPage() {
  const { role, status } = useAuth();
  const { data: users, isLoading } = useUsers();
  const [createOpen, setCreateOpen] = useState(false);

  if (status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="users-loading"
        className="flex items-center justify-center py-16 text-sm text-slate-500"
      >
        Loading…
      </div>
    );
  }

  if (role !== "admin") {
    return <Forbidden />;
  }

  return (
    <div data-testid="users-page" className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">
            Onboard teammates and manage their roles.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          data-testid="create-user-button"
        >
          Create user
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team</CardTitle>
          <CardDescription>
            {users?.length ?? 0} {users?.length === 1 ? "member" : "members"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (users?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-slate-500"
                  >
                    No users yet. Create the first one.
                  </TableCell>
                </TableRow>
              )}
              {users?.map((u) => (
                <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                  <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <RoleChip role={u.role} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={
                        u.status === "active"
                          ? "text-emerald-600"
                          : "text-slate-400"
                      }
                    >
                      {u.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-slate-500">
                    {formatCreated(u.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <UserRowActions user={u} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
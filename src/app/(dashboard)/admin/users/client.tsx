"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { Plus, Pencil, Trash2, MoreHorizontal, Shield, Search, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/page-loader";
import {
  EmptyState,
  IconBadge,
  PageContainer,
  PageHeader,
  Pill,
  Section,
  buttonClassName,
  cardClassName,
  cx,
  eyebrowClassName,
  fieldClassName,
  iconButtonClassName,
  rowsClassName,
} from "@/components/ui/kit";

interface AdminUser {
  id: Id<"users">;
  email: string;
  name: string | null;
  isAppAdmin: boolean;
  households: Array<{
    householdId: string;
    householdName: string;
    role: string;
  }>;
}

export default function AdminUsersClient() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(
    null
  );

  const usersData = useQuery(api.admin.listUsers, {
    page,
    search: searchQuery || undefined,
    limit: 50,
  });
  const updateUser = useMutation(api.admin.updateUser);
  const deleteUser = useMutation(api.admin.deleteUser);

  const users = usersData?.users || [];
  const totalPages = usersData?.pagination?.totalPages || 1;

  const handleAddUser = () => {
    setEditingUser(null);
    setShowAddModal(true);
  };

  const handleEditUser = (user: AdminUser) => {
    setEditingUser(user);
    setShowAddModal(true);
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    setUserToDelete({ id: userId, name: userName });
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      await deleteUser({ userId: userToDelete.id as Id<"users"> });
      setUserToDelete(null);
    } catch (err) {
      console.error("Error deleting user:", err);
      setAlertModal({
        isOpen: true,
        message:
          err instanceof Error ? err.message : "Failed to delete user. Please try again.",
        variant: "error",
      });
      setUserToDelete(null);
    }
  };

  const handleSaveUser = async (userData: {
    email: string;
    name: string;
    isAppAdmin: boolean;
    password?: string;
  }) => {
    try {
      if (editingUser) {
        await updateUser({
          userId: editingUser.id,
          name: userData.name,
          isAppAdmin: userData.isAppAdmin,
        });
      } else {
        setAlertModal({
          isOpen: true,
          message: "Creating users from this screen is not supported yet.",
          variant: "info",
        });
        return;
      }

      setShowAddModal(false);
      setEditingUser(null);
    } catch (err) {
      console.error("Error saving user:", err);
      setAlertModal({
        isOpen: true,
        message:
          err instanceof Error ? err.message : "Failed to save user. Please try again.",
        variant: "error",
      });
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput.trim());
  };

  if (usersData === undefined) {
    return (
      <PageLoader />
    );
  }

  const addButton = (label: string) => (
    <button type="button" onClick={handleAddUser} className={buttonClassName("primary")}>
      <Plus className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <>
      <PageContainer width="5xl">
        <PageHeader
          eyebrow="Admin"
          title="App Administration"
          description="Manage all users across the application"
          actions={addButton("Add User")}
        />

        <form onSubmit={handleSearch} role="search" className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden="true" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name or email..."
              aria-label="Search by name or email"
              className={cx(fieldClassName, "pl-10")}
            />
          </div>
          <button type="submit" className={cx(buttonClassName("secondary"), "min-h-11")}>
            Search
          </button>
        </form>

        {users.length === 0 ? (
          <div className={cardClassName}>
            <EmptyState
              icon={searchQuery ? Search : Users}
              title={searchQuery ? "No users found" : "No users yet"}
              description={
                searchQuery
                  ? "Try adjusting your search query."
                  : "Create the first user in the application."
              }
              action={!searchQuery ? addButton("Add Your First User") : undefined}
            />
          </div>
        ) : (
          <Section title="Users" aside={searchQuery ? `Results for “${searchQuery}”` : undefined}>
            <ul className={cx(cardClassName, rowsClassName)}>
              {users.map((user) => (
                <li key={user.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                  >
                    {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="truncate font-medium text-stone-900 dark:text-stone-100">
                        {user.name || "Unnamed User"}
                      </p>
                      {user.isAppAdmin && (
                        <Pill tone="info">
                          <Shield className="h-3 w-3" aria-hidden="true" />
                          App Admin
                        </Pill>
                      )}
                    </div>
                    <p className="truncate text-sm text-stone-500 dark:text-stone-400">
                      {user.email}
                    </p>
                    {user.households.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {user.households.slice(0, 3).map((h) => (
                          <Pill key={h.householdId}>
                            {h.householdName} ({h.role})
                          </Pill>
                        ))}
                        {user.households.length > 3 && (
                          <Pill>+{user.households.length - 3} more</Pill>
                        )}
                      </div>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={iconButtonClassName}
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditUser(user)}>
                        <Pencil className="w-4 h-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => handleDeleteUser(user.id, user.name || user.email)}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className={cx(buttonClassName("secondary"), "min-h-11")}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Previous
                </button>
                <span className="text-sm tabular-nums text-stone-600 dark:text-stone-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className={cx(buttonClassName("secondary"), "min-h-11")}
                >
                  Next
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </nav>
            )}
          </Section>
        )}
      </PageContainer>

      {showAddModal && (
        <AppUserModal
          user={editingUser}
          onSave={handleSaveUser}
          onClose={() => {
            setShowAddModal(false);
            setEditingUser(null);
          }}
        />
      )}
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, message: "", variant: "error" })}
        message={alertModal.message}
        variant={alertModal.variant}
      />
      <ConfirmModal
        isOpen={userToDelete !== null}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete user"
        message={
          userToDelete
            ? `Are you sure you want to delete ${userToDelete.name}? This action cannot be undone.`
            : ""
        }
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </>
  );
}

interface AppUserModalProps {
  user: AdminUser | null;
  onSave: (data: {
    email: string;
    name: string;
    isAppAdmin: boolean;
    password?: string;
  }) => Promise<void>;
  onClose: () => void;
}

function AppUserModal({ user, onSave, onClose }: AppUserModalProps) {
  const [formData, setFormData] = useState({
    email: user?.email || "",
    name: user?.name || "",
    isAppAdmin: user?.isAppAdmin || false,
    password: "",
  });
  const [saving, setSaving] = useState(false);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim() || !formData.name.trim()) {
      setAlertModal({ isOpen: true, message: "Email and name are required", variant: "error" });
      return;
    }

    if (!user && !formData.password) {
      setAlertModal({
        isOpen: true,
        message: "Password is required for new users",
        variant: "error",
      });
      return;
    }

    setSaving(true);
    try {
      await onSave({
        email: formData.email,
        name: formData.name,
        isAppAdmin: formData.isAppAdmin,
        password: user ? formData.password || undefined : formData.password,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={user ? "Edit User" : "Add User"}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-4">
          <div>
            <label htmlFor="admin-user-email" className={eyebrowClassName}>
              Email
            </label>
            <input
              id="admin-user-email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={cx(fieldClassName, "mt-1.5")}
              required
            />
          </div>

          <div>
            <label htmlFor="admin-user-name" className={eyebrowClassName}>
              Name
            </label>
            <input
              id="admin-user-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={cx(fieldClassName, "mt-1.5")}
              required
            />
          </div>
        </div>

        <label className={cx(cardClassName, "flex min-h-16 cursor-pointer items-center gap-3 p-4 hover:bg-stone-50 dark:hover:bg-stone-900/60")}>
          <IconBadge icon={Shield} tone={formData.isAppAdmin ? "info" : "neutral"} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">
              App Administrator
            </span>
            <span className="block text-xs text-stone-500 dark:text-stone-400">
              Grant full administrative access to the application
            </span>
          </span>
          <input
            type="checkbox"
            checked={formData.isAppAdmin}
            onChange={(e) => setFormData({ ...formData, isAppAdmin: e.target.checked })}
            className="peer sr-only"
          />
          {/* Visual switch mirroring the (visually hidden) checkbox. */}
          <span
            aria-hidden="true"
            className="relative h-6 w-11 shrink-0 rounded-full bg-stone-300 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600 dark:bg-stone-700 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5"
          />
        </label>

        <div>
          <label htmlFor="admin-user-password" className={eyebrowClassName}>
            {user ? "New Password (leave blank to keep current)" : "Password *"}
          </label>
          <input
            id="admin-user-password"
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className={cx(fieldClassName, "mt-1.5")}
            aria-describedby="admin-user-password-help"
            required={!user}
            minLength={8}
          />
          <p id="admin-user-password-help" className="mt-1.5 px-1 text-xs text-stone-500 dark:text-stone-400">
            Minimum 8 characters
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onClose} className={cx(buttonClassName("secondary"), "min-h-11 flex-1")}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={cx(buttonClassName("primary"), "min-h-11 flex-1")}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, message: "", variant: "error" })}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </Modal>
  );
}

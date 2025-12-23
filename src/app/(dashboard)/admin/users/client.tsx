"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, MoreHorizontal, Shield, User, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";

interface AppUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  isAppAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  households: Array<{
    householdId: string;
    householdName: string;
    role: "owner" | "admin" | "member";
  }>;
}

export default function AdminUsersClient() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; variant?: 'success' | 'error' | 'info' | 'warning' }>({ isOpen: false, message: '', variant: 'error' });
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
      });
      if (searchQuery) {
        params.append("search", searchQuery);
      }
      const response = await fetch(`/api/admin/users?${params}`);
      if (!response.ok) {
        if (response.status === 403) {
          setError("You don't have permission to access this page. Only app administrators can view all users.");
          return;
        }
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data.users || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => {
    fetchUsers();
  }, [page, searchQuery, fetchUsers]);

  const handleAddUser = () => {
    setEditingUser(null);
    setShowAddModal(true);
  };

  const handleEditUser = (user: AppUser) => {
    setEditingUser(user);
    setShowAddModal(true);
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    setUserToDelete({ id: userId, name: userName });
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    try {
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete user");
      }

      await fetchUsers();
      setUserToDelete(null);
    } catch (err) {
      console.error("Error deleting user:", err);
      setAlertModal({ isOpen: true, message: err instanceof Error ? err.message : "Failed to delete user. Please try again.", variant: 'error' });
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
        // Update existing user
        const response = await fetch(`/api/admin/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userData.email,
            name: userData.name,
            isAppAdmin: userData.isAppAdmin,
            password: userData.password || undefined,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to update user");
        }
      } else {
        // Add new user
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userData),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create user");
        }
      }

      setShowAddModal(false);
      setEditingUser(null);
      await fetchUsers();
    } catch (err) {
      console.error("Error saving user:", err);
      setAlertModal({ isOpen: true, message: err instanceof Error ? err.message : "Failed to save user. Please try again.", variant: 'error' });
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  if (error && !users.length) {
    return (
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-semibold mb-4 text-stone-900 dark:text-stone-100">
            App Administration
          </h1>
          <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-lg p-4 text-rose-800 dark:text-rose-300">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                App Administration
              </h1>
              <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
                Manage all users across the application
              </p>
            </div>
            <button
              onClick={handleAddUser}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          </div>

          <div className="mb-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or email..."
                  className="w-full pl-10 pr-4 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-md bg-stone-100 dark:bg-stone-900 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
              >
                Search
              </button>
            </form>
          </div>

          {users.length === 0 ? (
            <div className="bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-lg p-12 text-center">
              <User className="w-12 h-12 mx-auto mb-4 text-stone-400" />
              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mb-2">
                {searchQuery ? "No users found" : "No users yet"}
              </h3>
              <p className="text-stone-600 dark:text-stone-400 mb-4">
                {searchQuery
                  ? "Try adjusting your search query."
                  : "Create the first user in the application."}
              </p>
              {!searchQuery && (
                <button
                  onClick={handleAddUser}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Your First User
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden mb-4">
                <div className="divide-y divide-stone-200 dark:divide-stone-800">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="p-4 hover:bg-stone-50 dark:hover:bg-stone-900/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-400 font-medium shrink-0">
                            {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-stone-900 dark:text-stone-100 truncate">
                                {user.name || "Unnamed User"}
                              </p>
                              {user.isAppAdmin && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400">
                                  <Shield className="w-3 h-3" />
                                  App Admin
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-stone-600 dark:text-stone-400 truncate">
                              {user.email}
                            </p>
                            {user.households.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {user.households.slice(0, 3).map((h) => (
                                  <span
                                    key={h.householdId}
                                    className="text-xs px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-900 text-stone-600 dark:text-stone-400"
                                  >
                                    {h.householdName} ({h.role})
                                  </span>
                                ))}
                                {user.households.length > 3 && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-stone-100 dark:bg-stone-900 text-stone-600 dark:text-stone-400">
                                    +{user.households.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors shrink-0"
                              aria-label="More actions"
                            >
                              <MoreHorizontal className="w-4 h-4" strokeWidth={1.75} />
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
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-stone-600 dark:text-stone-400">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

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
        onClose={() => setAlertModal({ isOpen: false, message: '', variant: 'error' })}
        message={alertModal.message}
        variant={alertModal.variant}
      />
      <ConfirmModal
        isOpen={userToDelete !== null}
        onClose={() => setUserToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete user"
        message={userToDelete ? `Are you sure you want to delete ${userToDelete.name}? This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </>
  );
}

interface AppUserModalProps {
  user: AppUser | null;
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
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; message: string; variant?: 'success' | 'error' | 'info' | 'warning' }>({ isOpen: false, message: '', variant: 'error' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim() || !formData.name.trim()) {
      setAlertModal({ isOpen: true, message: "Email and name are required", variant: 'error' });
      return;
    }

    if (!user && !formData.password) {
      setAlertModal({ isOpen: true, message: "Password is required for new users", variant: 'error' });
      return;
    }

    setSaving(true);
    try {
      await onSave({
        email: formData.email,
        name: formData.name,
        isAppAdmin: formData.isAppAdmin,
        password: user ? (formData.password || undefined) : formData.password,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-stone-950 rounded-lg border border-stone-200 dark:border-stone-800 p-6 w-full max-w-md mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4 text-stone-900 dark:text-stone-100">
          {user ? "Edit User" : "Add User"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Email *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
              required
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.isAppAdmin}
                onChange={(e) => setFormData({ ...formData, isAppAdmin: e.target.checked })}
                className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
                App Administrator
              </span>
            </label>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 ml-6">
              Grant full administrative access to the application
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              {user ? "New Password (leave blank to keep current)" : "Password *"}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
              required={!user}
              minLength={8}
            />
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              Minimum 8 characters
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ isOpen: false, message: '', variant: 'error' })}
        message={alertModal.message}
        variant={alertModal.variant}
      />
    </div>
  );
}


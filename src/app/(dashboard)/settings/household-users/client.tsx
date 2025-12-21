"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, MoreHorizontal, Shield, User, Crown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

interface HouseholdUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  createdAt: string;
}

export default function HouseholdUsersClient() {
  const [users, setUsers] = useState<HouseholdUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<HouseholdUser | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/household/users");
      if (!response.ok) {
        if (response.status === 403) {
          setError("You don't have permission to view household users. Only owners and admins can access this page.");
          return;
        }
        throw new Error("Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Error fetching users:", err);
      setError("Failed to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setShowAddModal(true);
  };

  const handleEditUser = (user: HouseholdUser) => {
    setEditingUser(user);
    setShowAddModal(true);
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to remove ${userName} from this household?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/household/users/${userId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove user");
      }

      await fetchUsers();
    } catch (err) {
      console.error("Error removing user:", err);
      alert(err instanceof Error ? err.message : "Failed to remove user. Please try again.");
    }
  };

  const handleSaveUser = async (userData: {
    email: string;
    name: string;
    role: "owner" | "admin" | "member";
    password?: string;
  }) => {
    try {
      if (editingUser) {
        // Update existing user
        const response = await fetch(`/api/household/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: userData.role,
            name: userData.name,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to update user");
        }
      } else {
        // Add new user
        const response = await fetch("/api/household/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userData),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to add user");
        }
      }

      setShowAddModal(false);
      setEditingUser(null);
      await fetchUsers();
    } catch (err) {
      console.error("Error saving user:", err);
      alert(err instanceof Error ? err.message : "Failed to save user. Please try again.");
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "owner":
        return <Crown className="w-4 h-4 text-amber-600" />;
      case "admin":
        return <Shield className="w-4 h-4 text-emerald-600" />;
      default:
        return <User className="w-4 h-4 text-stone-500" />;
    }
  };

  const getRoleBadge = (role: string) => {
    const badges = {
      owner: "bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400",
      admin: "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400",
      member: "bg-stone-100 dark:bg-stone-900 text-stone-700 dark:text-stone-300",
    };
    return badges[role as keyof typeof badges] || badges.member;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-stone-600 dark:text-stone-400">Loading...</div>
      </div>
    );
  }

  if (error && !users.length) {
    return (
      <div className="p-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold mb-4 text-stone-900 dark:text-stone-100">
            Household Users
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
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
                Household Users
              </h1>
              <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
                Manage users who have access to your household
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

          {users.length === 0 ? (
            <div className="bg-stone-50 dark:bg-stone-900/50 border border-stone-200 dark:border-stone-800 rounded-lg p-12 text-center">
              <User className="w-12 h-12 mx-auto mb-4 text-stone-400" />
              <h3 className="text-lg font-medium text-stone-900 dark:text-stone-100 mb-2">
                No users yet
              </h3>
              <p className="text-stone-600 dark:text-stone-400 mb-4">
                Add users to your household to collaborate on inventory, recipes, and shopping lists.
              </p>
              <button
                onClick={handleAddUser}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Your First User
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-stone-950 border border-stone-200 dark:border-stone-800 rounded-lg overflow-hidden">
              <div className="divide-y divide-stone-200 dark:divide-stone-800">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="p-4 hover:bg-stone-50 dark:hover:bg-stone-900/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-stone-800 flex items-center justify-center text-stone-600 dark:text-stone-400 font-medium">
                          {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-stone-900 dark:text-stone-100 truncate">
                              {user.name || "Unnamed User"}
                            </p>
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${getRoleBadge(
                                user.role
                              )}`}
                            >
                              {getRoleIcon(user.role)}
                              {user.role}
                            </span>
                          </div>
                          <p className="text-sm text-stone-600 dark:text-stone-400 truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-900/60 transition-colors"
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
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <UserModal
          user={editingUser}
          onSave={handleSaveUser}
          onClose={() => {
            setShowAddModal(false);
            setEditingUser(null);
          }}
        />
      )}
    </>
  );
}

interface UserModalProps {
  user: HouseholdUser | null;
  onSave: (data: {
    email: string;
    name: string;
    role: "owner" | "admin" | "member";
    password?: string;
  }) => Promise<void>;
  onClose: () => void;
}

function UserModal({ user, onSave, onClose }: UserModalProps) {
  const [formData, setFormData] = useState({
    email: user?.email || "",
    name: user?.name || "",
    role: (user?.role || "member") as "owner" | "admin" | "member",
    password: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim() || !formData.name.trim()) {
      alert("Email and name are required");
      return;
    }

    if (!user && !formData.password) {
      alert("Password is required for new users");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        email: formData.email,
        name: formData.name,
        role: formData.role,
        password: user ? undefined : formData.password,
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
              disabled={!!user}
            />
            {user && (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                Email cannot be changed
              </p>
            )}
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
            <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
              Role *
            </label>
            <select
              value={formData.role}
              onChange={(e) =>
                setFormData({ ...formData, role: e.target.value as typeof formData.role })
              }
              className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
              required
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </div>

          {!user && (
            <div>
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300 mb-1">
                Password *
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 rounded-md border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-950 text-stone-900 dark:text-stone-100"
                required
                minLength={8}
              />
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
                Minimum 8 characters
              </p>
            </div>
          )}

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
    </div>
  );
}


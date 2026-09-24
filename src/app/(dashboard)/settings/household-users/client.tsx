"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@/lib/kitchen/client";
import { api } from "@/lib/kitchen/api";
import type { Id } from "@/server/kitchen/_generated/dataModel";
import { Plus, Pencil, Trash2, MoreHorizontal, Shield, User, Crown, Home, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AlertModal } from "@/components/ui/alert-modal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { PageLoader } from "@/components/ui/page-loader";
import {
  EmptyState,
  PageHeader,
  Pill,
  Section,
  SegmentedControl,
  buttonClassName,
  cardClassName,
  cx,
  eyebrowClassName,
  fieldClassName,
  iconButtonClassName,
  rowsClassName,
  type Tone,
} from "@/components/ui/kit";

interface HouseholdUser {
  id: Id<"users">;
  email: string;
  name: string | null;
  role: "owner" | "admin" | "member";
}

const ROLE_META: Record<string, { tone: Tone; icon: typeof User; description: string }> = {
  owner: { tone: "warning", icon: Crown, description: "Transfers ownership of this household to them." },
  admin: { tone: "success", icon: Shield, description: "Can manage members and household settings." },
  member: { tone: "neutral", icon: User, description: "Can use the kitchen: inventory, recipes, and lists." },
};

function MemberAvatar({ name, email }: { name: string | null; email: string }) {
  const letters = (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
    >
      {(letters || email[0] || "?").toUpperCase()}
    </span>
  );
}

export default function HouseholdUsersClient() {
  const households = useQuery(api.households.list, {});
  const householdId = (households?.find(h => h.isCurrent) ?? households?.[0])?.id;
  const usersData = useQuery(
    api.households.getMembers,
    householdId ? { householdId } : "skip",
  );
  const addMember = useMutation(api.households.addMember);
  const updateMember = useMutation(api.households.updateMember);
  const removeMember = useMutation(api.households.removeMember);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<HouseholdUser | null>(null);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(
    null
  );

  const users = usersData?.users || [];

  const handleAddUser = () => {
    setEditingUser(null);
    setShowAddModal(true);
  };

  const handleEditUser = (user: HouseholdUser) => {
    setEditingUser(user);
    setShowAddModal(true);
  };

  const handleDeleteUser = (userId: string, userName: string) => {
    setUserToDelete({ id: userId, name: userName });
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete || !householdId) return;

    try {
      await removeMember({
        householdId,
        memberId: userToDelete.id as Id<"users">,
      });
      setAlertModal({
        isOpen: true,
        message: `${userToDelete.name} was removed from the household.`,
        variant: "success",
      });
      setUserToDelete(null);
    } catch (err) {
      console.error("Error removing user:", err);
      setAlertModal({
        isOpen: true,
        message:
          err instanceof Error
            ? err.message
            : "Failed to remove user. Please try again.",
        variant: "error",
      });
      setUserToDelete(null);
    }
  };

  const handleSaveUser = async (userData: {
    email: string;
    role: "owner" | "admin" | "member";
  }) => {
    if (!householdId) return;
    try {
      if (editingUser) {
        await updateMember({
          householdId,
          memberId: editingUser.id,
          role: userData.role,
        });
      } else {
        if (userData.role === "owner") {
          throw new Error(
            "Add the user first, then transfer ownership by editing their role.",
          );
        }
        await addMember({
          householdId,
          email: userData.email,
          role: userData.role,
        });
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

  if (households === undefined || (householdId && usersData === undefined)) {
    return <PageLoader rows={3} />;
  }

  if (!householdId) {
    return (
      <div className={cardClassName}>
        <EmptyState
          icon={Home}
          title="No household found"
          description="No household found. Visit the dashboard first to set one up."
        />
      </div>
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
      <div className="space-y-6">
        <PageHeader
          title="Household members"
          description="Manage users who have access to your household"
          actions={addButton("Add User")}
        />

        {users.length === 0 ? (
          <div className={cardClassName}>
            <EmptyState
              icon={Users}
              title="No users yet"
              description="Add users to your household to collaborate on inventory, recipes, and shopping lists."
              action={addButton("Add Your First User")}
            />
          </div>
        ) : (
          <Section title="Members" aside={`${users.length} ${users.length === 1 ? "person" : "people"}`}>
            <ul className={cx(cardClassName, rowsClassName, "stagger")}>
              {users.map((user) => {
                const role = ROLE_META[user.role] ?? ROLE_META.member;
                return (
                  <li key={user.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                    <MemberAvatar name={user.name} email={user.email} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate font-medium text-stone-900 dark:text-stone-100">
                          {user.name || "Unnamed User"}
                        </p>
                        <Pill tone={role.tone} className="shrink-0 capitalize">
                          <role.icon className="h-3 w-3" aria-hidden="true" />
                          {user.role}
                        </Pill>
                      </div>
                      <p className="truncate text-sm text-stone-500 dark:text-stone-400">
                        {user.email}
                      </p>
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
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
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
        title="Remove user"
        message={
          userToDelete
            ? `Are you sure you want to remove ${userToDelete.name} from this household?`
            : ""
        }
        confirmText="Remove"
        cancelText="Cancel"
        confirmVariant="danger"
      />
    </>
  );
}

interface UserModalProps {
  user: HouseholdUser | null;
  onSave: (data: {
    email: string;
    role: "owner" | "admin" | "member";
  }) => Promise<void>;
  onClose: () => void;
}

function UserModal({ user, onSave, onClose }: UserModalProps) {
  const [formData, setFormData] = useState({
    email: user?.email || "",
    role: (user?.role || "member") as "owner" | "admin" | "member",
  });
  const [saving, setSaving] = useState(false);
  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }>({ isOpen: false, message: "", variant: "error" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim()) {
      setAlertModal({ isOpen: true, message: "Email is required", variant: "error" });
      return;
    }

    setSaving(true);
    try {
      await onSave({
        email: formData.email,
        role: formData.role,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={user ? "Edit User" : "Add User"}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="member-email" className={eyebrowClassName}>
            Email
          </label>
          <input
            id="member-email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className={cx(fieldClassName, "mt-1.5")}
            placeholder="name@example.com"
            aria-describedby="member-email-help"
            required
            disabled={!!user}
          />
          <p id="member-email-help" className="mt-1.5 px-1 text-xs text-stone-500 dark:text-stone-400">
            {user
              ? "Email cannot be changed"
              : "The person must already have a Sous Chef account with this email"}
          </p>
        </div>

        <div>
          <span className={eyebrowClassName}>Role</span>
          <SegmentedControl
            label="Role"
            value={formData.role}
            onChange={(role) => setFormData({ ...formData, role })}
            className="mt-1.5 w-full [&>button]:flex-1"
            options={[
              { value: "member", label: "Member", icon: User },
              { value: "admin", label: "Admin", icon: Shield },
              ...(user ? [{ value: "owner" as const, label: "Owner", icon: Crown }] : []),
            ]}
          />
          <p className="mt-1.5 px-1 text-xs text-stone-500 dark:text-stone-400">
            {formData.role === "owner"
              ? "Owner (transfer ownership). " + ROLE_META.owner.description
              : ROLE_META[formData.role].description}
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

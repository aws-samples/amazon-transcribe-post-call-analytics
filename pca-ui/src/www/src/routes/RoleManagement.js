import { useState, useEffect, useCallback } from "react";
import {
  ContentLayout, Header, Container, SpaceBetween, Table, Button,
  Modal, Box, FormField, Input, Checkbox, Alert, Select
} from "@cloudscape-design/components";
import {
  listRoles, createRole, updateRole, deleteRole as deleteRoleApi,
  listUsers, assignUserRole
} from "../api/api";

const ALL_PERMISSIONS = ["read_calls", "upload_recordings", "delete_calls", "manage_roles"];

function RoleManagement({ setAlert }) {
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Role modal state
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleName, setRoleName] = useState("");
  const [rolePermissions, setRolePermissions] = useState([]);
  const [saving, setSaving] = useState(false);

  // Delete role modal
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRoles = useCallback(async () => {
    try {
      setLoadingRoles(true);
      const data = await listRoles();
      setRoles(data.roles || data || []);
    } catch (err) {
      console.error("Failed to load roles:", err);
    } finally {
      setLoadingRoles(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const data = await listUsers();
      setUsers(data.users || data || []);
    } catch (err) {
      console.error("Failed to load users:", err);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
    fetchUsers();
  }, [fetchRoles, fetchUsers]);

  const openCreateRole = () => {
    setEditingRole(null);
    setRoleName("");
    setRolePermissions([]);
    setRoleModalVisible(true);
  };

  const openEditRole = (role) => {
    setEditingRole(role);
    setRoleName(role.RoleName);
    setRolePermissions([...(role.Permissions || [])]);
    setRoleModalVisible(true);
  };

  const handleSaveRole = async () => {
    try {
      setSaving(true);
      if (editingRole) {
        await updateRole(editingRole.RoleName, rolePermissions);
      } else {
        await createRole(roleName, rolePermissions);
      }
      setRoleModalVisible(false);
      fetchRoles();
    } catch (err) {
      console.error("Save role failed:", err);
      setAlert({ heading: "Error", variant: "danger", text: String(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    try {
      setDeleting(true);
      await deleteRoleApi(roleToDelete.RoleName);
      setDeleteModalVisible(false);
      setRoleToDelete(null);
      fetchRoles();
    } catch (err) {
      console.error("Delete role failed:", err);
      setAlert({ heading: "Error", variant: "danger", text: String(err) });
    } finally {
      setDeleting(false);
    }
  };

  const handleAssignRole = async (username, newRoleName) => {
    try {
      await assignUserRole(username, newRoleName);
      fetchUsers();
    } catch (err) {
      console.error("Assign role failed:", err);
      setAlert({ heading: "Error", variant: "danger", text: String(err) });
    }
  };

  const togglePermission = (perm) => {
    setRolePermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  const roleOptions = roles.map(r => ({ label: r.RoleName, value: r.RoleName }));

  return (
    <ContentLayout
      header={<Header variant="h1">Role Management</Header>}
    >
      <SpaceBetween size="l">
        <Container>
          <Table
            header={
              <Header variant="h2" actions={<Button onClick={openCreateRole}>Create role</Button>}>
                Roles
              </Header>
            }
            items={roles}
            loading={loadingRoles}
            loadingText="Loading roles"
            columnDefinitions={[
              { id: "name", header: "Role Name", cell: (r) => r.RoleName },
              { id: "permissions", header: "Permissions", cell: (r) => (r.Permissions || []).join(", ") },
              {
                id: "actions", header: "Actions", cell: (r) => (
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button variant="link" onClick={() => openEditRole(r)}>Edit</Button>
                    <Button variant="link" onClick={() => { setRoleToDelete(r); setDeleteModalVisible(true); }}
                      disabled={(r.Permissions || []).includes("manage_roles")}>Delete</Button>
                  </SpaceBetween>
                )
              }
            ]}
            empty="No roles found."
          />
        </Container>

        <Container>
          <Table
            header={<Header variant="h2">Users</Header>}
            items={users}
            loading={loadingUsers}
            loadingText="Loading users"
            columnDefinitions={[
              { id: "username", header: "Username", cell: (u) => u.username },
              { id: "email", header: "Email", cell: (u) => u.email || "-" },
              {
                id: "role", header: "Role", cell: (u) => (
                  <Select
                    selectedOption={u.role ? { label: u.role, value: u.role } : null}
                    options={roleOptions}
                    placeholder="Assign role"
                    expandToViewport
                    onChange={({ detail }) => handleAssignRole(u.username, detail.selectedOption.value)}
                  />
                )
              }
            ]}
            empty="No users found."
          />
        </Container>
      </SpaceBetween>

      <Modal
        visible={roleModalVisible}
        onDismiss={() => setRoleModalVisible(false)}
        header={editingRole ? "Edit role" : "Create role"}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setRoleModalVisible(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleSaveRole} loading={saving}
                disabled={!editingRole && !roleName.trim()}>Save</Button>
            </SpaceBetween>
          </Box>
        }
      >
        <SpaceBetween size="m">
          <FormField label="Role name">
            <Input value={roleName} onChange={({ detail }) => setRoleName(detail.value)}
              disabled={!!editingRole} placeholder="e.g. analyst" />
          </FormField>
          <FormField label="Permissions">
            <SpaceBetween size="xs">
              {ALL_PERMISSIONS.map(perm => (
                <Checkbox key={perm} checked={rolePermissions.includes(perm)}
                  onChange={() => togglePermission(perm)}
                  >{perm}</Checkbox>
              ))}
            </SpaceBetween>
          </FormField>
        </SpaceBetween>
      </Modal>

      <Modal
        visible={deleteModalVisible}
        onDismiss={() => setDeleteModalVisible(false)}
        header="Delete role"
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => setDeleteModalVisible(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleDeleteRole} loading={deleting}>Delete</Button>
            </SpaceBetween>
          </Box>
        }
      >
        Are you sure you want to delete the role "{roleToDelete?.RoleName}"? This cannot be undone.
      </Modal>
    </ContentLayout>
  );
}

export default RoleManagement;

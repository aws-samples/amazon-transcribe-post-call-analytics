import { createContext, useContext, useState, useEffect } from "react";
import { getToken, payloadFromToken } from "../api/auth";
import { getPermissions } from "../api/api";

const PermissionContext = createContext({
  role: null,
  permissions: [],
  loading: true,
});

export function PermissionProvider({ children }) {
  const [state, setState] = useState({
    role: null,
    permissions: [],
    loading: true,
  });

  useEffect(() => {
    async function fetchPermissions() {
      try {
        const accessToken = await getToken();
        if (!accessToken) {
          setState({ role: null, permissions: [], loading: false });
          return;
        }

        const payload = payloadFromToken(accessToken);
        const pcaRole = payload["custom:pca_role"];

        if (!pcaRole) {
          setState({ role: null, permissions: [], loading: false });
          return;
        }

        const data = await getPermissions();
        setState({
          role: data.role || pcaRole,
          permissions: data.permissions || [],
          loading: false,
        });
      } catch (err) {
        console.error("Failed to fetch permissions:", err);
        setState({ role: null, permissions: [], loading: false });
      }
    }

    fetchPermissions();
  }, []);

  return (
    <PermissionContext.Provider value={state}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionContext);
  return {
    role: ctx.role,
    permissions: ctx.permissions,
    loading: ctx.loading,
    hasPermission: (name) => ctx.permissions.includes(name),
    isAdmin: ctx.permissions.includes("manage_roles"),
  };
}


import { ODBLocation, User, SiteSettings, NearbyLocation, Permission, SystemLog, RoleDefinition, PermissionResource, PermissionAction, PermissionScope } from '../types';

const API_BASE_URL = 'https://start.enjaz.cloud/api/api.php'; 
const STORAGE_KEY_USER_SESSION = 'odb_user_session_v5_rbac_db'; 
const STORAGE_KEY_DEVICE_ID = 'odb_device_id_fingerprint';

// --- INITIAL ROLES SETUP (CONSTANTS) ---
// Used only for initialization if DB is empty
const ALL_RESOURCES: PermissionResource[] = ['dashboard', 'odb', 'nearby', 'users', 'settings', 'my_activity', 'map_filter', 'search_odb', 'system_logs', 'roles'];
const ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'export'];

const createFullPerms = (scope: PermissionScope = 'all'): Permission[] => {
    let perms: Permission[] = [];
    ALL_RESOURCES.forEach(res => { ACTIONS.forEach(act => perms.push({ resource: res, action: act, scope: scope })); });
    return perms;
};

const SYSTEM_ROLES: RoleDefinition[] = [
    { id: 'admin', name: 'مدير النظام (Super Admin)', isSystem: true, permissions: createFullPerms('all') },
    { id: 'supervisor', name: 'مشرف المنطقة', isSystem: true, permissions: [
            { resource: 'dashboard', action: 'view', scope: 'own' },
            { resource: 'odb', action: 'view', scope: 'all' }, 
            { resource: 'odb', action: 'create', scope: 'own' },
            { resource: 'odb', action: 'edit', scope: 'team' }, 
            { resource: 'users', action: 'view', scope: 'team' }, 
            { resource: 'users', action: 'create', scope: 'team' },
            { resource: 'users', action: 'edit', scope: 'team' },
            { resource: 'map_filter', action: 'view', scope: 'all' }, 
            { resource: 'search_odb', action: 'view', scope: 'all' }, 
            { resource: 'my_activity', action: 'view', scope: 'team' }
    ]},
    { id: 'delegate', name: 'مندوب ميداني', isSystem: true, permissions: [
            { resource: 'dashboard', action: 'view', scope: 'own' },
            { resource: 'odb', action: 'view', scope: 'own' }, 
            { resource: 'odb', action: 'create', scope: 'own' },
            { resource: 'odb', action: 'edit', scope: 'own' }, 
            { resource: 'map_filter', action: 'view', scope: 'all' },
            { resource: 'search_odb', action: 'view', scope: 'all' },
            { resource: 'my_activity', action: 'view', scope: 'own' }
    ]}
];

// --- ROLE MANAGEMENT SERVICE (ASYNC API) ---

export const getRoles = async (): Promise<RoleDefinition[]> => {
    try {
        // Force fresh load
        const dbRoles = await apiRequest('get_roles', 'GET');
        
        const roleMap = new Map<string, RoleDefinition>();
        
        // 1. Add System Roles first as baseline
        SYSTEM_ROLES.forEach(r => roleMap.set(r.id, r));
        
        // 2. Override/Add with DB Roles
        if (Array.isArray(dbRoles)) {
            dbRoles.forEach((r: any) => {
                // Ensure permissions is an array
                let perms = r.permissions;
                if (typeof perms === 'string') {
                    try { perms = JSON.parse(perms); } catch(e) { perms = []; }
                }
                
                roleMap.set(r.id, {
                    id: r.role_id || r.id, // Handle DB column name difference
                    name: r.name,
                    isSystem: r.isSystem,
                    permissions: Array.isArray(perms) ? perms : []
                });
            });
        }
        
        return Array.from(roleMap.values());
    } catch (e) {
        console.error("Failed to load roles from API, using defaults", e);
        return SYSTEM_ROLES;
    }
};

export const saveRole = async (role: RoleDefinition) => {
    // Send to API
    await apiRequest('save_role', 'POST', role);
    logAction(getSession()?.username || 'System', 'UPDATE', 'Roles', `Updated role: ${role.name}`);
};

export const deleteRole = async (roleId: string) => {
    await apiRequest(`delete_role&id=${roleId}`, 'GET');
    logAction(getSession()?.username || 'System', 'DELETE', 'Roles', `Deleted role ID: ${roleId}`);
};

// --- API HELPER ---
async function apiRequest(action: string, method: 'GET' | 'POST' = 'GET', body: any = null, signal?: AbortSignal, silent: boolean = false, skipUserHeader: boolean = false) {
    // Add timestamp to prevent caching on GET requests
    const timestamp = new Date().getTime();
    const url = `${API_BASE_URL}?action=${action}&_t=${timestamp}`;
    
    const user = getSession();
    const headers: any = { 'Content-Type': 'application/json' };
    if (user && user.id && !skipUserHeader) headers['X-User-Id'] = user.id.toString();

    const options: RequestInit = { 
        method, 
        headers, 
        mode: 'cors', 
        signal,
        cache: 'no-store' // Critical: Prevent browser caching
    };
    
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(url, options);
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { 
            if (signal?.aborted) throw new Error('Aborted'); 
            console.error("Invalid JSON response:", text);
            throw new Error('Server Error: Invalid Response'); 
        }
        if (!response.ok || data.error) throw new Error(data.error || `Error ${response.status}`);
        return data;
    } catch (error: any) {
        if (error.name === 'AbortError') throw error;
        if (!silent) console.error(`API [${action}] Failed:`, error);
        throw error;
    }
}

// --- UTILS ---
export const getDeviceFingerprint = (): string => {
    let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!deviceId) { deviceId = 'dev_' + Math.random().toString(36).substring(2, 15); localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId); }
    return deviceId;
};

// --- AUTH & PERMISSIONS ---

export const checkPermission = (user: User | null, resource: PermissionResource, action: PermissionAction, targetOwnerId?: number | null): boolean => {
    if (!user) return false;
    if (user.username === 'admin') return true;
    if (!user.permissions) return false;

    const perm = user.permissions.find(p => p.resource === resource && p.action === action);
    if (!perm) return false;
    if (perm.scope === 'none') return false;
    if (perm.scope === 'all') return true;
    if (action === 'create') return true;
    
    // Fallback if targetOwnerId is missing for edit/delete checks
    if ((action === 'edit' || action === 'delete') && (targetOwnerId === undefined || targetOwnerId === null)) {
        // If we don't know the owner, we assume safe default (deny unless 'all')
        // But for UI conditional rendering, we might return true to show the button (which will be disabled later)
        return true; 
    }
    
    if (targetOwnerId === undefined || targetOwnerId === null) return true; // View context often doesn't have ownerId

    if (perm.scope === 'own') return Number(targetOwnerId) === Number(user.id);
    if (perm.scope === 'team') return Number(targetOwnerId) === Number(user.id) || true; // Mock implementation for frontend check

    return false;
};

export const hasPermission = (user: User | null, resource: string, action: string): boolean => {
    return checkPermission(user, resource as PermissionResource, action as PermissionAction);
};

// IMPORTANT: This now awaits getRoles() to be sure we have the DB version
const resolveUserPermissions = async (userRole: string, dbPermissions: any): Promise<Permission[]> => {
    // 1. If user has specific overrides (custom permissions), use them
    if (dbPermissions && Array.isArray(dbPermissions) && dbPermissions.length > 0) {
        return dbPermissions;
    }

    // 2. Otherwise, fetch the latest definition from DB/System for this role
    const roles = await getRoles();
    const roleDef = roles.find(r => r.id === userRole);
    if (roleDef) return roleDef.permissions;

    // 3. Fallback to system default if DB fails
    const sysRole = SYSTEM_ROLES.find(r => r.id === userRole);
    if (sysRole) return sysRole.permissions;

    return [];
};

export const mockLogin = async (username: string, pass: string, deviceId?: string): Promise<User> => {
    const payload = { username, password: pass, deviceId: deviceId || getDeviceFingerprint() };
    const user = await apiRequest('login', 'POST', payload);
    
    // Resolve Permissions properly (ASYNC)
    user.permissions = await resolveUserPermissions(user.role, user.permissions);

    if (user.username === 'admin') { user.role = 'admin'; user.permissions = createFullPerms('all'); }

    // Convert types
    user.id = Number(user.id);
    user.supervisorId = user.supervisorId ? Number(user.supervisorId) : null;
    user.isActive = user.isActive == 1 || user.isActive === true;

    localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(user));
    return user as User;
};

export const mockLogout = () => { localStorage.removeItem(STORAGE_KEY_USER_SESSION); };
export const getSession = (): User | null => { const data = localStorage.getItem(STORAGE_KEY_USER_SESSION); return data ? JSON.parse(data) : null; };

export const refreshUserSession = async (userId: number): Promise<User | null> => {
    try {
        const allUsers = await apiRequest('get_users', 'GET', null, undefined, true);
        const rawUser = Array.isArray(allUsers) ? allUsers.find((u: any) => Number(u.id) === userId) : null;
        if (!rawUser) return null;

        const userPerms = await resolveUserPermissions(rawUser.role, rawUser.permissions);
        
        return {
            ...rawUser,
            id: Number(rawUser.id),
            isActive: rawUser.isActive == 1 || rawUser.isActive === true,
            permissions: userPerms,
            supervisorId: rawUser.supervisorId ? Number(rawUser.supervisorId) : null
        };
    } catch (e) { return null; }
};

// --- DATA MANAGEMENT ---

export const getUsers = async (currentUser: User): Promise<User[]> => {
    const allUsers = await apiRequest('get_users');
    
    // Process users in parallel to resolve their permissions
    const usersList = await Promise.all(allUsers.map(async (u: any) => {
        const perms = await resolveUserPermissions(u.role, u.permissions);
        return {
            ...u,
            id: Number(u.id),
            supervisorId: u.supervisorId ? Number(u.supervisorId) : null,
            isActive: u.isActive == 1 || u.isActive === true,
            permissions: perms
        };
    }));

    // Filter based on currentUser scope
    const viewPerm = currentUser.permissions.find(p => p.resource === 'users' && p.action === 'view');
    const scope = viewPerm?.scope || 'none';
    if (currentUser.username === 'admin' || scope === 'all') return usersList;
    if (scope === 'team') return usersList.filter((u: User) => u.supervisorId === currentUser.id || u.id === currentUser.id);
    return [];
};

export const saveUser = async (userToSave: User): Promise<void> => {
    // IMPORTANT: If we want the user to inherit Role permissions dynamically, 
    // we should NOT save a snapshot. Send empty/null permissions to DB.
    // The backend PermissionManager will then fall back to the Roles table.
    
    const payload = { ...userToSave, permissions: [] }; // Send empty to force inheritance
    await apiRequest('save_user', 'POST', payload);
};

export const deleteUser = async (id: number) => { if (id === 1) throw new Error("Cannot delete Super Admin"); await apiRequest(`delete_user&id=${id}`, 'GET'); };
export const toggleUserStatus = async (id: number) => { await apiRequest(`toggle_user_status&id=${id}`, 'GET'); };
export const resetUserDevice = async (id: number) => { await apiRequest(`reset_user_device&id=${id}`, 'GET'); };

export const getLogs = async () => (await apiRequest('get_logs', 'GET', null, undefined, true)) || [];
export const logAction = (u: string, a: any, r: string, d: string) => apiRequest('log_action', 'POST', {username:u, action:a, resource:r, details:d}, undefined, true).catch(()=>{});
export const clearLogs = async () => await apiRequest('clear_logs');

export const getSiteSettings = async () => {
    try { return await apiRequest('get_settings', 'GET', null, undefined, true) || { siteName: 'ODB Manager' }; }
    catch { return { siteName: 'ODB Manager' }; }
};
export const saveSiteSettings = async (s: SiteSettings) => { await apiRequest('save_settings', 'POST', s); applySiteSettings(s); };
export const applySiteSettings = (s: SiteSettings) => { document.title = s.siteName; document.documentElement.style.setProperty('--color-primary', s.primaryColor); };

export const getODBLocationsPaginated = async (p: number, l: number, s: string = '', sig?: AbortSignal) => {
    const res = await apiRequest(`get_locations_paginated&page=${p}&limit=${l}&search=${encodeURIComponent(s)}`, 'GET', null, sig, false, true);
    // Simple client mapping, filtering is done server-side mostly now via scopes
    const map = (d: any) => ({...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name, ownerId:d.ownerId});
    return { data: res.data.map(map), total: Number(res.total), totalPages: Number(res.totalPages) };
};

export const saveODBLocation = async (loc: ODBLocation) => {
    const user = getSession();
    if(!user) throw new Error("No session");
    const payload = { ...loc, lastEditedBy: user.username, ownerId: loc.ownerId || user.id };
    await apiRequest('save_location', 'POST', payload);
};

export const deleteODBLocation = async (id: number) => await apiRequest(`delete_location&id=${id}`, 'GET');
export const searchODBLocation = async (q: string) => (await apiRequest(`search_locations&query=${encodeURIComponent(q)}`, 'GET', null, undefined, false, true)).map((d:any)=>({...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name}));
export const getAllLocationsForMap = async () => (await apiRequest('get_all_locations', 'GET', null, undefined, false, true)).map((d:any)=>({...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name}));
export const getLocationDetails = async (id: number) => { const d = await apiRequest(`get_location_details&id=${id}`, 'GET', null, undefined, false, true); return {...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name}; };
export const getMyActivity = async (u: string) => ({ data: (await apiRequest(`get_my_activity&username=${encodeURIComponent(u)}`, 'GET', null, undefined, false, true)).map((d:any)=>({...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name})) });
export const getNearbyLocationsAPI = async (lat: number, lng: number, r: number, l: number) => (await apiRequest(`get_nearby&lat=${lat}&lng=${lng}&radius=${r}&limit=${l}`, 'GET', null, undefined, false, true)).map((d:any)=>({...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name, distance:d.distance}));
export const saveBulkODBLocations = async (locs: any[]) => await apiRequest('import_csv', 'POST', { locations: locs });


import { ODBLocation, User, SiteSettings, NearbyLocation, Permission, SystemLog, RoleDefinition, PermissionResource, PermissionAction, PermissionScope } from '../types';

const API_BASE_URL = 'https://start.enjaz.cloud/api/api.php'; 
const STORAGE_KEY_USER_SESSION = 'odb_user_session_v6_final'; 
const STORAGE_KEY_DEVICE_ID = 'odb_device_id_fingerprint';

// --- INITIAL ROLES SETUP (Fallback) ---
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
            { resource: 'odb', action: 'view', scope: 'all' }, 
            { resource: 'odb', action: 'create', scope: 'own' },
            { resource: 'odb', action: 'edit', scope: 'own' }, 
            { resource: 'map_filter', action: 'view', scope: 'all' },
            { resource: 'search_odb', action: 'view', scope: 'all' },
            { resource: 'my_activity', action: 'view', scope: 'own' }
    ]}
];

// --- API HELPER ---
async function apiRequest(action: string, method: 'GET' | 'POST' = 'GET', body: any = null, signal?: AbortSignal, silent: boolean = false, skipUserHeader: boolean = false) {
    const timestamp = new Date().getTime();
    const url = `${API_BASE_URL}?action=${action}&_t=${timestamp}`;
    
    const user = getSession();
    const headers: any = { 'Content-Type': 'application/json' };
    // FIX: Ensure header is sent unless explicitly skipped, and handle numeric ID
    if (user && user.id && !skipUserHeader) {
        headers['X-User-Id'] = user.id.toString();
    }

    const options: RequestInit = { 
        method, 
        mode: 'cors', 
        signal,
        headers: headers 
    };
    
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(url, options);
        const text = await response.text();
        let data;
        try { 
            data = JSON.parse(text); 
        } catch (e) { 
            if (signal?.aborted) throw new Error('Aborted'); 
            console.error("Invalid JSON response:", text);
            return { data: [], total: 0 };
        }
        
        if (!response.ok || data.error) {
            throw new Error(data.error || `Error ${response.status}`);
        }
        
        return data;
    } catch (error: any) {
        if (error.name === 'AbortError') throw error;
        if (!silent) console.error(`API [${action}] Failed:`, error);
        throw error;
    }
}

// --- ROLE MANAGEMENT SERVICE ---

export const getRoles = async (): Promise<RoleDefinition[]> => {
    try {
        // Enable user header to check admin permissions if needed
        const dbRoles = await apiRequest('get_roles', 'GET', null, undefined, false, false);
        const roleMap = new Map<string, RoleDefinition>();
        
        SYSTEM_ROLES.forEach(r => roleMap.set(r.id, r));
        
        if (Array.isArray(dbRoles)) {
            dbRoles.forEach((r: any) => {
                let perms = r.permissions;
                if (typeof perms === 'string') {
                    try { perms = JSON.parse(perms); } catch(e) { perms = []; }
                }
                if (!Array.isArray(perms)) perms = [];

                roleMap.set(r.id, {
                    id: r.role_id || r.id,
                    name: r.name,
                    isSystem: r.isSystem || r.isSystem === '1',
                    permissions: perms
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
    await apiRequest('save_role', 'POST', role);
};

export const deleteRole = async (roleId: string) => {
    await apiRequest(`delete_role&id=${roleId}`, 'GET');
};

// --- UTILS ---
export const getDeviceFingerprint = (): string => {
    let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!deviceId) { deviceId = 'dev_' + Math.random().toString(36).substring(2, 15); localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId); }
    return deviceId;
};

// --- AUTH & PERMISSIONS ---

export const checkPermission = (user: User | null, resource: PermissionResource, action: PermissionAction, targetOwnerId?: number | null): boolean => {
    if (!user) return false;
    if (user.username === 'admin' || user.id === 1) return true; 
    if (!user.permissions) return false;

    const perm = user.permissions.find(p => p.resource === resource && p.action === action);
    if (!perm) return false;
    
    // Safety check for undefined scope (handles old data structure issues)
    if (!perm.scope) return false;

    if (perm.scope === 'none') return false;
    if (perm.scope === 'all') return true;
    if (action === 'create') return true; 
    
    if (targetOwnerId === undefined || targetOwnerId === null) return true; 

    if (perm.scope === 'own') return Number(targetOwnerId) === Number(user.id);
    if (perm.scope === 'team') return true; 

    return false;
};

export const hasPermission = (user: User | null, resource: string, action: string): boolean => {
    return checkPermission(user, resource as PermissionResource, action as PermissionAction);
};

const resolveUserPermissions = async (userRole: string, dbPermissions: any): Promise<Permission[]> => {
    // FIX: Check if permissions are valid V6 format (must have 'scope')
    // If the DB has old permissions (actions array without scope), we must IGNORE them
    // and fallback to the Role default.
    const isValidV6 = dbPermissions && Array.isArray(dbPermissions) && dbPermissions.length > 0 && dbPermissions[0].scope;
    
    if (isValidV6) {
        return dbPermissions;
    }

    const roles = await getRoles();
    const roleDef = roles.find(r => r.id === userRole);
    
    if (roleDef && roleDef.permissions.length > 0) {
        return roleDef.permissions;
    }

    const sysRole = SYSTEM_ROLES.find(r => r.id === userRole);
    return sysRole ? sysRole.permissions : [];
};

export const mockLogin = async (username: string, pass: string, deviceId?: string): Promise<User> => {
    const payload = { username, password: pass, deviceId: deviceId || getDeviceFingerprint() };
    const user = await apiRequest('login', 'POST', payload);
    
    user.id = Number(user.id);
    user.supervisorId = user.supervisorId ? Number(user.supervisorId) : null;
    user.isActive = user.isActive == 1 || user.isActive === true;

    // Resolve permissions strictly
    user.permissions = await resolveUserPermissions(user.role, user.permissions);

    if (user.username === 'admin' || user.id === 1) { 
        user.role = 'admin'; 
        user.permissions = createFullPerms('all'); 
    }

    localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(user));
    return user as User;
};

export const mockLogout = () => { localStorage.removeItem(STORAGE_KEY_USER_SESSION); };
export const getSession = (): User | null => { const data = localStorage.getItem(STORAGE_KEY_USER_SESSION); return data ? JSON.parse(data) : null; };

export const refreshUserSession = async (userId: number): Promise<User | null> => {
    try {
        const allUsers = await apiRequest('get_users', 'GET', null, undefined, true, true);
        if (!Array.isArray(allUsers)) return null;
        
        const rawUser = allUsers.find((u: any) => Number(u.id) === userId);
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
    if (!Array.isArray(allUsers)) return [];
    
    return allUsers.map((u: any) => ({
        ...u,
        id: Number(u.id),
        supervisorId: u.supervisorId ? Number(u.supervisorId) : null,
        isActive: u.isActive == 1 || u.isActive === true,
        permissions: [] 
    }));
};

export const saveUser = async (userToSave: User): Promise<void> => {
    const payload = { ...userToSave, permissions: [] }; 
    await apiRequest('save_user', 'POST', payload);
};

export const deleteUser = async (id: number) => { if (id === 1) throw new Error("Cannot delete Super Admin"); await apiRequest(`delete_user&id=${id}`, 'GET'); };
export const toggleUserStatus = async (id: number) => { await apiRequest(`toggle_user_status&id=${id}`, 'GET'); };
export const resetUserDevice = async (id: number) => { await apiRequest(`reset_user_device&id=${id}`, 'GET'); };

export const getLogs = async () => {
    const res = await apiRequest('get_logs', 'GET', null, undefined, true);
    return Array.isArray(res) ? res : [];
};
export const logAction = (u: string, a: any, r: string, d: string) => apiRequest('log_action', 'POST', {username:u, action:a, resource:r, details:d}, undefined, true).catch(()=>{});
export const clearLogs = async () => await apiRequest('clear_logs');

export const getSiteSettings = async () => {
    try { return await apiRequest('get_settings', 'GET', null, undefined, true) || { siteName: 'ODB Manager' }; }
    catch { return { siteName: 'ODB Manager' }; }
};
export const saveSiteSettings = async (s: SiteSettings) => { await apiRequest('save_settings', 'POST', s); applySiteSettings(s); };
export const applySiteSettings = (s: SiteSettings) => { document.title = s.siteName; document.documentElement.style.setProperty('--color-primary', s.primaryColor); };

// --- FIX: CHANGED skipUserHeader to FALSE in all below functions ---

export const getODBLocationsPaginated = async (p: number, l: number, s: string = '', sig?: AbortSignal) => {
    // ENABLE USER HEADER (false)
    const res = await apiRequest(`get_locations_paginated&page=${p}&limit=${l}&search=${encodeURIComponent(s)}`, 'GET', null, sig, false, false);
    
    const safeData = (res && Array.isArray(res.data)) ? res.data : [];
    
    const map = (d: any) => ({
        ...d, 
        id: Number(d.id), 
        LATITUDE: Number(d.latitude), 
        LONGITUDE: Number(d.longitude), 
        ODB_ID: d.odb_id, 
        CITYNAME: d.city_name, 
        ownerId: d.ownerId
    });
    
    return { 
        data: safeData.map(map), 
        total: Number(res?.total || 0), 
        totalPages: Number(res?.totalPages || 0) 
    };
};

export const saveODBLocation = async (loc: ODBLocation) => {
    const user = getSession();
    if(!user) throw new Error("No session");
    const payload = { ...loc, lastEditedBy: user.username, ownerId: loc.ownerId || user.id };
    await apiRequest('save_location', 'POST', payload);
};

export const deleteODBLocation = async (id: number) => await apiRequest(`delete_location&id=${id}`, 'GET');

export const searchODBLocation = async (q: string) => {
    // ENABLE USER HEADER (false)
    const res = await apiRequest(`search_locations&query=${encodeURIComponent(q)}`, 'GET', null, undefined, false, false);
    if (!Array.isArray(res)) return [];
    return res.map((d:any)=>({...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name}));
};

export const getAllLocationsForMap = async () => {
    // ENABLE USER HEADER (false)
    const res = await apiRequest('get_all_locations', 'GET', null, undefined, false, false);
    if (!Array.isArray(res)) return [];
    return res.map((d:any)=>({...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name}));
};

export const getLocationDetails = async (id: number) => { 
    // ENABLE USER HEADER (false)
    const d = await apiRequest(`get_location_details&id=${id}`, 'GET', null, undefined, false, false); 
    return {...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name}; 
};

export const getMyActivity = async (u: string) => {
    // ENABLE USER HEADER (false)
    const res = await apiRequest(`get_my_activity&username=${encodeURIComponent(u)}`, 'GET', null, undefined, false, false);
    const data = Array.isArray(res) ? res : [];
    return { data: data.map((d:any)=>({...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name})) };
};

export const getNearbyLocationsAPI = async (lat: number, lng: number, r: number, l: number) => {
    // ENABLE USER HEADER (false)
    const res = await apiRequest(`get_nearby&lat=${lat}&lng=${lng}&radius=${r}&limit=${l}`, 'GET', null, undefined, false, false);
    if (!Array.isArray(res)) return [];
    return res.map((d:any)=>({...d, id:Number(d.id), LATITUDE:Number(d.latitude), LONGITUDE:Number(d.longitude), ODB_ID:d.odb_id, CITYNAME:d.city_name, distance:d.distance}));
};

export const saveBulkODBLocations = async (locs: any[]) => await apiRequest('import_csv', 'POST', { locations: locs });

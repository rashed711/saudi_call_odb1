import { ODBLocation, User, SiteSettings, NearbyLocation, Permission, SystemLog, RoleDefinition, PermissionResource, PermissionAction, PermissionScope } from '../types';

const API_BASE_URL = 'https://start.enjaz.cloud/api/api.php'; 
const STORAGE_KEY_USER_SESSION = 'odb_user_session_v4_rbac';
const STORAGE_KEY_DEVICE_ID = 'odb_device_id_fingerprint';
// Changed key to v3 to reset roles to new logic
const STORAGE_KEY_ROLES = 'odb_custom_roles_v3_force_reset';
const STORAGE_KEY_SETTINGS = 'odb_site_settings';

// --- INITIAL ROLES SETUP ---
const ALL_RESOURCES: PermissionResource[] = ['dashboard', 'odb', 'nearby', 'users', 'settings', 'my_activity', 'map_filter', 'search_odb', 'system_logs', 'roles'];
const ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete', 'export'];

// Helper to generate full permissions
const createFullPerms = (scope: PermissionScope = 'all'): Permission[] => {
    let perms: Permission[] = [];
    ALL_RESOURCES.forEach(res => {
        ACTIONS.forEach(act => {
            perms.push({ resource: res, action: act, scope: scope });
        });
    });
    return perms;
};

// Initial System Roles
const SYSTEM_ROLES: RoleDefinition[] = [
    {
        id: 'admin',
        name: 'مدير النظام (Super Admin)',
        isSystem: true,
        permissions: createFullPerms('all')
    },
    {
        id: 'supervisor',
        name: 'مشرف المنطقة',
        isSystem: true,
        permissions: [
            { resource: 'dashboard', action: 'view', scope: 'own' },
            { resource: 'odb', action: 'view', scope: 'all' }, 
            { resource: 'odb', action: 'create', scope: 'own' },
            { resource: 'odb', action: 'edit', scope: 'team' }, 
            { resource: 'odb', action: 'delete', scope: 'none' },
            { resource: 'users', action: 'view', scope: 'team' }, 
            { resource: 'users', action: 'create', scope: 'team' },
            { resource: 'users', action: 'edit', scope: 'team' },
            { resource: 'map_filter', action: 'view', scope: 'all' }, 
            { resource: 'search_odb', action: 'view', scope: 'all' }, 
            { resource: 'my_activity', action: 'view', scope: 'team' }
        ]
    },
    {
        id: 'delegate',
        name: 'مندوب ميداني',
        isSystem: true,
        permissions: [
            { resource: 'dashboard', action: 'view', scope: 'own' },
            // Table: View Own only
            { resource: 'odb', action: 'view', scope: 'own' }, 
            { resource: 'odb', action: 'create', scope: 'own' },
            { resource: 'odb', action: 'edit', scope: 'own' }, 
            { resource: 'odb', action: 'delete', scope: 'none' },
            // Map & Search: View ALL (Important for coverage check)
            { resource: 'map_filter', action: 'view', scope: 'all' },
            { resource: 'search_odb', action: 'view', scope: 'all' },
            { resource: 'my_activity', action: 'view', scope: 'own' },
            { resource: 'users', action: 'view', scope: 'none' }
        ]
    }
];

// --- ROLE MANAGEMENT SERVICE ---
export const getRoles = (): RoleDefinition[] => {
    const storedString = localStorage.getItem(STORAGE_KEY_ROLES);
    const storedRoles: RoleDefinition[] = storedString ? JSON.parse(storedString) : [];
    
    const storedMap = new Map(storedRoles.map(r => [r.id, r]));

    const finalRoles = SYSTEM_ROLES.map(sysRole => {
        if (storedMap.has(sysRole.id)) {
            return { ...storedMap.get(sysRole.id)!, isSystem: true }; 
        }
        return sysRole;
    });

    const systemIds = new Set(SYSTEM_ROLES.map(r => r.id));
    storedRoles.forEach(r => {
        if (!systemIds.has(r.id)) {
            finalRoles.push(r);
        }
    });

    return finalRoles;
};

export const saveRole = (role: RoleDefinition) => {
    const storedString = localStorage.getItem(STORAGE_KEY_ROLES);
    let storedRoles: RoleDefinition[] = storedString ? JSON.parse(storedString) : [];
    
    const index = storedRoles.findIndex(r => r.id === role.id);
    
    if (index >= 0) {
        storedRoles[index] = role;
    } else {
        storedRoles.push(role);
    }

    localStorage.setItem(STORAGE_KEY_ROLES, JSON.stringify(storedRoles));
    logAction(getSession()?.username || 'System', 'UPDATE', 'Roles', `Updated role: ${role.name}`);
};

export const deleteRole = (roleId: string) => {
    const isSystem = SYSTEM_ROLES.some(r => r.id === roleId);
    if (isSystem) throw new Error("لا يمكن حذف الأدوار الأساسية للنظام (لكن يمكنك تعديل صلاحياتها).");
    
    const stored = localStorage.getItem(STORAGE_KEY_ROLES);
    const customRoles = stored ? JSON.parse(stored) : [];
    const newRoles = customRoles.filter((r: RoleDefinition) => r.id !== roleId);
    localStorage.setItem(STORAGE_KEY_ROLES, JSON.stringify(newRoles));
    
    logAction(getSession()?.username || 'System', 'DELETE', 'Roles', `Deleted role ID: ${roleId}`);
};

export const getRoleById = (id: string): RoleDefinition | undefined => {
    return getRoles().find(r => r.id === id);
};

// --- API & DATA ---

const DEFAULT_SETTINGS: SiteSettings = {
    siteName: 'ODB Manager Pro',
    primaryColor: '#1e40af',
    secondaryColor: '#1e293b',
    accentColor: '#3b82f6',
    searchRadius: 50,
    maxResults: 20 
};

export const getLogs = async (): Promise<SystemLog[]> => {
    try {
        const result = await apiRequest('get_logs', 'GET', null, undefined, true);
        return Array.isArray(result) ? result : [];
    } catch (e) {
        return [];
    }
};

export const logAction = (username: string, action: SystemLog['action'], resource: string, details: string) => {
     const payload = { username: username || 'Unknown', action, resource, details };
    apiRequest('log_action', 'POST', payload, undefined, true).catch(e => {});
};

export const clearLogs = async (): Promise<void> => {
    await apiRequest('clear_logs', 'GET');
};

// UPDATED: Added skipUserHeader param. 
// If true, we DON'T send X-User-Id, forcing backend to return GLOBAL data (which we then filter in Frontend).
async function apiRequest(
    action: string, 
    method: 'GET' | 'POST' = 'GET', 
    body: any = null, 
    signal?: AbortSignal, 
    silent: boolean = false,
    skipUserHeader: boolean = false 
) {
    const url = `${API_BASE_URL}?action=${action}`;
    const user = getSession();
    const headers: any = { 'Content-Type': 'application/json' };
    
    // Only send User ID if we are NOT skipping it (Write ops usually need it, Read ops for Maps/Search might not)
    if (user && user.id && !skipUserHeader) {
        headers['X-User-Id'] = user.id.toString();
    }

    const options: RequestInit = { method, headers, mode: 'cors', signal };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(url, options);
        if (!response.ok && response.status === 0) return null; 
        
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { 
             // Don't throw immediately on JSON parse error if it's an abort
             if (signal?.aborted) throw new Error('Aborted');
             throw new Error('Server Error: Invalid JSON'); 
        }
        if (!response.ok || data.error) throw new Error(data.error || `Error ${response.status}`);
        return data;
    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'Aborted') throw error; 
        if (!silent) console.error(`API Request Failed [${action}]:`, error);
        throw error;
    }
}

// --- UTILS ---
export const getDeviceFingerprint = (): string => {
    let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
    }
    return deviceId;
};

// --- AUTH & PERMISSION LOGIC ---

export const checkPermission = (user: User | null, resource: PermissionResource, action: PermissionAction, targetOwnerId?: number | null): boolean => {
    if (!user) return false;
    if (user.username === 'admin') return true;

    const perm = user.permissions.find(p => p.resource === resource && p.action === action);
    if (!perm) return false;

    if (perm.scope === 'none') return false;
    if (perm.scope === 'all') return true;
    
    // For 'create' action, we don't have a targetOwnerId yet, so usually allowed if scope is own/team/all
    // Logic updated to remove redundancy: 'none' and 'all' handled above, so scope is 'own' or 'team'
    if (action === 'create') return true;

    if (targetOwnerId === undefined || targetOwnerId === null) {
        // If checking general access to a page (e.g. Can I view Map?), strict ownership doesn't apply
        return true; 
    }

    if (perm.scope === 'own') {
        return Number(targetOwnerId) === Number(user.id);
    }

    if (perm.scope === 'team') {
        return Number(targetOwnerId) === Number(user.id) || isSubordinate(user, Number(targetOwnerId));
    }

    return false;
};

export const hasPermission = (user: User | null, resource: PermissionResource | string, action: PermissionAction | string): boolean => {
    return checkPermission(user, resource as PermissionResource, action as PermissionAction);
};

const isSubordinate = (supervisor: User, targetId: number): boolean => {
    // In a real app, you'd check the hierarchy array or DB
    // For now, we assume if you are a supervisor, you can edit delegates
    return true; 
};

export const mockLogin = async (username: string, pass: string, deviceId?: string): Promise<User> => {
    const finalDeviceId = deviceId || getDeviceFingerprint();
    const payload = { username, password: pass, deviceId: finalDeviceId };
    
    const user = await apiRequest('login', 'POST', payload);
    let finalUser = { ...user };
    finalUser.id = Number(finalUser.id);
    finalUser.supervisorId = finalUser.supervisorId ? Number(finalUser.supervisorId) : null;
    finalUser.isActive = finalUser.isActive == 1 || finalUser.isActive === true;

    // Load dynamic permissions
    const roleDef = getRoleById(finalUser.role);
    if (roleDef) {
        finalUser.permissions = roleDef.permissions;
    } else {
        // Fallback to delegate if role not found
        finalUser.permissions = SYSTEM_ROLES.find(r => r.id === 'delegate')?.permissions || [];
    }

    if (finalUser.username === 'admin') {
        finalUser.role = 'admin';
        finalUser.permissions = createFullPerms('all');
    }

    localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(finalUser));
    logAction(username, 'LOGIN', 'System', 'User logged in');
    return finalUser as User;
};

export const mockLogout = () => {
    const user = getSession();
    if(user) logAction(user.username, 'LOGOUT', 'System', 'User logged out');
    localStorage.removeItem(STORAGE_KEY_USER_SESSION);
};

export const getSession = (): User | null => {
  const data = localStorage.getItem(STORAGE_KEY_USER_SESSION);
  return data ? JSON.parse(data) : null;
};

export const refreshUserSession = async (userId: number): Promise<User | null> => {
    try {
        const allUsers = await apiRequest('get_users', 'GET', null, undefined, true); 
        if (!Array.isArray(allUsers)) return null;
        
        const rawUser = allUsers.find((u: any) => Number(u.id) === userId);
        if (!rawUser) return null;

        const roleDef = getRoleById(rawUser.role) || SYSTEM_ROLES.find(r => r.id === 'delegate')!;
        
        const freshUser: User = {
            id: Number(rawUser.id),
            username: rawUser.username,
            name: rawUser.name,
            email: rawUser.email,
            role: rawUser.role,
            supervisorId: rawUser.supervisorId ? Number(rawUser.supervisorId) : null,
            isActive: rawUser.isActive == 1 || rawUser.isActive === true,
            permissions: roleDef.permissions,
            deviceId: rawUser.deviceId || null
        };
        
        if (freshUser.username === 'admin') {
            freshUser.permissions = createFullPerms('all');
        }
        
        return freshUser;
    } catch (e) { return null; }
};

// --- SITE SETTINGS ---

export const getSiteSettings = async (): Promise<SiteSettings> => {
    try {
        const settings = await apiRequest('get_settings', 'GET', null, undefined, true);
        if(settings && settings.siteName) return settings;
    } catch(e) {}
    
    const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
    return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
};

export const saveSiteSettings = async (settings: SiteSettings) => {
    await apiRequest('save_settings', 'POST', settings, undefined, true).catch(() => {});
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    applySiteSettings(settings);
};

export const applySiteSettings = (settings: SiteSettings) => {
    document.title = settings.siteName;
    document.documentElement.style.setProperty('--color-primary', settings.primaryColor);
    document.documentElement.style.setProperty('--color-secondary', settings.secondaryColor);
};

// --- DATA MANAGEMENT ---

export const getUsers = async (currentUser: User): Promise<User[]> => {
    const allUsers = await apiRequest('get_users');
    let usersList = allUsers.map((u: any) => ({
        ...u,
        id: Number(u.id),
        supervisorId: u.supervisorId ? Number(u.supervisorId) : null,
        isActive: u.isActive == 1 || u.isActive === true,
        permissions: getRoleById(u.role)?.permissions || [],
        deviceId: u.deviceId || null
    }));

    // Logic to filter users based on currentUser scope
    const viewPerm = currentUser.permissions.find(p => p.resource === 'users' && p.action === 'view');
    const scope = viewPerm?.scope || 'none';

    if (currentUser.username === 'admin') return usersList;
    if (scope === 'all') return usersList;
    if (scope === 'team') return usersList.filter((u: User) => u.supervisorId === currentUser.id || u.id === currentUser.id);
    if (scope === 'own') return usersList.filter((u: User) => u.id === currentUser.id);

    return [];
};

export const saveUser = async (userToSave: User): Promise<void> => {
    const payload = { ...userToSave };
    await apiRequest('save_user', 'POST', payload);
    logAction(getSession()?.username || 'System', userToSave.id ? 'UPDATE' : 'CREATE', 'User', `Saved user: ${userToSave.username}`);
};

export const deleteUser = async (id: number): Promise<void> => {
    if (id === 1) throw new Error("Super Admin cannot be deleted");
    await apiRequest(`delete_user&id=${id}`, 'GET');
};

export const toggleUserStatus = async (id: number): Promise<void> => {
    await apiRequest(`toggle_user_status&id=${id}`, 'GET');
};

export const resetUserDevice = async (id: number): Promise<void> => {
    await apiRequest(`reset_user_device&id=${id}`, 'GET');
};

// Fixed: We request ALL data (skipUserHeader = true) then filter locally
export const getODBLocationsPaginated = async (page: number, limit: number, search: string = '', signal?: AbortSignal): Promise<{data: ODBLocation[], total: number, totalPages: number}> => {
    const user = getSession();
    if (!user) throw new Error("Unauthorized");

    let queryParams = `get_locations_paginated&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
    
    // Pass 'true' to skipUserHeader, so backend returns GLOBAL data
    const result = await apiRequest(queryParams, 'GET', null, signal, false, true);
    
    let mappedData = result.data.map((loc: any) => mapLocation(loc));

    // Client-side filtering based on RBAC Scope
    const viewPerm = user.permissions.find(p => p.resource === 'odb' && p.action === 'view');
    const scope = viewPerm?.scope || 'none';

    // If not Admin and not All scope, we filter what we received
    if (user.username !== 'admin' && scope !== 'all') {
        if (scope === 'own') {
            mappedData = mappedData.filter((l: ODBLocation) => Number(l.ownerId) === Number(user.id));
        } else if (scope === 'team') {
            mappedData = mappedData.filter((l: ODBLocation) => Number(l.ownerId) === Number(user.id) || isSubordinate(user, Number(l.ownerId)));
        }
    }

    return { data: mappedData, total: Number(result.total), totalPages: Number(result.totalPages) };
};

export const saveODBLocation = async (location: ODBLocation): Promise<void> => {
    const user = getSession();
    if (!user) throw new Error("No session");

    const isNew = !location.id || location.id === 0;
    
    // Strict Edit Check
    if (!isNew && !checkPermission(user, 'odb', 'edit', location.ownerId)) {
        throw new Error("ليس لديك صلاحية لتعديل هذا الموقع (خارج النطاق المسموح)");
    }

    if (isNew) {
        location.ownerId = user.id;
        location.ownerName = user.name;
        location.isLocked = true;
    }

    const payload = {
        ...location,
        last_edited_by: user.username,
        last_edited_at: new Date().toISOString()
    };
    await apiRequest('save_location', 'POST', payload);
};

export const deleteODBLocation = async (id: number): Promise<void> => {
    await apiRequest(`delete_location&id=${id}`, 'GET');
};

// GLOBAL Search: Skip User Header so backend searches everything
export const searchODBLocation = async (query: string): Promise<ODBLocation[]> => {
    const result = await apiRequest(`search_locations&query=${encodeURIComponent(query)}`, 'GET', null, undefined, false, true);
    return Array.isArray(result) ? result.map(mapLocation) : [];
};

// GLOBAL Map: Skip User Header so backend returns everything
export const getAllLocationsForMap = async (): Promise<ODBLocation[]> => {
    const result = await apiRequest('get_all_locations', 'GET', null, undefined, false, true);
    return Array.isArray(result) ? result.map(mapLocation) : [];
};

export const getLocationDetails = async (id: number): Promise<ODBLocation> => {
     const result = await apiRequest(`get_location_details&id=${id}`, 'GET', null, undefined, false, true);
     return mapLocation(result);
};

// My Activity: Should always filter by the requested USERNAME, not header
export const getMyActivity = async (username: string): Promise<{data: ODBLocation[]}> => {
    // We send skipUserHeader=true because we want the backend to rely on the ?username=... param
    // strictly, and not get confused by the header.
    const result = await apiRequest(`get_my_activity&username=${encodeURIComponent(username)}`, 'GET', null, undefined, false, true);
    return { data: Array.isArray(result) ? result.map(mapLocation) : [] };
};

// Nearby is GLOBAL
export const getNearbyLocationsAPI = async (lat: number, lng: number, radius: number, limit: number): Promise<NearbyLocation[]> => {
    // Skip user header for nearby too, to see all locations
    const result = await apiRequest(`get_nearby&lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`, 'GET', null, undefined, false, true);
    return Array.isArray(result) ? result.map((l: any) => ({
        ...mapLocation(l),
        distance: l.distance || 0
    })) : [];
};

export const saveBulkODBLocations = async (locations: Omit<ODBLocation, 'id'>[]): Promise<{added: number, skipped: number}> => {
    return await apiRequest('import_csv', 'POST', { locations });
};

// --- HELPERS ---
const mapLocation = (loc: any): ODBLocation => ({
    ...loc,
    id: Number(loc.id),
    ODB_ID: loc.ODB_ID || loc.odb_id,
    CITYNAME: loc.CITYNAME || loc.city_name,
    LATITUDE: Number(loc.LATITUDE || loc.latitude),
    LONGITUDE: Number(loc.LONGITUDE || loc.longitude),
    ownerId: loc.ownerId ? Number(loc.ownerId) : null,
    ownerName: loc.ownerName,
    isLocked: loc.isLocked == 1 || loc.isLocked === true
});
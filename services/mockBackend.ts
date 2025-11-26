import { ODBLocation, User, SiteSettings, NearbyLocation, Permission, SystemLog, RoleDefinition, PermissionResource, PermissionAction, PermissionScope } from '../types';

const API_BASE_URL = 'https://start.enjaz.cloud/api/api.php'; 
const STORAGE_KEY_USER_SESSION = 'odb_user_session_v4_rbac';
const STORAGE_KEY_DEVICE_ID = 'odb_device_id_fingerprint';
const STORAGE_KEY_ROLES = 'odb_custom_roles_v1';
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
        name: 'مشرف منطقة',
        isSystem: true,
        permissions: [
            { resource: 'dashboard', action: 'view', scope: 'own' },
            { resource: 'odb', action: 'view', scope: 'all' }, // Can view all
            { resource: 'odb', action: 'create', scope: 'own' },
            { resource: 'odb', action: 'edit', scope: 'team' }, // Edit Team Only
            { resource: 'odb', action: 'delete', scope: 'none' },
            { resource: 'users', action: 'view', scope: 'team' }, // View Team Only
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
            { resource: 'odb', action: 'view', scope: 'all' }, // Can view all generally
            { resource: 'odb', action: 'create', scope: 'own' },
            { resource: 'odb', action: 'edit', scope: 'own' }, // Edit Own Only
            { resource: 'map_filter', action: 'view', scope: 'all' },
            { resource: 'search_odb', action: 'view', scope: 'all' },
            { resource: 'my_activity', action: 'view', scope: 'own' }
        ]
    }
];

// --- ROLE MANAGEMENT SERVICE ---
export const getRoles = (): RoleDefinition[] => {
    const stored = localStorage.getItem(STORAGE_KEY_ROLES);
    const customRoles = stored ? JSON.parse(stored) : [];
    return [...SYSTEM_ROLES, ...customRoles];
};

export const saveRole = (role: RoleDefinition) => {
    const roles = getRoles();
    const isSystem = SYSTEM_ROLES.some(r => r.id === role.id);
    
    if (isSystem) throw new Error("لا يمكن تعديل الأدوار الأساسية للنظام مباشرة. قم بإنشاء دور جديد.");

    const customRoles = roles.filter(r => !r.isSystem && r.id !== role.id);
    customRoles.push(role);
    localStorage.setItem(STORAGE_KEY_ROLES, JSON.stringify(customRoles));
    
    // Log
    logAction(getSession()?.username || 'System', 'UPDATE', 'Roles', `Updated role: ${role.name}`);
};

export const deleteRole = (roleId: string) => {
    const isSystem = SYSTEM_ROLES.some(r => r.id === roleId);
    if (isSystem) throw new Error("لا يمكن حذف الأدوار الأساسية للنظام.");
    
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

async function apiRequest(action: string, method: 'GET' | 'POST' = 'GET', body: any = null, signal?: AbortSignal, silent: boolean = false) {
    const url = `${API_BASE_URL}?action=${action}`;
    const user = getSession();
    const headers: any = { 'Content-Type': 'application/json' };
    if (user && user.id) headers['X-User-Id'] = user.id.toString();

    const options: RequestInit = { method, headers, mode: 'cors', signal };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(url, options);
        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch (e) { 
             throw new Error('Server Error: Invalid JSON'); 
        }
        if (!response.ok || data.error) throw new Error(data.error || `Error ${response.status}`);
        return data;
    } catch (error: any) {
        if (!silent) console.error(`API Request Failed [${action}]:`, error);
        throw error;
    }
}

// --- UTILS ---
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; 
    const dLat = (lat2 - lat1) * (Math.PI/180);
    const dLon = (lon2 - lon1) * (Math.PI/180);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
}

export const getDeviceFingerprint = (): string => {
    let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
    }
    return deviceId;
};

// --- AUTH & PERMISSION LOGIC ---

// This is the Core Function for the new RBAC system
export const checkPermission = (user: User | null, resource: PermissionResource, action: PermissionAction, targetOwnerId?: number | null): boolean => {
    if (!user) return false;
    if (user.username === 'admin') return true; // God mode

    const perm = user.permissions.find(p => p.resource === resource && p.action === action);
    if (!perm) return false;

    // Evaluate Scope
    if (perm.scope === 'none') return false;
    if (perm.scope === 'all') return true;
    
    if (targetOwnerId === undefined || targetOwnerId === null) {
        return true; 
    }

    if (perm.scope === 'own') {
        return targetOwnerId === user.id;
    }

    if (perm.scope === 'team') {
        return targetOwnerId === user.id || isSubordinate(user, targetOwnerId);
    }

    return false;
};

// Wrapper for permission check without target
export const hasPermission = (user: User | null, resource: PermissionResource | string, action: PermissionAction | string): boolean => {
    return checkPermission(user, resource as PermissionResource, action as PermissionAction);
};

const isSubordinate = (supervisor: User, targetId: number): boolean => {
    return true; // Mock implementation
};

export const mockLogin = async (username: string, pass: string, deviceId?: string): Promise<User> => {
    const finalDeviceId = deviceId || getDeviceFingerprint();
    const payload = { username, password: pass, deviceId: finalDeviceId };
    
    const user = await apiRequest('login', 'POST', payload);
    let finalUser = { ...user };
    finalUser.id = Number(finalUser.id);
    finalUser.supervisorId = finalUser.supervisorId ? Number(finalUser.supervisorId) : null;
    finalUser.isActive = finalUser.isActive == 1 || finalUser.isActive === true;

    // Hydrate Permissions from Role Definition
    const roleDef = getRoleById(finalUser.role);
    if (roleDef) {
        finalUser.permissions = roleDef.permissions;
    } else {
        // Fallback to legacy default if custom role missing
        finalUser.permissions = SYSTEM_ROLES.find(r => r.id === 'delegate')?.permissions || [];
    }

    // Force Admin for username 'admin'
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
        const allUsers = await apiRequest('get_users'); 
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

// --- SITE SETTINGS & MISC ---

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

export const getODBLocationsPaginated = async (page: number, limit: number, search: string = '', signal?: AbortSignal): Promise<{data: ODBLocation[], total: number, totalPages: number}> => {
    const user = getSession();
    if (!user) throw new Error("Unauthorized");

    const viewPerm = user.permissions.find(p => p.resource === 'odb' && p.action === 'view');
    const scope = viewPerm?.scope || 'none';

    let queryParams = `get_locations_paginated&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`;
    
    const result = await apiRequest(queryParams, 'GET', null, signal);
    
    let mappedData = result.data.map((loc: any) => mapLocation(loc));

    if (user.username !== 'admin' && scope !== 'all') {
        if (scope === 'own') {
            mappedData = mappedData.filter((l: ODBLocation) => l.ownerId === user.id);
        }
    }

    return { data: mappedData, total: Number(result.total), totalPages: Number(result.totalPages) };
};

export const saveODBLocation = async (location: ODBLocation): Promise<void> => {
    const user = getSession();
    if (!user) throw new Error("No session");

    const isNew = !location.id || location.id === 0;
    
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

export const searchODBLocation = async (query: string): Promise<ODBLocation[]> => {
    const result = await apiRequest(`search_locations&query=${encodeURIComponent(query)}`);
    return Array.isArray(result) ? result.map(mapLocation) : [];
};

export const getAllLocationsForMap = async (): Promise<ODBLocation[]> => {
    const result = await apiRequest('get_all_locations');
    return Array.isArray(result) ? result.map(mapLocation) : [];
};

export const getLocationDetails = async (id: number): Promise<ODBLocation> => {
     const result = await apiRequest(`get_location_details&id=${id}`);
     return mapLocation(result);
};

export const getMyActivity = async (username: string): Promise<{data: ODBLocation[]}> => {
    const result = await apiRequest(`get_my_activity&username=${encodeURIComponent(username)}`);
    return { data: Array.isArray(result) ? result.map(mapLocation) : [] };
};

export const getNearbyLocationsAPI = async (lat: number, lng: number, radius: number, limit: number): Promise<NearbyLocation[]> => {
    const result = await apiRequest(`get_nearby&lat=${lat}&lng=${lng}&radius=${radius}&limit=${limit}`);
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
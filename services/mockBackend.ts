
import { ODBLocation, User, SiteSettings, NearbyLocation, Permission, SystemLog } from '../types';

const API_BASE_URL = 'https://start.enjaz.cloud/api/api.php'; 
const STORAGE_KEY_USER_SESSION = 'odb_user_session_v3_perm';
const STORAGE_KEY_DEVICE_ID = 'odb_device_id_fingerprint';

// --- DEFAULT PERMISSIONS TEMPLATES ---
const ADMIN_PERMISSIONS: Permission[] = [
    { resource: 'dashboard', actions: ['view'] },
    { resource: 'odb', actions: ['view', 'create', 'edit', 'delete', 'export'] },
    { resource: 'nearby', actions: ['view', 'create', 'edit'] },
    { resource: 'users', actions: ['view', 'create', 'edit', 'delete'] },
    { resource: 'settings', actions: ['view', 'edit'] },
    { resource: 'my_activity', actions: ['view'] },
    { resource: 'map_filter', actions: ['view', 'create', 'edit', 'delete', 'export'] }, 
    { resource: 'search_odb', actions: ['view', 'edit'] },
    { resource: 'system_logs', actions: ['view', 'delete', 'export'] }
];

const SUPERVISOR_PERMISSIONS: Permission[] = [
    { resource: 'dashboard', actions: ['view'] },
    { resource: 'odb', actions: ['view', 'create', 'edit'] }, 
    { resource: 'nearby', actions: ['view'] },
    { resource: 'users', actions: ['view', 'create', 'edit'] }, 
    { resource: 'my_activity', actions: ['view'] },
    { resource: 'map_filter', actions: ['view'] },
    { resource: 'search_odb', actions: ['view'] },
    { resource: 'system_logs', actions: [] }
];

const DELEGATE_PERMISSIONS: Permission[] = [
    { resource: 'dashboard', actions: ['view'] },
    { resource: 'odb', actions: ['view'] }, 
    { resource: 'nearby', actions: ['view'] },
    { resource: 'my_activity', actions: ['view', 'edit'] }, 
    { resource: 'map_filter', actions: ['view'] },
    { resource: 'search_odb', actions: ['view'] },
    { resource: 'system_logs', actions: [] }
];

const DEFAULT_SETTINGS: SiteSettings = {
    siteName: 'ODB Manager Pro',
    primaryColor: '#1e40af',
    secondaryColor: '#1e293b',
    accentColor: '#3b82f6',
    searchRadius: 50,
    maxResults: 20 
};

// --- SYSTEM LOGGING (CONNECTED TO API) ---
export const getLogs = async (): Promise<SystemLog[]> => {
    try {
        const result = await apiRequest('get_logs', 'GET', null, undefined, true);
        return Array.isArray(result) ? result : [];
    } catch (e) {
        console.error("Failed to fetch logs:", e);
        return [];
    }
};

export const logAction = (username: string, action: SystemLog['action'], resource: string, details: string) => {
     const payload = {
        username: username || 'Unknown',
        action,
        resource,
        details
    };
    // Send to server without blocking UI (Fire and Forget)
    apiRequest('log_action', 'POST', payload, undefined, true).catch(e => {
        console.error("System Log Failed", e);
    });
};

export const clearLogs = async (olderThanDays?: number): Promise<void> => {
    await apiRequest('clear_logs', 'GET');
    const user = getSession();
    if(user) {
        logAction(user.username, 'DELETE', 'System', 'Cleared all system logs');
    }
};

// --- HELPER ---
async function apiRequest(action: string, method: 'GET' | 'POST' = 'GET', body: any = null, signal?: AbortSignal, silent: boolean = false) {
    const url = `${API_BASE_URL}?action=${action}`;
    
    // Get Current User ID for Security Context
    const user = getSession();
    const headers: any = { 'Content-Type': 'application/json' };
    if (user && user.id) {
        headers['X-User-Id'] = user.id.toString();
    }

    const options: RequestInit = {
        method,
        headers: headers,
        mode: 'cors',
        signal
    };
    if (body) options.body = JSON.stringify(body);

    try {
        const response = await fetch(url, options);
        const text = await response.text();
        
        let data;
        try { 
            data = JSON.parse(text); 
        } catch (e) { 
            if (response.ok) {
                 if (text.includes("Fatal error") || text.includes("Parse error")) {
                    throw new Error("خطأ برمجي في السيرفر (PHP Error).");
                 }
                 throw new Error('الخادم أرسل استجابة غير صحيحة (Invalid JSON)'); 
            }
        }

        if (!response.ok) {
            if (data && data.error) throw new Error(data.error);
            const cleanText = text ? text.replace(/<[^>]+>/g, '').trim().substring(0, 150) : response.statusText;
            throw new Error(`Server Error (${response.status}): ${cleanText}`);
        }

        if (data.error) throw new Error(data.error);
        return data;

    } catch (error: any) {
        if (error.name === 'AbortError') throw error;
        if (error.message === 'Failed to fetch') {
             throw new Error("فشل الاتصال بالسيرفر. تأكد من تشغيل ملف api.php وإعدادات CORS.");
        }
        if (!silent) console.error(`API Request Failed [${action}]:`, error);
        throw error;
    }
}

// --- UTILS ---
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const d = R * c; 
    return d;
}

function deg2rad(deg: number): number {
    return deg * (Math.PI/180);
}

// --- DEVICE FINGERPRINT UTILS ---
export const getDeviceFingerprint = (): string => {
    let deviceId = localStorage.getItem(STORAGE_KEY_DEVICE_ID);
    if (!deviceId) {
        deviceId = 'dev_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        localStorage.setItem(STORAGE_KEY_DEVICE_ID, deviceId);
    }
    return deviceId;
};

// --- AUTH & PERMISSIONS ---
export const mockLogin = async (username: string, pass: string, deviceId?: string): Promise<User> => {
    const finalDeviceId = deviceId || getDeviceFingerprint();
    
    const payload = { username, password: pass, deviceId: finalDeviceId };
    
    try {
        const user = await apiRequest('login', 'POST', payload);
        
        let finalUser = { ...user };
        if (typeof finalUser.permissions === 'string') {
            try { finalUser.permissions = JSON.parse(finalUser.permissions); } catch(e) { finalUser.permissions = null; }
        }

        // Apply defaults ONLY if permissions are missing.
        if (!finalUser.permissions || !Array.isArray(finalUser.permissions)) {
            if (finalUser.role === 'admin') finalUser.permissions = ADMIN_PERMISSIONS;
            else if (finalUser.role === 'supervisor') finalUser.permissions = SUPERVISOR_PERMISSIONS;
            else finalUser.permissions = DELEGATE_PERMISSIONS;
        }
        
        // Ensure Super Admin has all permissions visually in state (though logic overrides)
        if (finalUser.username === 'admin') {
            finalUser.permissions = ADMIN_PERMISSIONS;
            finalUser.role = 'admin';
        }
        
        finalUser.id = Number(finalUser.id);
        finalUser.supervisorId = finalUser.supervisorId ? Number(finalUser.supervisorId) : null;

        if (finalUser.deviceId) {
            if (finalUser.deviceId !== finalDeviceId) {
                logAction(username, 'SECURITY', 'Auth', `Failed login attempt from unregistered device: ${finalDeviceId}`);
                throw new Error("هذا الحساب مرتبط بجهاز آخر. لا يمكنك تسجيل الدخول من هذا الجهاز. يرجى التواصل مع المدير.");
            }
        } else {
            try {
                await bindUserDevice(finalUser.id, finalDeviceId);
                finalUser.deviceId = finalDeviceId;
                logAction(username, 'SECURITY', 'Device', 'First time device binding successful');
            } catch (e) {
                console.error("Failed to bind device", e);
            }
        }

        localStorage.setItem(STORAGE_KEY_USER_SESSION, JSON.stringify(finalUser));
        
        // Log Success
        logAction(username, 'LOGIN', 'System', 'User logged in successfully');
        
        return finalUser as User;
    } catch (e: any) {
        // Log Failure if not a device error (to avoid spamming from valid users on wrong devices)
        if (!e.message.includes('مرتبط بجهاز')) {
            logAction(username, 'ERROR', 'Auth', `Login failed: ${e.message}`);
        }
        throw e;
    }
};

export const bindUserDevice = async (userId: number, deviceId: string): Promise<void> => {
    await apiRequest(`bind_device&id=${userId}&deviceId=${deviceId}`, 'GET', null, undefined, true);
};

export const resetUserDevice = async (id: number): Promise<void> => {
    await apiRequest(`reset_user_device&id=${id}`, 'GET');
    const currentUser = getSession();
    logAction(currentUser?.username || 'System', 'SECURITY', 'User', `Reset device binding for User ID: ${id}`);
};

export const mockLogout = () => {
  const user = getSession();
  if (user) {
      logAction(user.username, 'LOGOUT', 'System', 'User logged out');
  }
  localStorage.removeItem(STORAGE_KEY_USER_SESSION);
};

export const getSession = (): User | null => {
  const data = localStorage.getItem(STORAGE_KEY_USER_SESSION);
  return data ? JSON.parse(data) : null;
};

export const refreshUserSession = async (userId: number): Promise<User | null> => {
    try {
        const allUsers = await apiRequest('get_users', 'GET', null, undefined, true); 
        const rawUser = allUsers.find((u: any) => Number(u.id) === userId);
        
        if (!rawUser) return null;

        let permissions = rawUser.permissions;
        if (typeof permissions === 'string') {
            try { permissions = JSON.parse(permissions); } catch(e) { permissions = null; }
        }

        if (!permissions || !Array.isArray(permissions)) {
             if (rawUser.role === 'admin') permissions = ADMIN_PERMISSIONS;
             else if (rawUser.role === 'supervisor') permissions = SUPERVISOR_PERMISSIONS;
             else permissions = DELEGATE_PERMISSIONS;
        }

        const freshUser: User = {
            id: Number(rawUser.id),
            username: rawUser.username,
            name: rawUser.name,
            email: rawUser.email,
            role: rawUser.role,
            supervisorId: rawUser.supervisorId ? Number(rawUser.supervisorId) : null,
            isActive: rawUser.isActive == 1 || rawUser.isActive === true,
            permissions: permissions,
            deviceId: rawUser.deviceId || null
        };
        
        // Ensure Super Admin always has consistent state
        if (freshUser.username === 'admin') {
            freshUser.permissions = ADMIN_PERMISSIONS;
            freshUser.role = 'admin';
            freshUser.isActive = true; // Cannot be deactivated
        }
        
        return freshUser;

    } catch (e) {
        return null;
    }
};

export const hasPermission = (user: User, resource: string, action: string): boolean => {
    if (!user) return false;
    
    // ----------------------------------------------------------------
    // SUPER ADMIN BYPASS: The user 'admin' has absolute power
    // ----------------------------------------------------------------
    if (user.username === 'admin') return true;

    // For everyone else (even other 'admins'), check the permissions array
    if (!user.permissions || !Array.isArray(user.permissions)) {
        return false;
    }

    const resPerm = user.permissions.find(p => p.resource === resource);
    return resPerm ? resPerm.actions.includes(action as any) : false;
};

// --- USER MANAGEMENT ---
export const getUsers = async (currentUser: User): Promise<User[]> => {
    // The filtering now happens in Backend based on X-User-Id, so we just return what we get
    const allUsers = await apiRequest('get_users');
    let usersList = allUsers.map((u: any) => ({
        ...u,
        id: Number(u.id),
        supervisorId: u.supervisorId ? Number(u.supervisorId) : null,
        isActive: u.isActive == 1 || u.isActive === true,
        permissions: u.permissions ? (typeof u.permissions === 'string' ? JSON.parse(u.permissions) : u.permissions) : (u.role === 'admin' ? ADMIN_PERMISSIONS : (u.role === 'supervisor' ? SUPERVISOR_PERMISSIONS : DELEGATE_PERMISSIONS)),
        deviceId: u.deviceId || null
    }));
    return usersList;
};

export const saveUser = async (userToSave: User): Promise<void> => {
    const userSession = getSession();
    let logDetails = '';
    const isUpdate = userToSave.id && userToSave.id !== 0;

    // PROTECTION: Cannot change role of Super Admin via normal save
    if (userToSave.username === 'admin' && userToSave.role !== 'admin') {
        throw new Error("لا يمكن تغيير صلاحية الحساب الرئيسي (Super Admin)");
    }
    if (userToSave.username === 'admin' && userToSave.isActive === false) {
        throw new Error("لا يمكن إيقاف الحساب الرئيسي (Super Admin)");
    }

    // Simplified Log Details
    logDetails = isUpdate ? `Updated user ${userToSave.username}` : `Created new user: ${userToSave.username}`;

    const payload = { ...userToSave, permissions: userToSave.permissions };
    await apiRequest('save_user', 'POST', payload);
    
    logAction(userSession?.username || 'System', isUpdate ? 'UPDATE' : 'CREATE', 'User', logDetails);
};

export const deleteUser = async (id: number): Promise<void> => {
    // Protection: Cannot delete Super Admin
    if (id === 1) { 
        throw new Error("لا يمكن حذف الحساب الرئيسي (Super Admin)");
    }

    await apiRequest(`delete_user&id=${id}`, 'GET');
    const currentUser = getSession();
    logAction(currentUser?.username || 'System', 'DELETE', 'User', `Deleted user ID: ${id}`);
};

export const toggleUserStatus = async (id: number): Promise<void> => {
    await apiRequest(`toggle_user_status&id=${id}`, 'GET');
    const currentUser = getSession();
    logAction(currentUser?.username || 'System', 'UPDATE', 'User', `Toggled active status for user ID: ${id}`);
};

// --- LOCATIONS & ACTIVITY ---
export const getODBLocationsPaginated = async (page: number, limit: number, search: string = '', signal?: AbortSignal): Promise<{data: ODBLocation[], total: number, totalPages: number}> => {
    try {
        const result = await apiRequest(`get_locations_paginated&page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`, 'GET', null, signal);
        const mappedData = result.data.map((loc: any) => ({
            ...loc,
            id: Number(loc.id),
            ODB_ID: loc.ODB_ID || loc.odb_id,
            CITYNAME: loc.CITYNAME || loc.city_name,
            LATITUDE: Number(loc.LATITUDE || loc.latitude),
            LONGITUDE: Number(loc.LONGITUDE || loc.longitude),
            lastEditedBy: loc.last_edited_by || loc.lastEditedBy,
            lastEditedAt: loc.last_edited_at || loc.lastEditedAt,
            ownerId: loc.ownerId ? Number(loc.ownerId) : null,
            ownerName: loc.ownerName,
            isLocked: loc.isLocked == 1 || loc.isLocked === true,
            image: undefined 
        }));
        return { data: mappedData, total: Number(result.total), totalPages: Number(result.totalPages) };
    } catch (e: any) {
        throw e;
    }
};

export const searchODBLocation = async (query: string): Promise<ODBLocation[]> => {
    // Add global_search=1 to bypass ownership checks
    const result = await apiRequest(`get_locations_paginated&page=1&limit=5&search=${encodeURIComponent(query)}&global_search=1`, 'GET');
    
    return result.data.map((loc: any) => ({
        ...loc,
        id: Number(loc.id),
        ODB_ID: loc.ODB_ID || loc.odb_id,
        CITYNAME: loc.CITYNAME || loc.city_name,
        LATITUDE: Number(loc.LATITUDE || loc.latitude),
        LONGITUDE: Number(loc.LONGITUDE || loc.longitude),
        lastEditedBy: loc.last_edited_by || loc.lastEditedBy,
        lastEditedAt: loc.last_edited_at || loc.lastEditedAt,
        ownerId: loc.ownerId ? Number(loc.ownerId) : null,
        ownerName: loc.ownerName,
        isLocked: loc.isLocked == 1 || loc.isLocked === true,
        image: undefined 
    }));
};

export const getAllLocationsForMap = async (): Promise<ODBLocation[]> => {
     try {
        const result = await apiRequest(`get_locations_paginated&page=1&limit=500`, 'GET');
        return result.data.map((loc: any) => ({
            ...loc,
            id: Number(loc.id),
            ODB_ID: loc.ODB_ID || loc.odb_id,
            CITYNAME: loc.CITYNAME || loc.city_name,
            LATITUDE: Number(loc.LATITUDE || loc.latitude),
            LONGITUDE: Number(loc.LONGITUDE || loc.longitude),
            ownerId: loc.ownerId ? Number(loc.ownerId) : null,
            ownerName: loc.ownerName,
            isLocked: loc.isLocked == 1 || loc.isLocked === true,
            image: undefined 
        }));
    } catch (e) {
        console.error(e);
        return [];
    }
};

export const getLocationDetails = async (id: number): Promise<ODBLocation> => {
    const result = await apiRequest(`get_location_details&id=${id}`, 'GET');
    const loc = Array.isArray(result) ? result[0] : result;
    
    if (!loc) throw new Error("الموقع غير موجود");

    return {
        ...loc,
        id: Number(loc.id),
        ODB_ID: loc.ODB_ID || loc.odb_id,
        CITYNAME: loc.CITYNAME || loc.city_name,
        LATITUDE: Number(loc.LATITUDE || loc.latitude),
        LONGITUDE: Number(loc.LONGITUDE || loc.longitude),
        lastEditedBy: loc.last_edited_by || loc.lastEditedBy,
        lastEditedAt: loc.last_edited_at || loc.lastEditedAt,
        ownerId: loc.ownerId ? Number(loc.ownerId) : null,
        ownerName: loc.ownerName,
        isLocked: loc.isLocked == 1 || loc.isLocked === true,
        image: loc.image
    };
};

export const getMyActivity = async (username: string, page: number = 1, limit: number = 20): Promise<{data: ODBLocation[], total: number}> => {
    const result = await apiRequest(`get_locations_paginated&page=${page}&limit=${limit}&editor=${encodeURIComponent(username)}`, 'GET');
    
    const mappedData = result.data.map((loc: any) => ({
        ...loc,
        id: Number(loc.id),
        ODB_ID: loc.ODB_ID || loc.odb_id,
        CITYNAME: loc.CITYNAME || loc.city_name,
        LATITUDE: Number(loc.LATITUDE || loc.latitude),
        LONGITUDE: Number(loc.LONGITUDE || loc.longitude),
        lastEditedBy: loc.last_edited_by || loc.lastEditedBy,
        lastEditedAt: loc.last_edited_at || loc.lastEditedAt,
        ownerId: loc.ownerId ? Number(loc.ownerId) : null,
        ownerName: loc.ownerName,
        isLocked: loc.isLocked == 1 || loc.isLocked === true,
        image: undefined 
    }));
    
    return { data: mappedData, total: Number(result.total) };
};

export const getNearbyLocationsAPI = async (lat: number, lng: number, radius: number, limit: number): Promise<NearbyLocation[]> => {
    const effectiveRadius = radius === 0 ? 50000 : radius;
    let data = await apiRequest(`get_nearby_locations&lat=${lat}&lng=${lng}&radius=${effectiveRadius}&limit=${limit}`, 'GET');
    
    if (!Array.isArray(data)) {
        return [];
    }

    let mappedLocations = data.map((loc: any) => {
        const lLat = Number(loc.LATITUDE || loc.latitude);
        const lLng = Number(loc.LONGITUDE || loc.longitude);
        
        let dist = loc.distance ? Number(loc.distance) : calculateDistance(lat, lng, lLat, lLng);

        return {
            ...loc,
            id: Number(loc.id),
            ODB_ID: loc.ODB_ID || loc.odb_id,
            CITYNAME: loc.CITYNAME || loc.city_name,
            LATITUDE: lLat,
            LONGITUDE: lLng,
            distance: dist,
            lastEditedBy: loc.last_edited_by || loc.lastEditedBy,
            lastEditedAt: loc.last_edited_at || loc.lastEditedAt,
            ownerId: loc.ownerId ? Number(loc.ownerId) : null,
            ownerName: loc.ownerName,
            isLocked: loc.isLocked == 1 || loc.isLocked === true,
            image: undefined 
        };
    });

    mappedLocations.sort((a, b) => a.distance - b.distance);

    if (limit > 0) {
        mappedLocations = mappedLocations.slice(0, limit);
    }

    return mappedLocations;
};

export const saveODBLocation = async (location: ODBLocation): Promise<void> => {
    const userSession = getSession();
    
    let finalLocation = { ...location };
    let isNew = false;

    if (!finalLocation.id || finalLocation.id === 0) {
        isNew = true;
        if (userSession) {
            finalLocation.ownerId = userSession.id;
            finalLocation.ownerName = userSession.name;
        }
        finalLocation.isLocked = true;
    } 
    // Ownership is now also handled in Backend, but we send defaults just in case
    
    const payload = {
        ...finalLocation,
        last_edited_by: finalLocation.lastEditedBy,
        last_edited_at: finalLocation.lastEditedAt,
        ownerId: finalLocation.ownerId,
        ownerName: finalLocation.ownerName,
        isLocked: finalLocation.isLocked
    };
    await apiRequest('save_location', 'POST', payload);

    logAction(userSession?.username || 'System', isNew ? 'CREATE' : 'UPDATE', 'Location', `${isNew ? 'Created' : 'Updated'} ODB Location: ${finalLocation.CITYNAME} (${finalLocation.ODB_ID})`);
};

export const saveBulkODBLocations = async (locations: Omit<ODBLocation, 'id'>[]): Promise<{success: boolean, added: number, skipped: number}> => {
    const result = await apiRequest('save_bulk_locations', 'POST', { locations });
    const userSession = getSession();
    logAction(userSession?.username || 'System', 'EXPORT', 'Location', `Bulk imported ${result.added} locations`);
    return result; 
};

export const deleteODBLocation = async (id: number): Promise<void> => {
    await apiRequest(`delete_location&id=${id}`, 'GET');
    const userSession = getSession();
    logAction(userSession?.username || 'System', 'DELETE', 'Location', `Deleted ODB Location ID: ${id}`);
};

// --- SITE SETTINGS ---
export const getSiteSettings = async (): Promise<SiteSettings> => {
    try {
        const settings = await apiRequest('get_settings', 'GET', null, undefined, true);
        return { ...DEFAULT_SETTINGS, ...settings, searchRadius: Number(settings.searchRadius), maxResults: Number(settings.maxResults) };
    } catch (e) {
        return DEFAULT_SETTINGS;
    }
};

export const saveSiteSettings = async (settings: SiteSettings): Promise<void> => {
    await apiRequest('save_settings', 'POST', settings);
    applySiteSettings(settings);
    const userSession = getSession();
    logAction(userSession?.username || 'System', 'UPDATE', 'Settings', 'Updated global site settings');
};

export const applySiteSettings = (settings: SiteSettings) => {
    document.title = settings.siteName;
    const root = document.documentElement;
    root.style.setProperty('--color-primary', settings.primaryColor);
    root.style.setProperty('--color-secondary', settings.secondaryColor);
    root.style.setProperty('--color-accent', settings.accentColor);
};

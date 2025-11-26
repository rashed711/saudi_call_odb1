
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
        let text = await response.text();
        
        // 1. تنظيف النص من أي أحرف مخفية (BOM) أو مسافات زائدة
        text = text.trim().replace(/^\uFEFF/, '');

        let data;
        try { 
            // 2. المحاولة الأولى: تحليل النص مباشرة (الحالة المثالية)
            data = JSON.parse(text);
        } catch (e) { 
            // 3. المحاولة الثانية: البحث عن JSON داخل النص (لتجاهل تحذيرات PHP)
            // نبحث عن أول قوس مفتوح { أو [ وآخر قوس مغلق } أو ]
            
            let startObj = text.indexOf('{');
            let startArr = text.indexOf('[');
            
            // تحديد نقطة البداية (أيهما يأتي أولاً، بشرط أن يكون موجوداً)
            let startIndex = -1;
            if (startObj !== -1 && startArr !== -1) {
                startIndex = Math.min(startObj, startArr);
            } else if (startObj !== -1) {
                startIndex = startObj;
            } else {
                startIndex = startArr;
            }

            let endIndex = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
            
            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                try {
                    const cleanJson = text.substring(startIndex, endIndex + 1);
                    data = JSON.parse(cleanJson);
                } catch (innerError) {
                    console.warn("Failed to parse cleaned JSON segment:", text);
                    throw e; // فشل التنظيف أيضاً
                }
            } else {
                // console.warn("No JSON structure found in response:", text);
                throw e; // لم يتم العثور على هيكل JSON
            }
        }
        
        if (!response.ok || (data && data.error)) {
            // تجاهل الخطأ إذا كان مجرد "لا توجد نتائج"
            if (data && data.error && (data.error.includes('لا توجد') || data.error.includes('No Data'))) {
                return []; // Return empty array\/object instead of throwing
            }
            throw new Error(data.error || `Error ${response.status}`);
        }
        
        return data;
    } catch (error: any) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        
        if (!silent) {
            console.error(`API [${action}] Failed:`, error);
        }
        
        let friendlyMsg = "فشل الاتصال بالسيرفر";
        if (error.message.includes("JSON")) {
            friendlyMsg = `Invalid JSON response from Server`;
        } else if (error.message) {
            friendlyMsg = error.message;
        }
        
        throw new Error(friendlyMsg);
    }
}

// --- DATA MAPPING HELPER (ROBUST) ---
// هذا الجزء يضمن قراءة الحقول سواء كانت بحروف كبيرة أو صغيرة أو مختلطة
const mapDBLocation = (d: any): any => {
    if (!d) return null;
    
    // Helper to find property case-insensitively
    const getProp = (obj: any, ...keys: string[]) => {
        for (const k of keys) {
            if (obj[k] !== undefined) return obj[k];
            const lowerK = k.toLowerCase();
            const found = Object.keys(obj).find(ok => ok.toLowerCase() === lowerK);
            if (found) return obj[found];
        }
        return undefined;
    };

    return {
        ...d, 
        // ضمان أن ID رقم صحيح
        id: Number(getProp(d, 'id', 'ID')), 
        
        // قراءة الإحداثيات بأي صيغة
        LATITUDE: Number(getProp(d, 'latitude', 'LATITUDE', 'lat') || 0), 
        LONGITUDE: Number(getProp(d, 'longitude', 'LONGITUDE', 'lng', 'lon') || 0), 
        
        // قراءة النصوص
        ODB_ID: getProp(d, 'odb_id', 'ODB_ID', 'odbId') || 'N/A', 
        CITYNAME: getProp(d, 'city_name', 'CITYNAME', 'CityName', 'cityName') || 'غير معروف', 
        
        // قراءة المالك
        ownerId: getProp(d, 'owner_id', 'ownerId', 'OwnerId'),
        ownerName: getProp(d, 'ownerName', 'owner_name', 'OwnerName'),
        
        // قراءة القفل
        isLocked: (function() {
            const val = getProp(d, 'is_locked', 'isLocked', 'IsLocked');
            return val === 1 || val === true || val === '1';
        })(),
        
        // المسافة (اختياري)
        distance: getProp(d, 'distance') ? Number(getProp(d, 'distance')) : undefined,

        // الملاحظات والصور
        notes: getProp(d, 'notes', 'NOTES'),
        image: getProp(d, 'image', 'IMAGE'),
        lastEditedBy: getProp(d, 'last_edited_by', 'lastEditedBy'),
        lastEditedAt: getProp(d, 'last_edited_at', 'lastEditedAt')
    };
};


// --- ROLE MANAGEMENT SERVICE ---

export const getRoles = async (): Promise<RoleDefinition[]> => {
    try {
        const dbRoles = await apiRequest('get_roles', 'GET', null, undefined, false, false);
        const roleMap = new Map<string, RoleDefinition>();
        
        SYSTEM_ROLES.forEach(r => roleMap.set(r.id, r));
        
        if (Array.isArray(dbRoles)) {
            dbRoles.forEach((r: any) => {
                let perms = r.permissions;
                if (typeof perms === 'string') {
                    try { 
                        if (perms.startsWith('"') && perms.endsWith('"')) {
                            perms = JSON.parse(perms);
                        }
                        perms = JSON.parse(perms); 
                    } catch(e) { perms = []; }
                }
                if (!Array.isArray(perms)) perms = [];

                roleMap.set(r.id, {
                    id: r.role_id || r.id,
                    name: r.name,
                    isSystem: r.isSystem || r.isSystem === '1' || r.isSystem === 1,
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
    let parsedPerms = dbPermissions;
    if (typeof dbPermissions === 'string') {
        try { parsedPerms = JSON.parse(dbPermissions); } catch { parsedPerms = []; }
    }

    const isValidV6 = parsedPerms && Array.isArray(parsedPerms) && parsedPerms.length > 0 && parsedPerms[0].scope;
    
    if (isValidV6) {
        return parsedPerms;
    }

    try {
        const roles = await getRoles();
        const roleDef = roles.find(r => r.id === userRole);
        if (roleDef && roleDef.permissions.length > 0) {
            return roleDef.permissions;
        }
    } catch (e) { console.warn("Error resolving permissions from roles", e); }

    const sysRole = SYSTEM_ROLES.find(r => r.id === userRole);
    return sysRole ? sysRole.permissions : [];
};

export const mockLogin = async (username: string, pass: string, deviceId?: string): Promise<User> => {
    const payload = { username, password: pass, deviceId: deviceId || getDeviceFingerprint() };
    const user = await apiRequest('login', 'POST', payload);
    
    user.id = Number(user.id);
    user.supervisorId = user.supervisorId ? Number(user.supervisorId) : null;
    user.isActive = user.isActive == 1 || user.isActive === true;

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

export const getODBLocationsPaginated = async (p: number, l: number, s: string = '', sig?: AbortSignal) => {
    const res = await apiRequest(`get_locations_paginated&page=${p}&limit=${l}&search=${encodeURIComponent(s)}`, 'GET', null, sig, false, false);
    
    const safeData = (res && Array.isArray(res.data)) ? res.data : [];
    
    return { 
        data: safeData.map(mapDBLocation).filter((i: any) => i !== null),
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
    const res = await apiRequest(`search_locations&query=${encodeURIComponent(q)}`, 'GET', null, undefined, false, false);
    if (!Array.isArray(res)) return [];
    return res.map(mapDBLocation);
};

export const getAllLocationsForMap = async () => {
    const res = await apiRequest('get_all_locations', 'GET', null, undefined, false, false);
    if (!Array.isArray(res)) return [];
    return res.map(mapDBLocation);
};

export const getLocationDetails = async (id: number) => { 
    const d = await apiRequest(`get_location_details&id=${id}`, 'GET', null, undefined, false, false); 
    return mapDBLocation(d);
};

export const getMyActivity = async (u: string) => {
    const res = await apiRequest(`get_my_activity&username=${encodeURIComponent(u)}`, 'GET', null, undefined, false, false);
    const data = Array.isArray(res) ? res : [];
    return { data: data.map(mapDBLocation) };
};

export const getNearbyLocationsAPI = async (lat: number, lng: number, r: number, l: number) => {
    const res = await apiRequest(`get_nearby&lat=${lat}&lng=${lng}&radius=${r}&limit=${l}`, 'GET', null, undefined, false, false);
    if (!Array.isArray(res)) return [];
    return res.map(mapDBLocation);
};

export const saveBulkODBLocations = async (locs: any[]) => await apiRequest('import_csv', 'POST', { locations: locs });

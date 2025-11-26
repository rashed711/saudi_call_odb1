
export type PermissionResource = 'dashboard' | 'odb' | 'nearby' | 'users' | 'settings' | 'my_activity' | 'map_filter' | 'search_odb' | 'system_logs' | 'roles';
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export';
export type PermissionScope = 'none' | 'own' | 'team' | 'all';

export interface Permission {
  resource: PermissionResource;
  action: PermissionAction;
  scope: PermissionScope; // النطاق: لا يوجد، خاص بي، فريقي، الكل
}

export interface RoleDefinition {
  id: string;
  name: string;
  description?: string;
  isSystem?: boolean; // الأدوار الأساسية لا يمكن حذفها
  permissions: Permission[];
}

export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  password?: string;
  role: string; // Dynamic Role ID (e.g., 'admin', 'supervisor', 'custom_role_1')
  supervisorId?: number | null; 
  isActive: boolean;
  permissions: Permission[]; // Snapshot of permissions at login or custom overrides
  deviceId?: string | null; 
}

export interface ODBLocation {
  id: number; 
  ODB_ID: string; 
  CITYNAME: string;
  LATITUDE: number;
  LONGITUDE: number;
  image?: string; 
  notes?: string; 
  lastEditedBy?: string;
  lastEditedAt?: string;
  ownerId?: number | null; 
  ownerName?: string;      
  isLocked?: boolean;      
}

export interface NearbyLocation extends ODBLocation {
  distance: number; 
}

export interface SiteSettings {
  siteName: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  searchRadius: number; 
  maxResults: number;   
}

export interface SystemLog {
    id: number;
    username: string;
    action: 'LOGIN' | 'LOGOUT' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SECURITY' | 'ERROR' | 'EXPORT';
    resource: string; 
    details: string; 
    timestamp: string;
}

export enum View {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  SETTINGS_ODB = 'SETTINGS_ODB',
  SETTINGS_SITE = 'SETTINGS_SITE',
  USERS = 'USERS',
  PROFILE = 'PROFILE',
  MY_ACTIVITY = 'MY_ACTIVITY',
  MAP_FILTER = 'MAP_FILTER',
  SEARCH_ODB = 'SEARCH_ODB',
  SYSTEM_LOGS = 'SYSTEM_LOGS'
}

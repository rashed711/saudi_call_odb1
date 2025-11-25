
export type PermissionResource = 'dashboard' | 'odb' | 'nearby' | 'users' | 'settings' | 'my_activity' | 'map_filter' | 'search_odb' | 'system_logs';
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export';

export interface Permission {
  resource: PermissionResource;
  actions: PermissionAction[];
}

export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  password?: string;
  role: 'admin' | 'supervisor' | 'delegate'; // Admin, Supervisor, Delegate
  supervisorId?: number | null; // If user is delegate, who is their supervisor?
  isActive: boolean;
  permissions: Permission[]; // Custom permissions list
  deviceId?: string | null; // Security: Unique Device Fingerprint
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
  // Security & Ownership Fields
  ownerId?: number | null; // ID of the delegate/user who created/owns it
  ownerName?: string;      // Name of the owner for display
  isLocked?: boolean;      // If true, only owner/admin/supervisor can edit
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
    resource: string; // e.g., "Location", "User", "Settings"
    details: string; // "Created ODB-123", "Deleted User Ahmed"
    timestamp: string;
}

export enum View {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  SETTINGS_ODB = 'SETTINGS_ODB',
  SETTINGS_SITE = 'SETTINGS_SITE',
  USERS = 'USERS',
  PROFILE = 'PROFILE',
  // NEARBY Removed
  MY_ACTIVITY = 'MY_ACTIVITY',
  MAP_FILTER = 'MAP_FILTER',
  SEARCH_ODB = 'SEARCH_ODB',
  SYSTEM_LOGS = 'SYSTEM_LOGS' // New View
}
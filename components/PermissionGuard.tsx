
import React from 'react';
import { User, PermissionResource, PermissionAction } from '../types';
import { checkPermission } from '../services/mockBackend';

interface Props {
  user: User;
  resource: PermissionResource;
  action: PermissionAction;
  targetOwnerId?: number | null; // Optional: specific object owner to check scope against
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGuard: React.FC<Props> = ({ user, resource, action, targetOwnerId, fallback = null, children }) => {
  // If no targetOwnerId provided, we just check if the user has ANY scope > none
  if (checkPermission(user, resource, action, targetOwnerId)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
};

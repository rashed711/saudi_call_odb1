
import React from 'react';
import { User, PermissionResource, PermissionAction } from '../types';
import { hasPermission } from '../services/mockBackend';

interface Props {
  user: User;
  resource: PermissionResource;
  action: PermissionAction;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const PermissionGuard: React.FC<Props> = ({ user, resource, action, fallback = null, children }) => {
  if (hasPermission(user, resource, action)) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
};

export const usePermission = (user: User) => {
  return (resource: PermissionResource, action: PermissionAction) => hasPermission(user, resource, action);
};

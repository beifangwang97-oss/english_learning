import React from 'react';
import { UserAccountManagement } from '../components/admin/UserAccountManagement';

export const AdminAccountManagement: React.FC = () => {
  return (
    <div className="w-full p-6 md:p-8">
      <UserAccountManagement />
    </div>
  );
};

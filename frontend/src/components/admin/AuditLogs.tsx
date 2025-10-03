import React, { useState } from 'react';
import { useAuditLogs } from '../../hooks/useApi';
import { AuditLog, AuditLogFilter } from '../../types';

export const AuditLogs: React.FC = () => {
  const [filters, setFilters] = useState<AuditLogFilter>({
    user_id: '',
    action: '',
    resource_type: '',
    start_date: '',
    end_date: '',
    limit: 50,
    offset: 0,
  });

  const { data: auditLogs, isLoading, refetch } = useAuditLogs(filters);

  const handleFilterChange = (key: keyof AuditLogFilter, value: string | number) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      offset: 0, // Reset pagination when filters change
    }));
  };

  const handleClearFilters = () => {
    setFilters({
      user_id: '',
      action: '',
      resource_type: '',
      start_date: '',
      end_date: '',
      limit: 50,
      offset: 0,
    });
  };

  const handleLoadMore = () => {
    setFilters(prev => ({
      ...prev,
      offset: (prev.offset || 0) + (prev.limit || 50),
    }));
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create':
      case 'created':
        return 'text-green-600 bg-green-100';
      case 'update':
      case 'updated':
        return 'text-blue-600 bg-blue-100';
      case 'delete':
      case 'deleted':
        return 'text-red-600 bg-red-100';
      case 'login':
      case 'logout':
        return 'text-purple-600 bg-purple-100';
      case 'query':
      case 'search':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getResourceTypeColor = (resourceType: string) => {
    switch (resourceType.toLowerCase()) {
      case 'persona':
        return 'text-blue-600 bg-blue-100';
      case 'policy':
        return 'text-green-600 bg-green-100';
      case 'user':
        return 'text-purple-600 bg-purple-100';
      case 'artifact':
        return 'text-orange-600 bg-orange-100';
      case 'system':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString(),
    };
  };

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading audit logs...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Audit Logs</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => refetch()}
            className="text-orange-600 hover:text-orange-800 text-sm font-medium"
          >
            Refresh
          </button>
          <button
            onClick={handleClearFilters}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              User ID
            </label>
            <input
              type="text"
              value={filters.user_id || ''}
              onChange={(e) => handleFilterChange('user_id', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Filter by user..."
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Action
            </label>
            <select
              value={filters.action || ''}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="query">Query</option>
              <option value="search">Search</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Resource Type
            </label>
            <select
              value={filters.resource_type || ''}
              onChange={(e) => handleFilterChange('resource_type', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">All resources</option>
              <option value="persona">Persona</option>
              <option value="policy">Policy</option>
              <option value="user">User</option>
              <option value="artifact">Artifact</option>
              <option value="system">System</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={filters.start_date || ''}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={filters.end_date || ''}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {auditLogs?.logs?.map((log: AuditLog) => {
                const { date, time } = formatTimestamp(log.timestamp);
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm text-gray-900">{date}</div>
                        <div className="text-sm text-gray-500">{time}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{log.user_name}</div>
                        <div className="text-sm text-gray-500">{log.user_id}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getActionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getResourceTypeColor(log.resource_type)}`}>
                          {log.resource_type}
                        </span>
                        {log.resource_id && (
                          <div className="text-xs text-gray-500 mt-1">
                            ID: {log.resource_id.substring(0, 8)}...
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 max-w-xs truncate">
                        {typeof log.details === 'object' 
                          ? JSON.stringify(log.details).substring(0, 100) + '...'
                          : log.details
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.ip_address || 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(!auditLogs?.logs || auditLogs.logs.length === 0) && (
          <div className="text-center py-8 text-gray-500">
            No audit logs found matching the current filters.
          </div>
        )}
      </div>

      {/* Load More */}
      {auditLogs?.logs && auditLogs.logs.length >= (filters.limit || 50) && (
        <div className="flex justify-center">
          <button
            onClick={handleLoadMore}
            className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
          >
            Load More
          </button>
        </div>
      )}

      {/* Summary */}
      {auditLogs?.total && (
        <div className="text-sm text-gray-500 text-center">
          Showing {auditLogs.logs?.length || 0} of {auditLogs.total} total logs
        </div>
      )}
    </div>
  );
};
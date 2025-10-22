/**
 * ネットワーク図管理用のカスタムフック（JSON データ版）
 */

'use client';

import { useState } from 'react';
import {
  CreateNetworkGraphRequest,
  CreateNetworkGraphResponse,
} from '@/lib/types';

export function useNetworkGraph() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ネットワーク図生成・保存（サンプル版）
  const createNetworkGraph = async (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _networkData: CreateNetworkGraphRequest
  ): Promise<CreateNetworkGraphResponse | null> => {
    try {
      setIsLoading(true);
      setError(null);

      const timestamp = new Date().toISOString();

      // サンプルのネットワーク図URLを返す
      return {
        networkGraphUrl: '/team_network.html', // publicフォルダ内のサンプル
        networkJsonUrl: '/team_network.json', // 仮のJSONファイル
        timestamp,
      };
    } catch {
      setError('Failed to create network graph');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // ネットワーク図URL取得（サンプル版）
  const fetchNetworkGraph = async (
    timestamp: string
  ): Promise<{
    networkGraphUrl: string | null;
    networkJsonUrl: string | null;
    timestamp: string;
  } | null> => {
    try {
      setError(null);

      // サンプルのネットワーク図URLを返す
      return {
        networkGraphUrl: '/team_network.html',
        networkJsonUrl: '/team_network.json',
        timestamp,
      };
    } catch {
      setError('Failed to fetch network graph');
      return null;
    }
  };

  return {
    isLoading,
    error,
    createNetworkGraph,
    fetchNetworkGraph,
    clearError: () => setError(null),
  };
}

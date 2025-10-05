import { useState, useEffect, useRef, useCallback } from 'react';

export interface WebSocketOptions {
  url: string;
  queryParams?: Record<string, string>;
  protocols?: string | string[];
  onOpen?: (event: Event) => void;
  onMessage?: (data: any) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;
  enabled?: boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number;
}

export interface WebSocketHook {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  sendMessage: (message: any) => void;
  lastMessage: any;
  reconnect: () => void;
  disconnect: () => void;
}

export const useWebSocket = (options: WebSocketOptions): WebSocketHook => {
  const {
    url,
    queryParams = {},
    protocols,
    onOpen,
    onMessage,
    onError,
    onClose,
    enabled = true,
    reconnectAttempts = 3,
    reconnectInterval = 3000
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [lastMessage, setLastMessage] = useState<any>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0);
  const messageQueueRef = useRef<any[]>([]);

  // Build WebSocket URL with query parameters
  const buildUrl = useCallback(() => {
    const wsUrl = new URL(url);
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value) {
        wsUrl.searchParams.set(key, value);
      }
    });
    return wsUrl.toString();
  }, [url, queryParams]);

  // Send message
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // Queue message for when connection is established
      messageQueueRef.current.push(message);
    }
  }, []);

  // Process queued messages
  const processMessageQueue = useCallback(() => {
    while (messageQueueRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      const message = messageQueueRef.current.shift();
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!enabled || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    try {
      setConnectionStatus('connecting');
      const wsUrl = buildUrl();
      wsRef.current = new WebSocket(wsUrl, protocols);

      wsRef.current.onopen = (event) => {
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectCountRef.current = 0;
        
        // Process any queued messages
        processMessageQueue();
        
        onOpen?.(event);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          onMessage?.(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onerror = (event) => {
        setConnectionStatus('error');
        onError?.(event);
      };

      wsRef.current.onclose = (event) => {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        wsRef.current = null;
        
        onClose?.(event);

        // Attempt to reconnect if not a clean close and reconnect attempts remain
        if (!event.wasClean && reconnectCountRef.current < reconnectAttempts && enabled) {
          reconnectCountRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
    }
  }, [enabled, buildUrl, protocols, onOpen, onMessage, onError, onClose, reconnectAttempts, reconnectInterval, processMessageQueue]);

  // Reconnect manually
  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    reconnectCountRef.current = 0;
    connect();
  }, [connect]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
  }, []);

  // Effect to manage connection
  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Ping/pong to keep connection alive
  useEffect(() => {
    if (!isConnected) return;

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        sendMessage({ action: 'ping' });
      }
    }, 30000); // Ping every 30 seconds

    return () => clearInterval(pingInterval);
  }, [isConnected, sendMessage]);

  return {
    isConnected,
    connectionStatus,
    sendMessage,
    lastMessage,
    reconnect,
    disconnect
  };
};
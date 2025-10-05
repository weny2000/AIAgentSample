import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public url: string, public protocols?: string | string[]) {
    // Simulate connection opening after a short delay
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 10);
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Mock sending data
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason, wasClean: true }));
    }
  }

  // Helper method to simulate receiving a message
  simulateMessage(data: any) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  // Helper method to simulate an error
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Replace global WebSocket with mock
(global as any).WebSocket = MockWebSocket;

describe('useWebSocket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('connects to WebSocket with correct URL and query parameters', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        queryParams: {
          userId: 'user-1',
          teamId: 'team-1'
        }
      })
    );

    expect(result.current.connectionStatus).toBe('connecting');

    // Wait for connection to open
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('handles incoming messages correctly', async () => {
    const onMessage = jest.fn();
    
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        onMessage
      })
    );

    // Wait for connection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    // Simulate receiving a message
    const mockMessage = { type: 'message', content: 'Hello' };
    const mockWs = (global as any).WebSocket.mock?.instances?.[0];
    
    act(() => {
      if (mockWs) {
        mockWs.simulateMessage(mockMessage);
      }
    });

    expect(onMessage).toHaveBeenCalledWith(mockMessage);
    expect(result.current.lastMessage).toEqual(mockMessage);
  });

  it('sends messages when connected', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws'
      })
    );

    // Wait for connection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    const mockWs = (global as any).WebSocket.mock?.instances?.[0];
    const sendSpy = jest.spyOn(mockWs, 'send');

    const message = { action: 'test', data: 'hello' };
    
    act(() => {
      result.current.sendMessage(message);
    });

    expect(sendSpy).toHaveBeenCalledWith(JSON.stringify(message));
  });

  it('queues messages when not connected', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws'
      })
    );

    const message = { action: 'test', data: 'hello' };
    
    // Send message before connection is established
    act(() => {
      result.current.sendMessage(message);
    });

    // Message should be queued (no error thrown)
    expect(result.current.connectionStatus).toBe('connecting');
  });

  it('handles connection errors', async () => {
    const onError = jest.fn();
    
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        onError
      })
    );

    // Wait for connection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    const mockWs = (global as any).WebSocket.mock?.instances?.[0];
    
    act(() => {
      mockWs.simulateError();
    });

    expect(result.current.connectionStatus).toBe('error');
    expect(onError).toHaveBeenCalled();
  });

  it('handles connection close', async () => {
    const onClose = jest.fn();
    
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        onClose
      })
    );

    // Wait for connection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    const mockWs = (global as any).WebSocket.mock?.instances?.[0];
    
    act(() => {
      mockWs.close();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionStatus).toBe('disconnected');
    expect(onClose).toHaveBeenCalled();
  });

  it('can be manually disconnected', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws'
      })
    );

    // Wait for connection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('can be manually reconnected', async () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws'
      })
    );

    // Wait for initial connection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    // Disconnect
    act(() => {
      result.current.disconnect();
    });

    expect(result.current.isConnected).toBe(false);

    // Reconnect
    act(() => {
      result.current.reconnect();
    });

    expect(result.current.connectionStatus).toBe('connecting');

    // Wait for reconnection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('does not connect when disabled', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws',
        enabled: false
      })
    );

    expect(result.current.connectionStatus).toBe('disconnected');
    expect(result.current.isConnected).toBe(false);
  });

  it('sends ping messages to keep connection alive', async () => {
    jest.useFakeTimers();
    
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'wss://example.com/ws'
      })
    );

    // Wait for connection
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    const mockWs = (global as any).WebSocket.mock?.instances?.[0];
    const sendSpy = jest.spyOn(mockWs, 'send');

    // Fast-forward time to trigger ping
    act(() => {
      jest.advanceTimersByTime(30000);
    });

    expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ action: 'ping' }));

    jest.useRealTimers();
  });
});
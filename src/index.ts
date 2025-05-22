import WebSocket from "ws";

export interface WebSocketConfig {
  url: string;
  headers?: {
    "client-type"?: string;
    Appid?: string;
    ClientId?: string;
    Timestamp?: string;
    Authorization?: string;
    [key: string]: string | undefined;
  };
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;  // 心跳间隔，默认 10 秒
  pongTimeout?: number;   // pong 超时时间，默认 5 秒
}

export interface Message {
  type: string;
  message?: string;
  topic?: string;
  data?: any;
}

// 判断是否在浏览器环境
const isBrowser = typeof window !== "undefined";

// 获取 WebSocket 实现
const getWebSocket = () => {
  if (isBrowser) {
    return window.WebSocket;
  }
  return WebSocket;
};

// 将 headers 转换为 URL 参数
const headersToUrlParams = (headers: WebSocketConfig["headers"]): string => {
  if (!headers) return "";
  return (
    "?" +
    Object.entries(headers)
      .filter(([_, value]) => value !== undefined)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`
      )
      .join("&")
  );
};

export class OpenIMWebSocket {
  private ws: WebSocket | globalThis.WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      pingInterval: 10000,
      pongTimeout: 5000,
      ...config,
    };
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const WebSocketImpl = getWebSocket();
        if (isBrowser) {
          const url = this.config.url + headersToUrlParams(this.config.headers);
          this.ws = new WebSocketImpl(url);
        } else {
          this.ws = new WebSocketImpl(this.config.url, undefined, {
            headers: this.config.headers,
          });
        }

        if (isBrowser) {
          const browserWs = this.ws as globalThis.WebSocket;
          browserWs.onopen = () => {
            console.log("WebSocket connected");
            this.reconnectAttempts = 0;
            this.startPingInterval();
            resolve();
          };

          browserWs.onmessage = (event: MessageEvent) => {
            try {
              const message: Message = JSON.parse(event.data);
              console.log("Received message:", message);
              this.handleMessage(message);
            } catch (error) {
              console.error("Error parsing message:", error);
            }
          };

          browserWs.onclose = () => {
            console.log("WebSocket closed");
            this.stopPingInterval();
            this.handleReconnect();
          };

          browserWs.onerror = (error: Event) => {
            console.error("WebSocket error:", error);
            reject(error);
          };
        } else {
          const nodeWs = this.ws as WebSocket;
          nodeWs.on("open", () => {
            console.log("WebSocket connected");
            this.reconnectAttempts = 0;
            this.startPingInterval();
            resolve();
          });

          nodeWs.on("message", (data: string) => {
            try {
              const message: Message = JSON.parse(data);
              console.log("Received message:", message);
              this.handleMessage(message);
            } catch (error) {
              console.error("Error parsing message:", error);
            }
          });

          nodeWs.on("close", () => {
            console.log("WebSocket closed");
            this.stopPingInterval();
            this.handleReconnect();
          });

          nodeWs.on("error", (error: Error) => {
            console.error("WebSocket error:", error);
            reject(error);
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private startPingInterval() {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      this.send({ type: "ping" });
      this.startPongTimeout();
    }, this.config.pingInterval);
  }

  private startPongTimeout() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
    }
    this.pongTimeout = setTimeout(() => {
      const now = Date.now();
      if (now - this.lastPongTime > this.config.pongTimeout!) {
        console.error("Pong timeout, reconnecting...");
        this.disconnect();
        this.handleReconnect();
      }
    }, this.config.pongTimeout);
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < (this.config.maxReconnectAttempts || 5)) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`
      );
      setTimeout(() => this.connect(), this.config.reconnectInterval);
    } else {
      console.error("Max reconnection attempts reached");
    }
  }

  public send(message: Message): void {
    if (!this.ws) {
      console.error("WebSocket is not connected");
      return;
    }

    if (isBrowser) {
      const browserWs = this.ws as globalThis.WebSocket;
      if (browserWs.readyState === globalThis.WebSocket.OPEN) {
        browserWs.send(JSON.stringify(message));
      }
    } else {
      const nodeWs = this.ws as WebSocket;
      if (nodeWs.readyState === WebSocket.OPEN) {
        nodeWs.send(JSON.stringify(message));
      }
    }
  }

  public subscribe(topic: string): void {
    this.send({
      type: "subscribe",
      topic,
    });
  }

  public on(type: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)?.push(handler);
  }

  private handleMessage(message: Message): void {
    if (message.type === "pong") {
      this.lastPongTime = Date.now();
      return;
    }
    
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      if (typeof message === "string") {
        handlers.forEach((handler) => handler(message));
      } else if (typeof message === "object") {
        handlers.forEach((handler) => handler(message));
      }
    }
  }

  public disconnect(): void {
    this.stopPingInterval();
    if (this.ws) {
      if (isBrowser) {
        (this.ws as globalThis.WebSocket).close();
      } else {
        (this.ws as WebSocket).close();
      }
      this.ws = null;
    }
  }
}

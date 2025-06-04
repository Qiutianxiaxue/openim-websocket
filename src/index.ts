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
  private isReconnect = true;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
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
            console.log("WebSocket opened");
            this.reconnectAttempts = 0;
            this.handleMessage({ type: "open" });
            resolve();
          };

          browserWs.onmessage = (event: MessageEvent) => {
            try {
              const message: Message = JSON.parse(event.data);
              console.log("Received message:", message);
              // 连接验证错误，不会继续重试
              if (message.type === "connect_error") {
                this.isReconnect = false;
                this.handleMessage({ type: "error", data: message.data });
              } else if (message.type === "connected") {
                // 连接成功，授权成功通知，设置为可以重试
                console.log("WebSocket connected");
                this.isReconnect = true;
                this.handleMessage({ type: "connected" });
              } else {
                // 其他消息，转发给客户端，可以重试
                this.isReconnect = true;
                this.handleMessage(message);
              }
            } catch (error) {
              console.error("Error parsing message:", error);
            }
          };

          browserWs.onclose = () => {
            console.log("WebSocket closed");
            this.handleMessage({ type: "close" });
            this.handleReconnect();
          };

          browserWs.onerror = (error: Event) => {
            console.error("WebSocket error:", error);
            this.handleMessage({ type: "error", data: error });
            reject(error);
          };
        } else {
          const nodeWs = this.ws as WebSocket;
          nodeWs.on("open", () => {
            console.log("WebSocket opened");
            this.reconnectAttempts = 0;
            this.handleMessage({ type: "open" });
            resolve();
          });

          nodeWs.on("message", (data: string) => {
            try {
              const message: Message = JSON.parse(data);
              if (message.type === "connect_error") {
                this.isReconnect = false;
                this.handleMessage({ type: "error", data: message });
              } else if (message.type === "connected") {
                console.log("WebSocket connected");
                this.isReconnect = true;
                this.handleMessage({ type: "connected" });
              } else {
                this.isReconnect = true;
                this.handleMessage(message);
              }
            } catch (error) {
              console.error("Error parsing message:", error);
            }
          });

          nodeWs.on("close", () => {
            this.handleMessage({ type: "close" });
            this.handleReconnect();
          });

          nodeWs.on("error", (error: Error) => {
            this.handleMessage({ type: "error", data: error });
            reject(error);
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleReconnect() {
    // 连接验证错误，不会继续重试
    if (!this.isReconnect) {
      return;
    }
    if (this.reconnectAttempts < (this.config.maxReconnectAttempts || 5)) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`
      );
      setTimeout(() => this.connect(), this.config.reconnectInterval);
    } else {
      setTimeout(() => this.connect(), 30000); // 30 seconds before next attempt
      console.error(
        "Max reconnection attempts reached，30 seconds before next attempt"
      );
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
  public unsubscribe(topic: string): void {
    this.send({
      type: "unsubscribe",
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

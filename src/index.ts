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
  enableLogging?: boolean;
}

export interface Message {
  type: string;
  service?: string; // 服务类型
  message?: string;
  topic?: string;
  payload?: any;
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
      enableLogging: false,
      ...config,
    };
  }

  /**
   * 封装的日志方法
   */
  private log(message: string, ...args: any[]): void {
    if (this.config.enableLogging) {
      console.log(`[OpenIMWebSocket] ${message}`, ...args);
    }
  }

  /**
   * 封装的错误日志方法
   */
  private logError(message: string, ...args: any[]): void {
    if (this.config.enableLogging) {
      console.error(`[OpenIMWebSocket] ${message}`, ...args);
    }
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
          browserWs.onopen = () => this.handleOpen(resolve);
          browserWs.onmessage = (event: MessageEvent) =>
            this.handleMessage(event.data);
          browserWs.onclose = () => this.handleClose();
          browserWs.onerror = (error: Event) => this.handleError(error, reject);
        } else {
          const nodeWs = this.ws as WebSocket;
          nodeWs.on("open", () => this.handleOpen(resolve));
          nodeWs.on("message", (data: string) => this.handleMessage(data));
          nodeWs.on("close", () => this.handleClose());
          nodeWs.on("error", (error: Error) => this.handleError(error, reject));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 处理连接打开事件
   */
  private handleOpen(resolve: () => void): void {
    this.log("WebSocket opened");
    this.reconnectAttempts = 0;
    this.isReconnect = true; // 确保重连状态为true
    this.processMessage({ type: "open" });
    resolve();
  }

  /**
   * 处理接收到消息事件
   */
  private handleMessage(data: string): void {
    try {
      const message: Message = JSON.parse(data);
      this.log("Received message:", message);

      // 连接验证错误，不会继续重试
      if (message.type === "connect_error") {
        this.log("WebSocket connect_error");
        this.isReconnect = false;
        this.processMessage(message);
      } else if (message.type === "force_offline") {
        this.log("WebSocket force_offline");
        this.isReconnect = false;
        this.processMessage(message);
      } else if (message.type === "connected") {
        // 连接成功，授权成功通知，设置为可以重试
        this.log("WebSocket connected");
        this.isReconnect = true;
        this.processMessage({ type: "connected", payload: message.payload });
      } else {
        // 其他消息，转发给客户端，可以重试
        this.isReconnect = true;
        this.processMessage(message);
      }
    } catch (error) {
      this.logError("Error parsing message:", error);
    }
  }

  /**
   * 处理连接关闭事件
   */
  private handleClose(): void {
    this.log("WebSocket closed");
    this.processMessage({ type: "close" });
    this.handleReconnect();
  }

  /**
   * 处理错误事件
   */
  private handleError(
    error: Error | Event,
    reject?: (reason?: any) => void
  ): void {
    this.logError("WebSocket error:", error);
    this.processMessage({ type: "error", payload: error });
    if (reject) {
      reject(error);
    }
  }

  /**
   * 处理重连逻辑
   */
  private handleReconnect(): void {
    // 连接验证错误，不会继续重试
    this.log("handleReconnect", this.isReconnect);
    if (!this.isReconnect) {
      return;
    }

    if (this.reconnectAttempts < (this.config.maxReconnectAttempts || 5)) {
      this.reconnectAttempts++;
      this.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`
      );
      setTimeout(() => this.connect(), this.config.reconnectInterval);
    } else {
      this.logError(
        `Max reconnection attempts (${this.config.maxReconnectAttempts}) reached. Stopping reconnection.`
      );
      // 超过最大重试次数，停止重连
      this.isReconnect = false;
    }
  }

  /**
   * 处理消息分发
   */
  private processMessage(message: Message): void {
    // 普通类型事件
    const handlers = this.messageHandlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message));
    }
    if (message.service) {
      // 服务类型事件分发
      const serviceHandlers = this.messageHandlers.get(
        `service:${message.service}`
      );
      if (serviceHandlers) {
        serviceHandlers.forEach((handler) => handler(message));
      }
    }
    // topic 事件分发（如有topic字段）
    if (message.topic) {
      const topicHandlers = this.messageHandlers.get(`topic:${message.topic}`);
      if (topicHandlers) {
        topicHandlers.forEach((handler) => handler(message));
      }
    }
  }

  public send(message: Message): void {
    if (!this.ws) {
      this.logError("WebSocket is not connected");
      return;
    }

    this.log("Sending message:", message);

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

  /**
   * 订阅某个topic，并自动注册监听该topic消息
   * @param topic 订阅主题
   * @param handler 处理该topic消息的方法
   */
  public subscribe(topic: string, handler?: (data: any) => void): void {
    // 注册监听
    const eventType = `topic:${topic}`;
    if (handler) {
      this.on(eventType, handler);
    }

    // 发送订阅请求
    this.send({
      type: "subscribe",
      topic,
    });
  }

  /**
   * 取消订阅某个topic，并移除所有该topic的监听
   * @param topic 订阅主题
   */
  public unsubscribe(topic: string): void {
    // 移除所有监听
    const eventType = `topic:${topic}`;
    this.off(eventType);
    // 发送取消订阅请求
    this.send({
      type: "unsubscribe",
      topic,
    });
  }
  /**
   * 注册监听某个服务类型的消息
   * @param service 服务类型
   * @param handler 处理该服务类型消息的方法
   */
  public onService(service: string, handler: (data: any) => void): void {
    const type = `service:${service}`;
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)?.push(handler);
  }
  /**
   * 注销监听某个类型的消息
   * @param service 类型
   */
  public on(type: string, handler: (data: any) => void): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, []);
    }
    this.messageHandlers.get(type)?.push(handler);
  }
  /**
   * 注销监听某个类型的消息
   * @param type 类型
   * @param handler 可选的处理函数，如果提供则只移除该函数，否则移除所有该类型的监听
   */
  public off(type: string, handler?: (data: any) => void): void {
    if (!this.messageHandlers.has(type)) {
      return;
    }

    if (handler) {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    } else {
      this.messageHandlers.delete(type);
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.log("WebSocket disconnect");
      this.isReconnect = false;
      if (isBrowser) {
        (this.ws as globalThis.WebSocket).close();
      } else {
        (this.ws as WebSocket).close();
      }
      this.ws = null;
    }
  }

  /**
   * 重置重连状态，允许重新开始重连
   */
  public resetReconnect(): void {
    this.log("Resetting reconnect state");
    this.reconnectAttempts = 0;
    this.isReconnect = true;
  }

  /**
   * 获取当前重连状态
   */
  public getReconnectStatus(): {
    attempts: number;
    maxAttempts: number;
    isReconnect: boolean;
  } {
    return {
      attempts: this.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts || 5,
      isReconnect: this.isReconnect,
    };
  }
}

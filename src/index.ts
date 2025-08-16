import WebSocket from "ws";

// 声明全局变量类型
declare const __VERSION__: string;

// 版本信息 - 通过构建时注入
const VERSION = __VERSION__;

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
  heartbeatInterval?: number; // 心跳间隔，默认30秒
  heartbeatTimeout?: number; // 心跳超时时间，默认10秒
  enableNetworkDetection?: boolean; // 是否启用网络状态检测
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
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value!)}`)
      .join("&")
  );
};

// Topic 通配符匹配函数
// 支持 MQTT 风格的通配符：
// + : 匹配单个层级
// # : 匹配多个层级（只能在最后）
// 例如：test/+ 匹配 test/abc，test/# 匹配 test/abc/def
const matchTopicPattern = (pattern: string, topic: string): boolean => {
  // 如果模式和主题完全相同，直接返回 true
  if (pattern === topic) {
    return true;
  }

  // 将模式和主题按 / 分割成层级
  const patternParts = pattern.split("/");
  const topicParts = topic.split("/");

  // 检查是否有 # 通配符
  const hashIndex = patternParts.indexOf("#");

  if (hashIndex !== -1) {
    // # 只能出现在最后一个位置
    if (hashIndex !== patternParts.length - 1) {
      return false;
    }

    // 检查 # 之前的所有层级是否匹配
    for (let i = 0; i < hashIndex; i++) {
      if (i >= topicParts.length) {
        return false;
      }

      if (patternParts[i] !== "+" && patternParts[i] !== topicParts[i]) {
        return false;
      }
    }

    // # 匹配剩余的所有层级，所以如果前面都匹配则返回 true
    return true;
  }

  // 没有 # 通配符，长度必须相同
  if (patternParts.length !== topicParts.length) {
    return false;
  }

  // 逐层比较
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const topicPart = topicParts[i];

    // + 匹配任意单个层级，直接跳过
    if (patternPart === "+") {
      continue;
    }

    // 普通字符串必须完全匹配
    if (patternPart !== topicPart) {
      return false;
    }
  }

  return true;
};

export class OpenIMWebSocket {
  private ws: WebSocket | globalThis.WebSocket | null = null;
  private config: WebSocketConfig;
  private reconnectAttempts = 0;
  private messageHandlers: Map<string, ((data: any) => void)[]> = new Map();
  private isReconnect = true;
  private heartbeatTimer: any = null;
  private heartbeatTimeoutTimer: any = null;
  private isHeartbeatAlive = true;
  private networkStatusHandler: (() => void) | null = null;

  constructor(config: WebSocketConfig) {
    this.config = {
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      enableLogging: false,
      heartbeatInterval: 30000, // 30秒心跳
      heartbeatTimeout: 10000, // 10秒超时
      enableNetworkDetection: true,
      ...config,
    };

    // 打印版本信息
    console.log(`[OpenIMWebSocket] Version: ${VERSION}`);

    // 设置网络状态监听
    this.setupNetworkDetection();
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
          browserWs.onmessage = (event: MessageEvent) => this.handleMessage(event.data);
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
    this.startHeartbeat(); // 启动心跳
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

      // 处理心跳响应
      if (message.type === "pong") {
        this.handleHeartbeatResponse();
        return;
      }

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
    this.stopHeartbeat(); // 停止心跳
    this.processMessage({ type: "close" });
    this.handleReconnect();
  }

  /**
   * 处理错误事件
   */
  private handleError(error: Error | Event, reject?: (reason?: any) => void): void {
    this.logError("WebSocket error:", error);
    this.processMessage({ type: "error", payload: error });
    if (reject) {
      reject(error);
    }
    // 错误时也需要触发重连逻辑
    this.handleReconnect();
  }

  /**
   * 处理重连逻辑
   */
  private handleReconnect(): void {
    // 连接验证错误，不会继续重试
    this.log("handleReconnect called, isReconnect:", this.isReconnect, "current attempts:", this.reconnectAttempts);
    if (!this.isReconnect) {
      this.log("Reconnect disabled, skipping...");
      return;
    }

    if (this.reconnectAttempts < (this.config.maxReconnectAttempts || 5)) {
      this.reconnectAttempts++;
      this.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`);
      setTimeout(() => {
        this.log("Executing reconnect attempt...");
        this.connect();
      }, this.config.reconnectInterval);
    } else {
      this.logError(`Max reconnection attempts (${this.config.maxReconnectAttempts}) reached. Stopping reconnection.`);
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
      const serviceHandlers = this.messageHandlers.get(`service:${message.service}`);
      if (serviceHandlers) {
        serviceHandlers.forEach((handler) => handler(message));
      }
    }
    // topic 事件分发（如有topic字段）
    if (message.topic) {
      // 支持 topic 通配符匹配
      // 通配符 topic 匹配分发
      for (const [key, handlers] of this.messageHandlers.entries()) {
        if (key.startsWith("topic:")) {
          const pattern = key.slice(6); // 去掉 "topic:"
          if (pattern !== message.topic && matchTopicPattern(pattern, message.topic!)) {
            handlers.forEach((handler) => handler(message));
          }
        }
      }
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
  public unsubscribe(topic: string, handler?: (data: any) => void): void {
    // 移除所有监听
    const eventType = `topic:${topic}`;
    this.off(eventType, handler);
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
      this.stopHeartbeat(); // 停止心跳
      this.cleanupNetworkDetection(); // 清理网络检测
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

  /**
   * 获取库版本号
   */
  public static getVersion(): string {
    return VERSION;
  }

  /**
   * 获取实例版本号
   */
  public getVersion(): string {
    return VERSION;
  }

  /**
   * 设置网络状态检测
   */
  private setupNetworkDetection(): void {
    if (!this.config.enableNetworkDetection || !isBrowser) {
      return;
    }

    // 监听网络状态变化
    this.networkStatusHandler = () => {
      if (navigator.onLine) {
        this.log("Network back online, attempting to reconnect...");
        // 网络恢复时重置重连状态并尝试连接
        this.resetReconnect();
        if (!this.isConnected()) {
          this.connect().catch((error) => {
            this.logError("Failed to reconnect after network recovery:", error);
          });
        }
      } else {
        this.log("Network went offline");
        this.stopHeartbeat();
      }
    };

    window.addEventListener("online", this.networkStatusHandler);
    window.addEventListener("offline", this.networkStatusHandler);
  }

  /**
   * 清理网络状态检测
   */
  private cleanupNetworkDetection(): void {
    if (this.networkStatusHandler && isBrowser) {
      window.removeEventListener("online", this.networkStatusHandler);
      window.removeEventListener("offline", this.networkStatusHandler);
      this.networkStatusHandler = null;
    }
  }

  /**
   * 检查连接状态
   */
  private isConnected(): boolean {
    if (!this.ws) return false;

    if (isBrowser) {
      return (this.ws as globalThis.WebSocket).readyState === globalThis.WebSocket.OPEN;
    } else {
      return (this.ws as WebSocket).readyState === WebSocket.OPEN;
    }
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    if (!this.config.heartbeatInterval) return;

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.isHeartbeatAlive = false;

        // 发送心跳消息
        this.send({
          type: "ping",
          payload: { timestamp: Date.now() },
        });

        // 设置心跳超时检测
        this.heartbeatTimeoutTimer = setTimeout(() => {
          if (!this.isHeartbeatAlive) {
            this.log("Heartbeat timeout, closing connection...");
            this.forceCloseConnection();
          }
        }, this.config.heartbeatTimeout || 10000);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer as any);
      this.heartbeatTimer = null;
    }

    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer as any);
      this.heartbeatTimeoutTimer = null;
    }
  }

  /**
   * 强制关闭连接并触发重连
   */
  private forceCloseConnection(): void {
    this.log("Forcing connection close for reconnection");
    this.stopHeartbeat();

    if (this.ws) {
      // 临时设置为允许重连
      const wasReconnectEnabled = this.isReconnect;
      this.isReconnect = true;

      if (isBrowser) {
        (this.ws as globalThis.WebSocket).close();
      } else {
        (this.ws as WebSocket).close();
      }

      this.isReconnect = wasReconnectEnabled;
    }
  }

  /**
   * 处理心跳响应
   */
  private handleHeartbeatResponse(): void {
    this.isHeartbeatAlive = true;
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer as any);
      this.heartbeatTimeoutTimer = null;
    }
  }
}

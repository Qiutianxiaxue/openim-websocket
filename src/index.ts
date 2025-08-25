import WebSocket from "ws";

// 声明全局变量类型
declare const __VERSION__: string;

// 版本信息 - 通过构建时注入
const VERSION = __VERSION__;

// 连接状态枚举
enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  RECONNECTING = "reconnecting",
  ERROR = "error",
}

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
  private networkListeners: {
    handleOnline: () => void;
    handleOffline: () => void;
  } | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer: any = null;
  private isManualDisconnect = false;
  private isReconnecting = false; // 防止并发重连
  private isForceClosing = false; // 标记是否是强制关闭

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

    // 初始化状态
    this.connectionState = ConnectionState.DISCONNECTED;
    this.isManualDisconnect = false;

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
        // 防止并发重连
        if (this.connectionState === ConnectionState.CONNECTING || this.isReconnecting) {
          this.log("Already connecting or reconnecting, skipping duplicate connect call");
          return;
        }
        this.isReconnecting = true;
        // 清理现有连接相关资源（保留网络检测）
        this.cleanupConnection();
        // 更新连接状态
        this.connectionState = ConnectionState.CONNECTING;
        this.isManualDisconnect = false;

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
            this.isReconnecting = false;
            this.handleOpen(resolve);
          };
          browserWs.onmessage = (event: MessageEvent) => this.handleMessage(event.data);
          browserWs.onclose = (event: CloseEvent) => {
            this.isReconnecting = false;
            this.handleClose(event);
          };
          browserWs.onerror = (error: Event) => {
            this.isReconnecting = false;
            this.handleError(error, reject);
          };
        } else {
          const nodeWs = this.ws as WebSocket;
          nodeWs.on("open", () => {
            this.isReconnecting = false;
            this.handleOpen(resolve);
          });
          nodeWs.on("message", (data: string) => this.handleMessage(data));
          nodeWs.on("close", (code: number, reason: string) => {
            this.isReconnecting = false;
            this.handleClose({ code, reason });
          });
          nodeWs.on("error", (error: Error) => {
            this.isReconnecting = false;
            this.handleError(error, reject);
          });
        }
      } catch (error) {
        this.isReconnecting = false;
        this.connectionState = ConnectionState.ERROR;
        reject(error);
      }
    });
  }

  /**
   * 处理连接打开事件
   */
  private handleOpen(resolve: () => void): void {
    this.log("WebSocket opened");
    this.connectionState = ConnectionState.CONNECTED;
    this.reconnectAttempts = 0;
    this.isReconnect = true;

    // 确保启动心跳检测
    this.startHeartbeat();

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
  private handleClose(event?: { code?: number; reason?: string }): void {
    this.log("WebSocket closed", event);
    this.connectionState = ConnectionState.DISCONNECTED;

    // 停止心跳
    this.stopHeartbeat();

    // 清理重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.processMessage({
      type: "close",
      payload: event,
    });

    // 如果不是手动断开且不是强制关闭，则尝试重连
    if (!this.isManualDisconnect && !this.isForceClosing) {
      this.handleReconnect();
    }
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
    this.log("handleReconnect called", {
      isReconnect: this.isReconnect,
      attempts: this.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
      isManualDisconnect: this.isManualDisconnect,
      connectionState: this.connectionState,
      networkOnline: isBrowser ? navigator.onLine : true,
    });

    // 如果是手动断开或不允许重连，则跳过
    if (this.isManualDisconnect || !this.isReconnect) {
      this.log("Reconnect disabled or manual disconnect, skipping...");
      return;
    }

    // 在浏览器环境下检查网络状态
    if (isBrowser && !navigator.onLine) {
      this.log("Network is offline, postponing reconnect until network recovery");
      // 网络离线时暂停重连，等待网络恢复事件
      return;
    }

    // 检查重连次数
    if (this.reconnectAttempts < (this.config.maxReconnectAttempts || 5)) {
      this.reconnectAttempts++;
      this.connectionState = ConnectionState.RECONNECTING;

      // 清理之前的重连定时器
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
      }

      this.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`);
      this.reconnectTimer = setTimeout(() => {
        // 再次检查网络状态和重连状态
        if (isBrowser && !navigator.onLine) {
          this.log("Network still offline, skipping reconnect attempt");
          return;
        }

        // 防止并发重连
        if (!this.isReconnecting) {
          this.connect().catch((error) => {
            this.logError("Reconnect attempt failed:", error);
          });
        }
      }, this.config.reconnectInterval);
    } else {
      this.logError(`Max reconnection attempts (${this.config.maxReconnectAttempts}) reached. Stopping reconnection.`);
      this.isReconnect = false;
      this.connectionState = ConnectionState.ERROR;
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
    this.log("WebSocket disconnect requested");
    this.isManualDisconnect = true;
    this.isReconnect = false;
    this.connectionState = ConnectionState.DISCONNECTED;

    // 执行清理
    this.cleanup();

    // 关闭连接
    if (this.ws) {
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

    // 清理重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
   * 获取当前连接状态
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * 检查是否已连接
   */
  public isWebSocketConnected(): boolean {
    return this.isConnected();
  }

  /**
   * 检查网络是否在线
   */
  public isNetworkOnline(): boolean {
    return isBrowser ? navigator.onLine : true;
  }

  /**
   * 手动触发重连（忽略网络状态）
   */
  public forceReconnect(): void {
    this.log("Force reconnect requested");
    this.resetReconnect();

    // 强制重连，即使网络可能离线
    this.connect().catch((error) => {
      this.logError("Force reconnect failed:", error);
    });
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

    // 创建网络状态处理函数
    const handleOnline = () => {
      this.log("Network back online, immediately attempting to reconnect...");

      // 网络恢复时立即尝试重连，不等待定时器
      if (!this.isConnected() && !this.isManualDisconnect && this.isReconnect) {
        // 清理现有的重连定时器
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // 重置重连次数，给网络恢复一个新的机会
        this.log("Network recovery: resetting reconnect attempts");
        this.reconnectAttempts = 0;

        // 立即重连
        this.log("Network recovery triggered immediate reconnect");
        this.connect().catch((error) => {
          this.logError("Failed to reconnect after network recovery:", error);
          // 如果立即重连失败，恢复正常的重连逻辑
          this.handleReconnect();
        });
      } else if (this.isConnected()) {
        this.log("Network back online, connection already established");
        // 如果已经连接，确保心跳正常运行
        if (!this.heartbeatTimer) {
          this.log("Restarting heartbeat after network recovery");
          this.startHeartbeat();
        }
      }
    };

    const handleOffline = () => {
      this.log("Network went offline, but keeping heartbeat to detect connection status");

      // 网络断开时不停止心跳！心跳是检测连接状态的关键机制
      // this.stopHeartbeat(); // 注释掉这行，保持心跳继续检测

      // 暂停重连定时器，等待网络恢复
      if (this.reconnectTimer) {
        this.log("Clearing reconnect timer due to network offline");
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    // 存储处理函数引用
    this.networkListeners = {
      handleOnline,
      handleOffline,
    };

    // 添加事件监听器
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  }

  /**
   * 清理网络状态检测
   */
  private cleanupNetworkDetection(): void {
    if (this.networkListeners && isBrowser) {
      window.removeEventListener("online", this.networkListeners.handleOnline);
      window.removeEventListener("offline", this.networkListeners.handleOffline);
      this.networkListeners = null;
    }
  }

  /**
   * 清理连接相关资源（保留网络检测）
   */
  private cleanupConnection(): void {
    // 停止心跳
    this.stopHeartbeat();

    // 清理重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * 清理所有资源
   */
  private cleanup(): void {
    // 清理连接相关资源
    this.cleanupConnection();

    // 清理网络检测
    this.cleanupNetworkDetection();
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
    // 如果没有配置心跳间隔，则不启动
    if (!this.config.heartbeatInterval || this.config.heartbeatInterval <= 0) {
      this.log("Heartbeat disabled or invalid interval");
      return;
    }

    // 先停止现有的心跳
    this.stopHeartbeat();

    this.log(`Starting heartbeat with interval: ${this.config.heartbeatInterval}ms`);

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
            this.log("Heartbeat timeout detected, connection appears to be dead");
            this.forceCloseConnection();
          }
        }, this.config.heartbeatTimeout || 10000);
      } else {
        // 连接不可用时，检查是否需要重连
        this.log("Connection not open during heartbeat check");
        if (!this.isManualDisconnect && this.isReconnect) {
          this.log("Connection lost detected by heartbeat, triggering reconnect");
          this.handleReconnect();
        }
      }
    }, this.config.heartbeatInterval);

    this.log("Heartbeat started successfully");
  }

  /**
   * 停止心跳
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      this.log("Stopping heartbeat timer");
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.heartbeatTimeoutTimer) {
      this.log("Stopping heartbeat timeout timer");
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }

    // 重置心跳状态
    this.isHeartbeatAlive = true;
  }

  /**
   * 强制关闭连接并触发重连
   */
  private forceCloseConnection(): void {
    this.log("Forcing connection close for reconnection");
    this.stopHeartbeat();

    if (this.ws) {
      // 设置强制关闭标志
      this.isForceClosing = true;

      // 临时设置为允许重连
      const wasReconnectEnabled = this.isReconnect;
      this.isReconnect = true;

      // 先手动更新连接状态
      this.connectionState = ConnectionState.DISCONNECTED;

      // 关闭前清理所有事件，防止多余挂起连接
      if (isBrowser) {
        const browserWs = this.ws as globalThis.WebSocket;
        browserWs.onopen = null;
        browserWs.onmessage = null;
        browserWs.onclose = null;
        browserWs.onerror = null;
        browserWs.close();
      } else {
        const nodeWs = this.ws as WebSocket;
        nodeWs.removeAllListeners && nodeWs.removeAllListeners();
        nodeWs.close();
      }

      this.ws = null;
      this.isReconnect = wasReconnectEnabled;

      // 手动触发关闭处理逻辑，确保状态正确更新
      this.log("Force close: manually triggering close handler");
      this.processMessage({
        type: "close",
        payload: { code: 1006, reason: "Force close for reconnection" },
      });

      // 重置强制关闭标志
      this.isForceClosing = false;

      // 触发重连
      if (!this.isManualDisconnect) {
        this.handleReconnect();
      }
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

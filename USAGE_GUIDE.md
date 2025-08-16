# WebSocket 断开事件处理使用指南

## 🚀 基本使用（无需特殊处理）

使用新版本的 OpenIM WebSocket，您**不需要特殊处理**断开重连，只需要正常监听事件即可：

```typescript
import { OpenIMWebSocket } from 'openim-websocket';

const ws = new OpenIMWebSocket({
  url: "ws://your-server-url",
  enableLogging: true,           // 建议开启，方便调试
  heartbeatInterval: 30000,      // 30秒心跳（可选，有默认值）
  heartbeatTimeout: 10000,       // 10秒超时（可选，有默认值）
  enableNetworkDetection: true,  // 网络检测（可选，默认开启）
  reconnectInterval: 3000,       // 重连间隔
  maxReconnectAttempts: 5,       // 最大重连次数
  headers: {
    // 您的认证头信息
  }
});
```

## 📱 事件监听完整示例

```typescript
// 1. 连接状态事件
ws.on("open", () => {
  console.log("✅ WebSocket 连接已打开");
  updateUI("connecting");
});

ws.on("connected", (data) => {
  console.log("✅ WebSocket 连接认证成功:", data);
  updateUI("connected");
  // 连接成功后的业务逻辑
  subscribeToTopics();
});

// 2. 断开事件（重点关注这些）
ws.on("close", (data) => {
  console.log("❌ WebSocket 连接已关闭:", data);
  updateUI("disconnected");
  
  // 🔍 这里会自动重连，您只需要更新UI状态
  showReconnectingMessage();
});

ws.on("error", (error) => {
  console.log("⚠️ WebSocket 连接错误:", error);
  updateUI("error");
  
  // 🔍 这里也会自动重连（如果不是认证错误）
  showErrorMessage("连接出现问题，正在重试...");
});

// 3. 特殊断开事件（不会自动重连）
ws.on("connect_error", (data) => {
  console.log("🚫 连接认证失败:", data);
  updateUI("auth_failed");
  
  // 🚨 认证失败不会重连，需要用户重新登录
  showAuthErrorMessage("认证失败，请重新登录");
  redirectToLogin();
});

ws.on("force_offline", (data) => {
  console.log("🚫 被强制下线:", data);
  updateUI("forced_offline");
  
  // 🚨 被强制下线不会重连
  showForceOfflineMessage("您的账号在其他地方登录");
  redirectToLogin();
});

// 4. 业务消息事件
ws.on("message", (data) => {
  console.log("📨 收到消息:", data);
  handleBusinessMessage(data);
});

ws.on("notification", (data) => {
  console.log("🔔 收到通知:", data);
  showNotification(data);
});

// 5. 心跳事件（可选监听，用于调试）
ws.on("ping", (data) => {
  console.log("💓 发送心跳:", data);
});

ws.on("pong", (data) => {
  console.log("💓 收到心跳响应:", data);
});
```

## 🎨 UI状态管理示例

```typescript
function updateUI(status) {
  const statusElement = document.getElementById('connection-status');
  const reconnectElement = document.getElementById('reconnect-info');
  
  switch(status) {
    case 'connecting':
      statusElement.textContent = '连接中...';
      statusElement.className = 'status connecting';
      break;
      
    case 'connected':
      statusElement.textContent = '已连接';
      statusElement.className = 'status connected';
      hideReconnectInfo();
      break;
      
    case 'disconnected':
      statusElement.textContent = '连接断开';
      statusElement.className = 'status disconnected';
      showReconnectInfo();
      break;
      
    case 'error':
      statusElement.textContent = '连接错误';
      statusElement.className = 'status error';
      break;
      
    case 'auth_failed':
      statusElement.textContent = '认证失败';
      statusElement.className = 'status auth-failed';
      break;
      
    case 'forced_offline':
      statusElement.textContent = '强制下线';
      statusElement.className = 'status forced-offline';
      break;
  }
}

function showReconnectInfo() {
  const info = document.getElementById('reconnect-info');
  info.style.display = 'block';
  
  // 显示重连进度
  const updateReconnectStatus = () => {
    const status = ws.getReconnectStatus();
    info.textContent = `正在重连... (${status.attempts}/${status.maxAttempts})`;
    
    if (status.attempts >= status.maxAttempts && !status.isReconnect) {
      info.textContent = '重连失败，请检查网络或刷新页面';
      info.innerHTML += '<button onclick="manualReconnect()">手动重连</button>';
    }
  };
  
  const timer = setInterval(() => {
    if (ws.isConnected && ws.isConnected()) {
      clearInterval(timer);
      hideReconnectInfo();
    } else {
      updateReconnectStatus();
    }
  }, 1000);
}

function hideReconnectInfo() {
  document.getElementById('reconnect-info').style.display = 'none';
}

function manualReconnect() {
  ws.resetReconnect();
  ws.connect().catch(error => {
    console.error('手动重连失败:', error);
  });
}
```

## 🌐 网络状态处理（浏览器环境）

```typescript
// 网络状态会自动处理，但您可以添加额外的UI反馈
if (typeof window !== "undefined") {
  window.addEventListener('offline', () => {
    console.log("📡 网络已断开");
    showNetworkOfflineMessage();
    updateNetworkStatus(false);
  });
  
  window.addEventListener('online', () => {
    console.log("📡 网络已恢复");
    hideNetworkOfflineMessage();
    updateNetworkStatus(true);
    // WebSocket 会自动尝试重连，无需手动处理
  });
}

function updateNetworkStatus(isOnline) {
  const indicator = document.getElementById('network-indicator');
  indicator.textContent = isOnline ? '在线' : '离线';
  indicator.className = isOnline ? 'online' : 'offline';
}
```

## 🔧 高级使用场景

### 1. 监控连接质量

```typescript
let connectionQuality = 'good';
let lastPingTime = 0;

ws.on("ping", () => {
  lastPingTime = Date.now();
});

ws.on("pong", () => {
  const latency = Date.now() - lastPingTime;
  
  if (latency < 1000) {
    connectionQuality = 'good';
  } else if (latency < 3000) {
    connectionQuality = 'fair';
  } else {
    connectionQuality = 'poor';
  }
  
  updateConnectionQuality(connectionQuality, latency);
});

function updateConnectionQuality(quality, latency) {
  const indicator = document.getElementById('quality-indicator');
  indicator.textContent = `连接质量: ${quality} (${latency}ms)`;
  indicator.className = `quality-${quality}`;
}
```

### 2. 保存和恢复未发送数据

```typescript
let pendingMessages = [];

// 发送消息时先保存
function sendMessage(message) {
  pendingMessages.push(message);
  
  try {
    ws.send(message);
    // 发送成功后移除
    pendingMessages = pendingMessages.filter(m => m !== message);
  } catch (error) {
    console.log('发送失败，消息已保存待重发');
  }
}

// 重连成功后重发未发送消息
ws.on("connected", () => {
  console.log(`重连成功，准备重发 ${pendingMessages.length} 条消息`);
  
  const messagesToResend = [...pendingMessages];
  pendingMessages = [];
  
  messagesToResend.forEach(message => {
    setTimeout(() => sendMessage(message), 100);
  });
});
```

## ⚡ 关键要点

1. **无需特殊处理**: 新版本会自动处理网络断开和重连
2. **只需监听事件**: 关注 `close`、`error`、`connect_error`、`force_offline` 事件
3. **UI状态更新**: 根据事件更新用户界面状态
4. **认证错误**: `connect_error` 和 `force_offline` 不会自动重连，需要特殊处理
5. **网络恢复**: 浏览器环境下网络恢复会自动重连
6. **心跳监控**: 心跳会自动检测连接状态，无需手动处理

## 🎯 推荐的最小代码

如果您只想要基本功能，这是最小的代码：

```typescript
const ws = new OpenIMWebSocket({
  url: "ws://your-server-url",
  enableLogging: true,
  headers: { /* 您的认证信息 */ }
});

// 连接成功
ws.on("connected", (data) => {
  console.log("连接成功");
  // 订阅主题或执行业务逻辑
});

// 连接断开（会自动重连）
ws.on("close", () => {
  console.log("连接断开，正在重连...");
});

// 认证失败（不会重连，需要重新登录）
ws.on("connect_error", () => {
  alert("认证失败，请重新登录");
});

// 接收消息
ws.on("message", (data) => {
  console.log("收到消息:", data);
});

// 开始连接
ws.connect();
```

这样就足够处理大部分场景了！🎉

# WebSocket 网络断开重连测试指南

## 问题描述

在实际使用中，当网络断开（如关闭无线网络）时，WebSocket连接可能无法立即检测到断开状态，导致重新联网后无法自动重连或收不到消息。

## 解决方案

我们的 OpenIM WebSocket 客户端现在包含了以下改进：

### 1. 心跳机制 (Heartbeat)
- **功能**: 定期发送心跳包检测连接状态
- **配置**: 
  - `heartbeatInterval`: 心跳间隔，默认 30 秒
  - `heartbeatTimeout`: 心跳超时时间，默认 10 秒
- **原理**: 如果心跳超时未收到响应，会强制关闭连接并触发重连

### 2. 网络状态检测 (Network Detection)
- **功能**: 监听浏览器网络状态变化事件
- **配置**: `enableNetworkDetection`: 是否启用，默认 true
- **原理**: 当网络恢复时自动尝试重连

### 3. 改进的重连机制
- **功能**: 更智能的重连逻辑
- **特性**: 
  - 网络恢复时重置重连计数
  - 支持强制关闭连接触发重连
  - 更好的重连状态管理

## 配置示例

```typescript
const ws = new OpenIMWebSocket({
  url: "ws://localhost:38081",
  enableLogging: true,
  heartbeatInterval: 30000, // 30秒心跳
  heartbeatTimeout: 10000,  // 10秒超时
  enableNetworkDetection: true, // 启用网络检测
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
  headers: {
    // 你的认证头信息
  }
});
```

## 测试步骤

### 浏览器环境测试

1. **启动示例**:
   ```bash
   cd examples/browser
   # 在浏览器中打开 index.html
   ```

2. **连接 WebSocket**:
   - 点击 "Connect" 按钮
   - 确认状态显示为 "Connected"

3. **测试网络断开**:
   - 断开网络连接（关闭WiFi或拔掉网线）
   - 观察控制台日志和状态变化
   - 网络状态应显示为离线

4. **测试网络恢复**:
   - 重新连接网络
   - 观察是否自动重连
   - 检查是否能正常收发消息

5. **测试心跳超时**:
   - 在网络连接状态下，通过网络工具阻断WebSocket数据包
   - 等待心跳超时（默认10秒）
   - 观察是否触发重连

### Node.js 环境测试

1. **启动示例**:
   ```bash
   cd examples/node
   npm run dev
   ```

2. **模拟网络问题**:
   - 使用防火墙或网络工具阻断连接
   - 观察重连行为

## 监听关键事件

```typescript
// 监听连接状态
ws.on("open", () => console.log("连接打开"));
ws.on("connected", () => console.log("连接认证成功"));
ws.on("close", () => console.log("连接关闭"));
ws.on("error", (error) => console.log("连接错误", error));

// 监听心跳（可选）
ws.on("ping", () => console.log("发送心跳"));
ws.on("pong", () => console.log("收到心跳响应"));

// 检查重连状态
const status = ws.getReconnectStatus();
console.log("重连状态:", status);
```

## 调试技巧

1. **启用日志**: 设置 `enableLogging: true`
2. **监控网络**: 使用浏览器开发者工具的网络面板
3. **检查状态**: 使用 `getReconnectStatus()` 方法
4. **手动重置**: 调用 `resetReconnect()` 重置重连状态

## 常见问题

### Q: 网络恢复后没有自动重连？
A: 检查是否启用了 `enableNetworkDetection`，且确保没有超过最大重连次数。

### Q: 心跳不工作？
A: 确保服务器支持 "ping"/"pong" 消息类型，或者服务器能正确响应心跳。

### Q: 重连次数用完了怎么办？
A: 调用 `resetReconnect()` 方法重置重连状态，然后手动调用 `connect()`。

## 服务器端要求

为了完整支持心跳机制，服务器端需要：

1. **响应心跳**: 收到 `type: "ping"` 消息时，返回 `type: "pong"` 消息
2. **保持连接**: 正确处理 WebSocket 的 ping/pong 帧
3. **错误处理**: 适当的错误响应机制

示例服务器响应：
```javascript
// 客户端发送
{ "type": "ping", "payload": { "timestamp": 1234567890 } }

// 服务器应该响应
{ "type": "pong", "payload": { "timestamp": 1234567890 } }
```

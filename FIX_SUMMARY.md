# WebSocket 网络断开重连问题修复

## 问题描述

用户反馈在实际使用中，当关闭无线网络导致网络断开时，WebSocket连接无法检测到断开状态，重新联网后也收不到消息。

## 问题原因分析

1. **缺乏主动连接检测**: 原实现只依赖WebSocket的 `close` 和 `error` 事件，但网络断开时这些事件可能不会立即触发
2. **没有网络状态监听**: 没有监听浏览器的网络状态变化事件
3. **重连时机不当**: 只在连接明确关闭时才尝试重连，无法处理"假死"连接

## 解决方案

### 1. 添加心跳机制

```typescript
interface WebSocketConfig {
  // 新增配置项
  heartbeatInterval?: number; // 心跳间隔，默认30秒
  heartbeatTimeout?: number;  // 心跳超时，默认10秒
}
```

**工作原理**:
- 连接建立后定期发送 `ping` 消息
- 如果在超时时间内未收到 `pong` 响应，强制关闭连接并触发重连
- 能够检测到"假死"连接并及时重连

### 2. 网络状态检测

```typescript
interface WebSocketConfig {
  enableNetworkDetection?: boolean; // 是否启用网络检测，默认true
}
```

**工作原理**:
- 监听浏览器的 `online` 和 `offline` 事件
- 网络恢复时自动重置重连状态并尝试连接
- 网络断开时停止心跳避免无效尝试

### 3. 改进重连逻辑

**改进点**:
- 网络恢复时重置重连计数，避免因之前的失败而无法重连
- 支持强制关闭连接来触发重连机制
- 更好的重连状态管理和日志记录

## 新增 API

### 配置选项
```typescript
const ws = new OpenIMWebSocket({
  url: "ws://example.com",
  heartbeatInterval: 30000,     // 心跳间隔
  heartbeatTimeout: 10000,      // 心跳超时
  enableNetworkDetection: true, // 网络检测
  // ... 其他配置
});
```

### 事件监听
```typescript
// 心跳事件（可选监听）
ws.on("ping", (data) => console.log("发送心跳"));
ws.on("pong", (data) => console.log("收到心跳响应"));
```

### 状态检查
```typescript
// 检查重连状态
const status = ws.getReconnectStatus();
console.log("重连状态:", status);

// 重置重连状态
ws.resetReconnect();
```

## 使用建议

### 1. 服务器端支持

为了完整支持心跳机制，建议服务器端：

```javascript
// 服务器收到心跳时应该响应
if (message.type === "ping") {
  // 返回 pong 消息
  client.send(JSON.stringify({
    type: "pong",
    payload: message.payload
  }));
}
```

### 2. 配置建议

```typescript
// 推荐配置
const config = {
  heartbeatInterval: 30000,     // 30秒心跳，不要太频繁
  heartbeatTimeout: 10000,      // 10秒超时，给网络一定容错时间
  reconnectInterval: 3000,      // 3秒重连间隔
  maxReconnectAttempts: 5,      // 最多5次重连
  enableNetworkDetection: true, // 启用网络检测
  enableLogging: true,          // 开发阶段启用日志
};
```

### 3. 测试方法

1. **网络断开测试**: 关闭WiFi/拔掉网线，观察重连行为
2. **心跳测试**: 使用网络工具阻断WebSocket数据包，观察心跳超时重连
3. **网络恢复测试**: 网络恢复后检查是否自动重连并能正常收发消息

## 向后兼容性

- 所有新配置项都是可选的，有合理的默认值
- 不会影响现有的API和使用方式
- 现有代码无需修改即可获得改进的重连能力

## 文件变更

- `src/index.ts`: 核心实现
- `examples/node/index.ts`: Node.js 示例更新
- `examples/browser/index.html`: 浏览器示例更新
- `NETWORK_TESTING.md`: 测试指南
- `dist/`: 构建输出（包含类型定义）

## 测试验证

✅ 构建通过  
✅ 类型定义正确  
✅ 示例代码更新  
✅ 向后兼容  

这次修复应该能够有效解决网络断开时WebSocket无法检测和重连的问题。

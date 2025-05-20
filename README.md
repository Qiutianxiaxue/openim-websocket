# OpenIM WebSocket Client

一个用于连接 OpenIM WebSocket 服务器的客户端库，支持浏览器和 Node.js 环境。

## 安装

```bash
npm install openim-websocket
```

## 使用方法

### 基本用法

```typescript
import { OpenIMWebSocket } from 'openim-websocket';

const client = new OpenIMWebSocket({
  url: 'ws://your-server-url',
  token: 'your-auth-token',
  reconnectInterval: 3000,
  maxReconnectAttempts: 5
});

// 连接服务器
await client.connect();

// 监听消息
client.on('message', (data) => {
  console.log('Received message:', data);
});

// 发送消息
client.send({
  type: 'message',
  data: {
    content: 'Hello, World!'
  }
});

// 断开连接
client.disconnect();
```

## 特性

- 支持自动重连
- 支持认证
- 支持消息类型处理
- 支持浏览器和 Node.js 环境
- TypeScript 支持

## 配置选项

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| url | string | - | WebSocket 服务器地址 |
| token | string | - | 认证令牌 |
| reconnectInterval | number | 3000 | 重连间隔（毫秒） |
| maxReconnectAttempts | number | 5 | 最大重连次数 |

## 许可证

MIT 
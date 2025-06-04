# OpenIM WebSocket Client

一个用于连接 OpenIM WebSocket 服务器的客户端库，支持浏览器和 Node.js 环境。

查看相关接口文档 [OpenIm API DOC](https://r4f4c7bpnx.apifox.cn/)

## 安装

```bash
npm install openim-websocket
```

## 使用方法

### 浏览器环境

```javascript
import { OpenIMWebSocket } from "openim-websocket";

const client = new OpenIMWebSocket({
  url: "ws://your-server:port",
  enableLogging: true, // 启用日志输出
  headers: {
    "client-type": "EnterpriseCenterWEB",
    Appid: "your-app-id",
    ClientId: "your-client-id",
    Timestamp: "timestamp",
    Authorization: "Bearer your-token",
  },
});
client.on("open", () => {
  console.log("Opened");
});
// 监听消息
client.on("message", (data) => {
  console.log("Received message:", data);
});

// 连接服务器
client
  .connect()
  .then(() => {
    console.log("Connected to server");

    // 订阅主题
    client.subscribe("test/#");

    // 发送消息
    client.send({
      type: "publish",
      topic: "test/444",
      payload: "Hello, World!",
    });
  })
  .catch((error) => {
    console.error("Connection failed:", error);
  });

// 取消订阅
client.unsubscribe("test/#");

// 断开连接
client.disconnect();
```

### Node.js 环境

```javascript
import { OpenIMWebSocket } from "openim-websocket";

const client = new OpenIMWebSocket({
  url: "ws://your-server:port",
  enableLogging: true, // 启用日志输出
  headers: {
    "client-type": "EnterpriseCenterWEB",
    Appid: "your-app-id",
    ClientId: "your-client-id",
    Timestamp: "timestamp",
    Authorization: "Bearer your-token",
  },
});

// 使用方式与浏览器环境相同
```

## 特性

- 支持自动重连
- 支持认证
- 支持消息类型处理
- 支持浏览器和 Node.js 环境
- TypeScript 支持
- 可配置的日志输出

## 配置选项

### WebSocketConfig

| 参数                 | 类型    | 必填 | 默认值 | 说明                            |
| -------------------- | ------- | ---- | ------ | ------------------------------- |
| url                  | string  | 是   | -      | WebSocket 服务器地址            |
| headers              | object  | 是   | -      | 请求头信息                      |
| reconnectInterval    | number  | 否   | 3000   | 重连间隔时间（毫秒）            |
| maxReconnectAttempts | number  | 否   | 5      | 最大重连次数                    |
| enableLogging        | boolean | 否   | false  | 是否启用日志输出                |

### Headers 配置

| 参数          | 类型   | 必填 | 说明                                    |
| ------------- | ------ | ---- | --------------------------------------- |
| client-type   | string | 是   | 客户端类型，例如：'EnterpriseCenterWEB' |
| Appid         | string | 是   | 应用 ID                                 |
| ClientId      | string | 是   | 客户端 ID                               |
| Timestamp     | string | 是   | 时间戳                                  |
| Authorization | string | 是   | 认证令牌，格式：'Bearer your-token'     |

## API

### 方法

| 方法名      | 参数                            | 返回值  | 说明                    |
| ----------- | ------------------------------- | ------- | ----------------------- |
| connect     | -                               | Promise | 连接到 WebSocket 服务器 |
| disconnect  | -                               | void    | 断开 WebSocket 连接     |
| send        | message: Message                | void    | 发送消息                |
| subscribe   | topic: string                   | void    | 订阅主题                |
| unsubscribe | topic: string                   | void    | 取消订阅主题            |
| on          | type: string, handler: Function | void    | 注册消息处理器          |

### Message 类型

```typescript
interface Message {
  type: string; // 消息类型
  message?: string; // 消息内容
  topic?: string; // 主题
  payload?: any; // 消息载荷
}
```

## 事件

| 事件名  | 说明                       |
| ------- | -------------------------- |
| message | 收到消息时触发             |
| service | 收到数据查询结果回推时触发 |
| error   | 发生错误时触发             |
| close   | 连接关闭时触发             |

## 日志功能

当设置 `enableLogging: true` 时，库会输出详细的调试信息，包括：

- 连接状态变化
- 消息收发记录
- 错误信息
- 重连尝试信息

这有助于开发和调试阶段了解 WebSocket 连接的详细状态。生产环境建议设置为 `false`（默认值）。

## 注意事项

1. 确保服务器地址（url）正确且可访问
2. 所有必需的 headers 参数都需要正确设置
3. 在浏览器环境中，确保服务器支持 WebSocket 连接
4. 在 Node.js 环境中，需要安装 `ws` 包

## 示例

查看 `examples` 目录获取更多使用示例：

- `examples/browser`: 浏览器环境示例
- `examples/node`: Node.js 环境示例

## 许可证

MIT

import { OpenIMWebSocket } from "../../src/index.js";

// 创建 WebSocket 客户端实例
const ws = new OpenIMWebSocket({
  url: "ws://localhost:38081",
  enableLogging: true,
  headers: {
    "client-type": "EnterpriseCenterNode",
    Appid: "1001",
    ClientId: "100111211",
    Timestamp: Date.now().toString(),
    Authorization: "Bearer QC2b8fd0ca342c72f857f5f96",
  },
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
});

// 监听各种事件
ws.on("open", () => {
  console.log("Connection opened");
});

ws.on("connected", (data) => {
  console.log("Connection authenticated:", data);

  // 连接成功后订阅主题
  ws.subscribe("test-topic", function (data) {
    console.log("Received data on test-topic:", data);
  });

  // 发送测试消息
  setTimeout(() => {
    ws.send({
      type: "message",
      message: "Hello from Node.js!",
      payload: { timestamp: Date.now() },
    });
  }, 1000);
});

ws.on("close", () => {
  console.log("Connection closed");
});

ws.on("error", (error) => {
  console.log("Connection error:", error);
});

ws.on("connect_error", (data) => {
  console.log("Connect error:", data);
});

ws.on("force_offline", (data) => {
  console.log("Force offline:", data);
});

ws.on("message", (data) => {
  console.log("Received message:", data);
});

ws.on("notification", (data) => {
  console.log("Received notification:", data);
});

// 连接到 WebSocket
ws.connect()
  .then(() => {
    console.log("WebSocket connection initiated");
  })
  .catch((error) => {
    console.error("Failed to connect:", error);
  });

// 优雅关闭
process.on("SIGINT", () => {
  console.log("Disconnecting...");
  ws.disconnect();
  process.exit(0);
});

import { OpenIMWebSocket } from "../../src/index.js";

// 创建 WebSocket 客户端实例
const ws = new OpenIMWebSocket({
  url: "ws://localhost:38081",
  headers: {
    "client-type": "EnterpriseCenterWEB",
    Appid: "1001",
    ClientId: "1001112",
    Timestamp: "1739166426",
    Authorization: "Bearer QC5586bdd29fbc86b3a39df6b",
  },
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
});

// 监听消息
ws.on("message", (data) => {
  console.log("Received message:", data);
});

// 监听错误
ws.on("error", (error) => {
  console.error("WebSocket error:", error);
});
// 监听错误
ws.on("connected", () => {
  console.log("WebSocket connected");
});

// 监听关闭
ws.on("close", () => {
  console.log("WebSocket closed");
});

// 连接服务器
async function start() {
  try {
    await ws.connect();
    console.log("Connected to WebSocket server");

    // 添加订阅
    setTimeout(() => {
      ws.subscribe("test/#");
      // 发送测试消息
      ws.send({
        type: "publish",
        topic: "test/444",
        message: "Hello WebSocket Server",
      });
    }, 1000);
  } catch (error) {
    console.error("Failed to connect:", error);
  }
}

// 处理进程退出
process.on("SIGINT", () => {
  console.log("正在断开连接...");
  ws.disconnect();
  process.exit(0);
});

start();

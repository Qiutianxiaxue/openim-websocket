import { OpenIMWebSocket } from '../../src/index';

// 创建 WebSocket 客户端实例
const client = new OpenIMWebSocket({
    url: 'ws://localhost:8080',
    token: 'your-auth-token',
    reconnectInterval: 3000,
    maxReconnectAttempts: 5
});

// 监听消息
client.on('message', (data) => {
    console.log('收到消息:', data);
});

// 监听认证结果
client.on('auth', (data) => {
    console.log('认证结果:', data);
});

// 连接服务器
async function start() {
    try {
        await client.connect();
        console.log('已连接到服务器');

        // 发送测试消息
        client.send({
            type: 'message',
            data: {
                content: 'Hello from Node.js!',
                timestamp: new Date().toISOString()
            }
        });

        // 模拟定期发送消息
        setInterval(() => {
            client.send({
                type: 'heartbeat',
                data: {
                    timestamp: new Date().toISOString()
                }
            });
        }, 30000);

    } catch (error) {
        console.error('连接失败:', error);
    }
}

// 处理进程退出
process.on('SIGINT', () => {
    console.log('正在断开连接...');
    client.disconnect();
    process.exit(0);
});

start(); 
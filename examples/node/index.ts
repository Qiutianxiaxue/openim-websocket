import { OpenIMWebSocket } from '../../src/index';

// 创建 WebSocket 客户端实例
const client = new OpenIMWebSocket({
    url: 'ws://localhost:8081',
    headers: {
        'client-type': 'EnterpriseCenterWEB',
        Appid: '1001',
        ClientId: '10012',
        Timestamp: '1739166426',
        Authorization: 'Bearer QC0bb5fa88eba0f98635389a7'
    },
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
            type: 'test',
            message: 'Hello WebSocket Server'
        });

        // 添加订阅
        setTimeout(() => {
            client.subscribe('test/#');
        }, 1000);

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
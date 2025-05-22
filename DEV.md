# OpenIM WebSocket Client 开发手册

## 项目结构

```
openim-websocket/
├── src/                    # 源代码目录
│   └── index.ts           # 主要实现文件
├── examples/              # 示例代码
│   ├── browser/          # 浏览器环境示例
│   └── node/             # Node.js 环境示例
├── dist/                  # 构建输出目录
├── package.json          # 项目配置
├── tsconfig.json         # TypeScript 配置
├── vite.config.ts        # Vite 构建配置
└── README.md             # 项目文档
```

## 开发环境设置

1. **安装依赖**

```bash
# 使用 pnpm
pnpm install

# 或使用 npm
npm install
```

2. **开发模式**

```bash
# 启动开发服务器
pnpm dev

# 编译代码
pnpm build

# 运行浏览器示例
pnpm example:browser

# 运行 Node.js 示例
pnpm example:node
```

3. **构建**

```bash
# 构建项目
pnpm build
```

## 开发指南

### 1. 代码规范

- 使用 TypeScript 进行开发
- 遵循 ESLint 规则
- 使用 Prettier 进行代码格式化
- 所有公共 API 必须有类型定义
- 所有公共方法必须有 JSDoc 注释

### 2. 项目结构说明

#### src/index.ts

主要的实现文件，包含：

- WebSocket 客户端类
- 类型定义
- 工具函数

#### examples/

示例代码目录：

- `browser/`: 浏览器环境示例
- `node/`: Node.js 环境示例

### 3. 开发流程

1. **创建新功能**

   - 在 `src/index.ts` 中添加新的方法
   - 添加相应的类型定义
   - 添加 JSDoc 注释
   - 在 `examples/` 中添加使用示例

2. **添加测试**

   - 在 `examples/` 中添加测试用例
   - 确保新功能在浏览器和 Node.js 环境都能正常工作

3. **更新文档**
   - 更新 README.md
   - 更新 API 文档
   - 添加使用示例

### 4. 发布流程

1. **自动发布（推荐）**

```bash
# 自动更新小版本号并发布
pnpm release
```

这个命令会：

- 自动更新小版本号（patch）
- 构建项目
- 发布到 npm

2. **手动发布**
   如果需要手动控制版本号：

```bash
# 更新版本号
npm version patch  # 小版本更新
npm version minor  # 中版本更新
npm version major  # 大版本更新

# 构建
pnpm build

# 发布
npm publish
```

注意：

- 使用 `pnpm release` 会自动更新小版本号
- 如果需要更新中版本或大版本，请使用手动发布方式
- 发布前请确保所有测试通过
- 发布前请确保文档已更新

## 贡献指南

### 1. 提交 Pull Request

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

### 2. 代码审查

- 确保代码符合项目规范
- 确保所有测试通过
- 确保文档已更新
- 确保示例代码可以正常运行

### 3. 提交规范

提交信息格式：

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型（type）：

- feat: 新功能
- fix: 修复
- docs: 文档
- style: 格式
- refactor: 重构
- test: 测试
- chore: 构建过程或辅助工具的变动

### 4. 开发注意事项

1. **WebSocket 实现**

   - 浏览器环境使用原生 WebSocket
   - Node.js 环境使用 ws 包
   - 确保两种环境的 API 保持一致

2. **错误处理**

   - 所有异步操作都需要适当的错误处理
   - 提供有意义的错误信息
   - 实现自动重连机制

3. **性能考虑**

   - 避免内存泄漏
   - 及时清理定时器
   - 优化消息处理逻辑

4. **安全性**
   - 正确处理认证信息
   - 避免敏感信息泄露
   - 实现适当的安全措施

## 常见问题

### 1. 开发环境问题

Q: 如何调试 WebSocket 连接？
A: 使用浏览器开发者工具的 Network 面板，或使用 WebSocket 调试工具。

Q: 如何处理跨域问题？
A: 确保服务器配置了正确的 CORS 头，或使用代理服务器。

### 2. 构建问题

Q: 构建失败怎么办？
A: 检查 TypeScript 配置和依赖版本，确保所有依赖都正确安装。

Q: 如何处理类型错误？
A: 检查类型定义，确保所有公共 API 都有正确的类型声明。

## 维护指南

### 1. 依赖更新

定期更新依赖：

```bash
pnpm update
```

### 2. 版本管理

遵循语义化版本：

- 主版本号：不兼容的 API 修改
- 次版本号：向下兼容的功能性新增
- 修订号：向下兼容的问题修正

### 3. 文档维护

- 保持 README.md 和 DEV.md 的更新
- 及时更新 API 文档
- 维护示例代码

## 联系方式

如有问题，请通过以下方式联系：

- 提交 Issue
- 发送邮件
- 提交 Pull Request

## 许可证

MIT

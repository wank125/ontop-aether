# 天织语义平台

## 项目概述

天织语义平台是一个虚拟知识图谱管理系统，支持将关系型数据库映射为 RDF 知识图谱，并通过 SPARQL 进行语义查询。

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **主题**: 深色主题 + 紫蓝渐变

## 目录结构

```
├── public/                 # 静态资源
├── scripts/                # 构建与启动脚本
├── src/
│   ├── app/                # 页面路由与布局
│   │   ├── datasource/     # 数据源管理页面
│   │   ├── sparql/         # SPARQL 查询页面
│   │   ├── mapping/        # 映射编辑页面
│   │   ├── ai-assistant/   # AI 助手页面
│   │   └── ontology/       # 本体可视化页面
│   ├── components/         # 自定义组件
│   │   ├── ui/             # Shadcn UI 组件库
│   │   ├── sidebar-nav.tsx # 侧边栏导航
│   │   └── app-layout.tsx  # 应用布局
│   ├── hooks/              # 自定义 Hooks
│   └── lib/                # 工具库
├── next.config.ts          # Next.js 配置
├── package.json            # 项目依赖管理
└── tsconfig.json           # TypeScript 配置
```

## 功能模块

### 1. 数据源管理 (`/datasource`)
- 管理数据库连接配置
- 支持多种数据库类型（PostgreSQL, MySQL, Oracle, SQL Server）
- 测试连接、同步结构、编辑删除

### 2. SPARQL 查询 (`/sparql`)
- SPARQL 查询编辑器
- 执行查询并展示结果
- 查看重写后的 SQL
- 历史查询记录

### 3. 映射编辑 (`/mapping`)
- 管理 OBDA 映射规则
- Prefixes 声明管理
- 映射验证与端点重启

### 4. AI 助手 (`/ai-assistant`)
- 自然语言查询数据库
- 展示 SPARQL 生成、SQL 重写、查询结果的完整流程
- 快捷问题按钮

### 5. 本体可视化 (`/ontology`)
- 可视化 RDF 本体结构
- 节点拖拽交互
- 缩放、适应、重置功能
- 节点详情查看

## 包管理规范

**仅允许使用 pnpm** 作为包管理器。

常用命令：
- 安装依赖：`pnpm install`
- 开发：`pnpm dev`
- 构建：`pnpm build`
- 类型检查：`pnpm ts-check`
- 代码检查：`pnpm lint`

## 设计规范

### 主题色
- 主色：紫蓝渐变 `from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]`
- 强调色：青色 `oklch(0.55_0.18_200)`
- 背景：深色 `oklch(0.12 0.01 270)`

### 组件规范
- 使用 shadcn/ui 组件库
- 侧边栏固定导航（宽度 256px）
- 页面头部包含图标、标题、描述
- 卡片式布局，圆角 0.75rem

## 开发规范

- **Hydration 错误预防**：使用 'use client' 并配合 useEffect + useState
- **客户端组件**：所有使用状态和交互的组件需要 'use client' 指令
- **类型安全**：所有组件和函数都需要正确的类型标注

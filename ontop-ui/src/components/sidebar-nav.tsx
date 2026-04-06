'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Database,
  Code2,
  FileCode,
  Bot,
  GitGraph,
  Settings,
  Zap,
  Cog,
  Table,
  Share2,
  Tags,
  BookMarked,
  Wand2,
} from 'lucide-react';

const navItems = [
  { title: '数据源管理',   href: '/datasource',   icon: Database,    description: '管理数据库连接' },
  { title: '数据库概览',   href: '/db-schema',     icon: Table,       description: '浏览表结构' },
  { title: 'SPARQL 查询', href: '/sparql',       icon: Code2,       description: '执行语义查询' },
  { title: '映射编辑',     href: '/mapping',       icon: FileCode,    description: '编辑 OBDA 映射' },
  { title: 'AI 助手',      href: '/ai-assistant',  icon: Bot,         description: '自然语言查询' },
  { title: '本体可视化',  href: '/ontology',      icon: GitGraph,    description: '可视化数据模型' },
  { title: '语义标注',     href: '/annotations',   icon: Tags,        description: '审核 LLM 语义标注' },
  { title: '业务词汇',     href: '/glossary',      icon: BookMarked,  description: '词汇表注入 AI 提示词' },
  { title: '本体精化',     href: '/refinement',    icon: Wand2,       description: 'AI 精化建议并自动应用' },
  { title: 'AI 设置',      href: '/settings',      icon: Settings,    description: '模型与提示词配置' },
  { title: '数据发布',     href: '/publishing',    icon: Share2,      description: 'API/MCP/插件配置' },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar)]">
      {/* Logo 区域 */}
      <Link
        href="/"
        className="flex h-16 items-center gap-3 border-b border-[var(--sidebar-border)] px-5 transition-colors hover:bg-[var(--sidebar-accent)]"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-[var(--sidebar-foreground)]">天织</h1>
          <p className="text-xs text-[var(--muted-foreground)]">语义平台</p>
        </div>
      </Link>

      {/* 导航菜单 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-[var(--sidebar-accent)] text-[var(--sidebar-accent-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]'
                )}
              >
                <item.icon
                  className={cn(
                    'h-5 w-5 transition-colors',
                    isActive
                      ? 'text-[var(--sidebar-primary)]'
                      : 'text-[var(--muted-foreground)] group-hover:text-[var(--sidebar-foreground)]'
                  )}
                />
                <div className="flex-1">
                  <div>{item.title}</div>
                  <div className="text-xs text-[var(--muted-foreground)] opacity-70">
                    {item.description}
                  </div>
                </div>
                {isActive && (
                  <div className="h-5 w-0.5 rounded-full bg-gradient-to-b from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* 系统设置按钮 */}
      <div className="border-t border-[var(--sidebar-border)] p-3">
        <Link
          href="/system"
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
            pathname === '/system'
              ? 'bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)]'
              : 'text-[var(--muted-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-foreground)]'
          )}
        >
          <Cog className="h-4 w-4" />
          <span>系统设置</span>
        </Link>
      </div>
    </aside>
  );
}

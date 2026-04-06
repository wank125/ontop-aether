'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  ChevronDown,
  LogOut,
  Settings,
  User,
  HelpCircle,
  Server,
  Activity,
  CircleCheck,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sparql, mappings, endpointRegistry, type EndpointRegistration } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface EndpointState {
  status: 'running' | 'stopped' | 'error';
  port: number;
  dsId: string;
  dsName: string;
}

export function TopBar() {
  const { user, logout } = useAuth();
  const [endpoint, setEndpoint] = useState<EndpointState>({
    status: 'stopped',
    port: 8080,
    dsId: '',
    dsName: '',
  });
  const [restarting, setRestarting] = useState(false);
  const [endpoints, setEndpoints] = useState<EndpointRegistration[]>([]);
  const [switching, setSwitching] = useState(false);

  const checkStatus = async () => {
    try {
      const res = await sparql.endpointStatus();
      setEndpoint({
        status: res.running ? 'running' : 'stopped',
        port: res.port,
        dsId: res.ds_id || '',
        dsName: res.ds_name || '',
      });
    } catch {
      setEndpoint({ status: 'error', port: 8080, dsId: '', dsName: '' });
    }
  };

  const loadEndpoints = async () => {
    try {
      const list = await endpointRegistry.list();
      setEndpoints(list);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    checkStatus();
    loadEndpoints();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await mappings.restartEndpoint();
      await checkStatus();
    } catch { /* ignore */ }
    setRestarting(false);
  };

  const handleSwitch = async (dsId: string) => {
    if (dsId === endpoint.dsId || switching) return;
    setSwitching(true);
    try {
      await endpointRegistry.activate(dsId);
      await new Promise(r => setTimeout(r, 8000));
      await Promise.all([checkStatus(), loadEndpoints()]);
    } catch { /* ignore */ }
    setSwitching(false);
  };

  const statusColor =
    endpoint.status === 'running'
      ? 'text-emerald-500'
      : endpoint.status === 'error'
        ? 'text-red-500'
        : 'text-amber-500';

  const statusLabel =
    endpoint.status === 'running'
      ? '运行中'
      : endpoint.status === 'error'
        ? '异常'
        : '已停止';

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-end border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        {/* 端点状态 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 gap-2 px-2">
              <div className="relative">
                <Server className={cn('h-4 w-4', statusColor)} />
                {endpoint.status === 'running' && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                )}
              </div>
              <span className={cn('hidden text-xs sm:inline', statusColor)}>
                {endpoint.dsName || 'Ontop'} :{endpoint.port} · {statusLabel}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex items-center gap-2">
                <Server className={cn('h-4 w-4', statusColor)} />
                <span className="text-sm font-medium">语义端点</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">状态</span>
                <span className={cn('font-medium', statusColor)}>{statusLabel}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">端口</span>
                <span className="font-medium">{endpoint.port}</span>
              </div>
              {endpoint.dsName && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">数据源</span>
                  <span className="font-medium text-xs">{endpoint.dsName}</span>
                </div>
              )}
            </div>
            <DropdownMenuSeparator />
            <div className="flex gap-2 p-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 text-xs h-8"
                onClick={handleRestart}
                disabled={restarting}
              >
                {restarting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CircleCheck className="h-3 w-3" />
                )}
                {restarting ? '重启中...' : '重启'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 gap-1.5 text-xs h-8"
                onClick={checkStatus}
              >
                <Activity className="h-3 w-3" />
                检测
              </Button>
            </div>

            {endpoints.length > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
                  切换数据源
                </DropdownMenuLabel>
                <div className="max-h-48 overflow-y-auto">
                  {endpoints.map((ep) => {
                    const isCurrent = ep.ds_id === endpoint.dsId;
                    return (
                      <DropdownMenuItem
                        key={ep.ds_id}
                        className="flex items-center justify-between gap-2 py-2"
                        disabled={isCurrent || switching}
                        onClick={() => handleSwitch(ep.ds_id)}
                      >
                        <span className="truncate text-sm">{ep.ds_name}</span>
                        {isCurrent ? (
                          <Badge variant="secondary" className="shrink-0 text-[10px] h-5">
                            当前
                          </Badge>
                        ) : switching ? (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                        ) : null}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 分隔线 */}
        <div className="mx-1 h-6 w-px bg-border" />

        {/* 通知按钮 */}
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
        </Button>

        {/* 帮助按钮 */}
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <HelpCircle className="h-4 w-4" />
        </Button>

        {/* 分隔线 */}
        <div className="mx-2 h-6 w-px bg-border" />

        {/* 用户下拉菜单 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-9 gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user?.email ? undefined : undefined} alt={user?.display_name || ''} />
                <AvatarFallback className="bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] text-xs text-white">
                  {getInitials(user?.display_name || user?.username || 'U')}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col items-start text-left md:flex">
                <span className="text-sm font-medium">{user?.display_name || user?.username || ''}</span>
                <span className="text-xs text-muted-foreground">{user?.role === 'admin' ? '管理员' : user?.role || ''}</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user?.display_name || user?.username || ''}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email || ''}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/system">
                <User className="mr-2 h-4 w-4" />
                个人资料
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/system">
                <Settings className="mr-2 h-4 w-4" />
                系统设置
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={logout}>
              <LogOut className="mr-2 h-4 w-4" />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

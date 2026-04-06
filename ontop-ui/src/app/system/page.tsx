'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  User,
  Server,
  Activity,
  Globe,
  Terminal,
  Cpu,
  Database,
  Heart,
  Shield,
  Mail,
  Clock,
} from 'lucide-react';

interface SystemConfig {
  ontop_cli: string;
  ontop_endpoint_url: string;
  llm_base_url: string;
  llm_model: string;
}

interface EndpointStatus {
  running: boolean;
  port: number;
}

function OverviewCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Shield;
}) {
  return (
    <Card className="border-border/70 bg-card/70">
      <CardContent className="flex items-start justify-between p-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
          <p className="text-lg font-semibold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemSettingsPage() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [endpointStatus, setEndpointStatus] = useState<EndpointStatus | null>(null);
  const [healthStatus, setHealthStatus] = useState<string>('unknown');
  const [loading, setLoading] = useState(true);

  const user = {
    name: '张三',
    email: 'zhangsan@example.com',
    role: '管理员',
    avatar: undefined,
  };

  useEffect(() => {
    async function fetchSystemInfo() {
      try {
        const [configRes, statusRes, healthRes] = await Promise.allSettled([
          fetch('/api/v1/config'),
          fetch('/api/v1/sparql/endpoint-status'),
          fetch('/api/v1/health'),
        ]);

        if (configRes.status === 'fulfilled' && configRes.value.ok) {
          setConfig(await configRes.value.json());
        }
        if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
          setEndpointStatus(await statusRes.value.json());
        }
        if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
          const data = await healthRes.value.json();
          setHealthStatus(data.status === 'ok' ? 'healthy' : 'unhealthy');
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSystemInfo();
  }, []);

  const configItems = config
    ? [
        {
          icon: Terminal,
          label: 'Ontop CLI',
          value: config.ontop_cli,
          type: 'path' as const,
        },
        {
          icon: Globe,
          label: 'Ontop 端点地址',
          value: config.ontop_endpoint_url,
          type: 'url' as const,
        },
        {
          icon: Globe,
          label: 'LLM API 地址',
          value: config.llm_base_url,
          type: 'url' as const,
        },
        {
          icon: Cpu,
          label: 'LLM 模型',
          value: config.llm_model,
          type: 'text' as const,
        },
      ]
    : [];

  const endpointLabel = endpointStatus?.running ? `运行中 :${endpointStatus.port}` : '已停止';
  const healthLabel =
    healthStatus === 'healthy' ? '健康' : healthStatus === 'unhealthy' ? '异常' : '未知';
  const userModeLabel = '本地访问';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] shadow-sm">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">系统设置</h1>
            <p className="text-sm text-muted-foreground">统一查看当前用户、服务状态和运行配置。</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard title="当前用户" value={user.name} hint={user.role} icon={User} />
        <OverviewCard title="认证方式" value={userModeLabel} hint="当前为本地演示访问" icon={Shield} />
        <OverviewCard title="后端状态" value={healthLabel} hint={loading ? '读取中' : '健康检查结果'} icon={Heart} />
        <OverviewCard title="语义端点" value={endpointLabel} hint={loading ? '读取中' : 'Ontop 运行状态'} icon={Database} />
      </div>

      <Tabs defaultValue="user" className="w-full">
        <TabsList className="mb-2 h-auto flex-wrap justify-start gap-2 rounded-xl border border-border/70 bg-card/60 p-1">
          <TabsTrigger value="user" className="gap-2">
            <User className="h-4 w-4" />
            用户信息
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Server className="h-4 w-4" />
            系统配置
          </TabsTrigger>
        </TabsList>

        {/* 用户信息 Tab */}
        <TabsContent value="user" className="space-y-4">
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">个人资料</CardTitle>
              <CardDescription>当前登录用户的基本信息</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-6">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] text-xl text-white">
                    {user.name[0]}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-3.5 w-3.5" />
                        用户名
                      </div>
                      <p className="text-sm font-medium">{user.name}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        邮箱
                      </div>
                      <p className="text-sm font-medium">{user.email}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Shield className="h-3.5 w-3.5" />
                        角色
                      </div>
                      <Badge variant="secondary" className="mt-0.5">
                        {user.role}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        认证方式
                      </div>
                      <p className="text-sm font-medium">本地访问（无需登录）</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 系统配置 Tab */}
        <TabsContent value="system" className="space-y-4">
          {/* 服务状态 */}
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">访问说明</CardTitle>
              <CardDescription>这一页主要用于说明当前环境的用户形态。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">用户来源</p>
                <p className="mt-2 text-sm font-medium text-foreground">本地 Mock 用户</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">权限模式</p>
                <p className="mt-2 text-sm font-medium text-foreground">管理员视角</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">当前状态</p>
                <p className="mt-2 text-sm font-medium text-foreground">适合演示与界面联调</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 系统配置 Tab */}
        <TabsContent value="system" className="space-y-4">
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">服务状态</CardTitle>
              <CardDescription>后端服务与端点运行状态</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4 animate-pulse" />
                  加载中...
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        healthStatus === 'healthy'
                          ? 'bg-emerald-500/10'
                          : healthStatus === 'unhealthy'
                            ? 'bg-red-500/10'
                            : 'bg-amber-500/10'
                      }`}
                    >
                      <Heart
                        className={`h-5 w-5 ${
                          healthStatus === 'healthy'
                            ? 'text-emerald-500'
                            : healthStatus === 'unhealthy'
                              ? 'text-red-500'
                              : 'text-amber-500'
                        }`}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">后端 API</p>
                      <Badge
                        variant={
                          healthStatus === 'healthy'
                            ? 'default'
                            : 'secondary'
                        }
                        className={`mt-0.5 ${
                          healthStatus === 'healthy'
                            ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10'
                            : ''
                        }`}
                      >
                        {healthStatus === 'healthy'
                          ? '正常运行'
                          : healthStatus === 'unhealthy'
                            ? '异常'
                            : '未知'}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        endpointStatus?.running
                          ? 'bg-emerald-500/10'
                          : 'bg-amber-500/10'
                      }`}
                    >
                      <Database
                        className={`h-5 w-5 ${
                          endpointStatus?.running
                            ? 'text-emerald-500'
                            : 'text-amber-500'
                        }`}
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Ontop 语义端点</p>
                      <Badge
                        variant={
                          endpointStatus?.running ? 'default' : 'secondary'
                        }
                        className={`mt-0.5 ${
                          endpointStatus?.running
                            ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10'
                            : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/10'
                        }`}
                      >
                        {endpointStatus?.running
                          ? `运行中 :${endpointStatus.port}`
                          : '已停止'}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 系统配置详情 */}
          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">运行配置</CardTitle>
              <CardDescription>后端服务配置参数（只读）</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4 animate-pulse" />
                  加载中...
                </div>
              ) : config ? (
                <div className="space-y-3">
                  {configItems.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-4"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-background/80">
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="truncate text-sm font-medium font-mono">
                          {item.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  无法加载系统配置
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-base">配置说明</CardTitle>
              <CardDescription>这些参数用于帮助排查运行环境，不在这里编辑。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">配置用途</p>
                <p className="mt-2 text-sm font-medium text-foreground">只读展示</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">适用场景</p>
                <p className="mt-2 text-sm font-medium text-foreground">联调、排障、部署核对</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">建议</p>
                <p className="mt-2 text-sm font-medium text-foreground">真正的配置修改仍应回到专门工作页</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

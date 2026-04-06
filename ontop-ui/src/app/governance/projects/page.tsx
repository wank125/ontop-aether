'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FolderKanban, Plus, Server, Users, Loader2, ChevronRight } from 'lucide-react';
import { governance } from '@/lib/api';

interface Project {
  id: string;
  code: string;
  name: string;
  description: string;
  status: string;
  owner_user_id: string;
  created_at: string;
}

interface Environment {
  id: string;
  name: string;
  display_name: string;
  endpoint_url: string;
  active_registry_id: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const data = await governance.projects.list();
      setProjects(data);
      if (data.length > 0 && !selectedProject) {
        selectProject(data[0]);
      }
    } catch {
      toast.error('加载项目失败');
    } finally {
      setLoading(false);
    }
  }

  async function selectProject(p: Project) {
    setSelectedProject(p);
    try {
      const envs = await governance.projects.environments(p.id);
      setEnvironments(envs);
    } catch {
      setEnvironments([]);
    }
  }

  async function handleCreate() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('请填写项目代码和名称');
      return;
    }
    setCreating(true);
    try {
      await governance.projects.create(form);
      toast.success('项目创建成功');
      setCreateOpen(false);
      setForm({ code: '', name: '', description: '' });
      loadProjects();
    } catch (err: any) {
      toast.error(err.message || '创建失败');
    } finally {
      setCreating(false);
    }
  }

  const envColors: Record<string, string> = {
    dev: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    test: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    prod: 'bg-red-500/10 text-red-500 border-red-500/20',
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">项目管理</h1>
          <p className="text-sm text-muted-foreground">管理项目、环境和成员</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              创建项目
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>创建项目</DialogTitle>
              <DialogDescription>新建一个语义资产管理项目</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>项目代码</Label>
                <Input
                  placeholder="my-project"
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>项目名称</Label>
                <Input
                  placeholder="我的项目"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Input
                  placeholder="可选"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        {/* 项目列表 */}
        <div className="space-y-2">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => selectProject(p)}
              className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                selectedProject?.id === p.id
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-border/60 hover:border-border hover:bg-muted/30'
              }`}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <FolderKanban className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.code}</p>
              </div>
              <Badge variant={p.status === 'active' ? 'secondary' : 'outline'} className="text-xs">
                {p.status === 'active' ? '活跃' : '归档'}
              </Badge>
            </button>
          ))}
        </div>

        {/* 项目详情 */}
        {selectedProject && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5 text-primary" />
                  {selectedProject.name}
                </CardTitle>
                <CardDescription>{selectedProject.description || '无描述'}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">代码</p>
                    <p className="text-sm font-medium">{selectedProject.code}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">状态</p>
                    <Badge variant="secondary">{selectedProject.status}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">创建时间</p>
                    <p className="text-sm">{new Date(selectedProject.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 环境卡片 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Server className="h-4 w-4" />
                  环境
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  {environments.map((env) => (
                    <div
                      key={env.id}
                      className={`rounded-xl border p-4 ${envColors[env.name] || 'border-border/60'}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{env.display_name}</p>
                        <Badge variant="outline" className="text-xs">
                          {env.name}
                        </Badge>
                      </div>
                      {env.endpoint_url && (
                        <p className="mt-2 truncate text-xs text-muted-foreground">
                          {env.endpoint_url}
                        </p>
                      )}
                      {env.active_registry_id && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          已激活端点
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

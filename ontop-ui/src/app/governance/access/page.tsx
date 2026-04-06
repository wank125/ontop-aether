'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShieldCheck,
  Plus,
  KeyRound,
  Loader2,
  Copy,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { governance } from '@/lib/api';

interface RoleBinding {
  id: string;
  user_id: string;
  role_code: string;
  role_name: string;
  username: string;
  display_name: string;
  project_id: string;
}

interface ApiKey {
  id: string;
  name: string;
  type: string;
  key_prefix: string;
  status: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface Role {
  id: string;
  code: string;
  name: string;
  scope_type: string;
}

export default function AccessPage() {
  const [bindings, setBindings] = useState<RoleBinding[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Create binding form
  const [bindOpen, setBindOpen] = useState(false);
  const [bindForm, setBindForm] = useState({ user_id: '', role_code: '' });
  const [binding, setBinding] = useState(false);

  // Create API key form
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyForm, setKeyForm] = useState({ name: '', type: 'human', expires_at: '' });
  const [creating, setCreating] = useState(false);
  const [newKeySecret, setNewKeySecret] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [b, r, k] = await Promise.all([
        governance.roleBindings.list(),
        governance.roles.list(),
        governance.apiKeys.list(),
      ]);
      setBindings(b);
      setRoles(r);
      setApiKeys(k);
    } catch {
      toast.error('加载访问控制数据失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBinding() {
    if (!bindForm.user_id.trim() || !bindForm.role_code) {
      toast.error('请填写用户ID和角色');
      return;
    }
    setBinding(true);
    try {
      await governance.roleBindings.create(bindForm);
      toast.success('角色绑定成功');
      setBindOpen(false);
      setBindForm({ user_id: '', role_code: '' });
      loadData();
    } catch (err: any) {
      toast.error(err.message || '绑定失败');
    } finally {
      setBinding(false);
    }
  }

  async function handleDeleteBinding(id: string) {
    try {
      await governance.roleBindings.delete(id);
      toast.success('已删除绑定');
      loadData();
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  }

  async function handleCreateKey() {
    if (!keyForm.name.trim()) {
      toast.error('请填写 Key 名称');
      return;
    }
    setCreating(true);
    try {
      const result = await governance.apiKeys.create(keyForm);
      setNewKeySecret(result.secret ?? null);
      setKeyOpen(false);
      toast.success('API Key 创建成功');
      setKeyForm({ name: '', type: 'human', expires_at: '' });
      loadData();
    } catch (err: any) {
      toast.error(err.message || '创建失败');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevokeKey(id: string) {
    try {
      await governance.apiKeys.revoke(id);
      toast.success('API Key 已吊销');
      loadData();
    } catch (err: any) {
      toast.error(err.message || '吊销失败');
    }
  }

  function copyKey() {
    if (newKeySecret) {
      navigator.clipboard.writeText(newKeySecret);
      toast.success('已复制到剪贴板');
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-500',
      revoked: 'bg-red-500/10 text-red-500',
      expired: 'bg-amber-500/10 text-amber-500',
    };
    return map[status] || 'bg-muted text-muted-foreground';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">访问控制</h1>
        <p className="text-sm text-muted-foreground">管理角色绑定和 API 密钥</p>
      </div>

      {/* 新 Key 展示 */}
      {newKeySecret && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-500">请立即复制，密钥仅显示一次</p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-background/80 p-2 text-xs font-mono break-all">
                    {newKeySecret}
                  </code>
                  <Button size="sm" variant="outline" onClick={copyKey}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNewKeySecret(null)}>
                    关闭
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="bindings">
        <TabsList>
          <TabsTrigger value="bindings" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            角色绑定
          </TabsTrigger>
          <TabsTrigger value="api-keys" className="gap-2">
            <KeyRound className="h-4 w-4" />
            API 密钥
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bindings" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={bindOpen} onOpenChange={setBindOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" size="sm">
                  <Plus className="h-4 w-4" />
                  添加绑定
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加角色绑定</DialogTitle>
                  <DialogDescription>为用户分配角色</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>用户 ID</Label>
                    <Input
                      placeholder="输入用户 ID"
                      value={bindForm.user_id}
                      onChange={(e) => setBindForm((f) => ({ ...f, user_id: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>角色</Label>
                    <Select value={bindForm.role_code} onValueChange={(v) => setBindForm((f) => ({ ...f, role_code: v }))}>
                      <SelectTrigger><SelectValue placeholder="选择角色" /></SelectTrigger>
                      <SelectContent>
                        {roles.map((r) => (
                          <SelectItem key={r.code} value={r.code}>
                            {r.name} ({r.scope_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBindOpen(false)}>取消</Button>
                  <Button onClick={handleCreateBinding} disabled={binding}>
                    {binding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    绑定
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">用户</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">角色</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">范围</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {bindings.map((b) => (
                    <tr key={b.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <p className="font-medium">{b.display_name || b.username}</p>
                        <p className="text-xs text-muted-foreground">{b.username}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{b.role_name}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {b.project_id || '全局'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => handleDeleteBinding(b.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {bindings.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        暂无角色绑定
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2" size="sm">
                  <Plus className="h-4 w-4" />
                  创建 API Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>创建 API Key</DialogTitle>
                  <DialogDescription>创建一个新的 API 密钥用于程序化访问</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>名称</Label>
                    <Input
                      placeholder="例如：CI/CD Pipeline"
                      value={keyForm.name}
                      onChange={(e) => setKeyForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>类型</Label>
                    <Select value={keyForm.type} onValueChange={(v) => setKeyForm((f) => ({ ...f, type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="human">人工</SelectItem>
                        <SelectItem value="agent">Agent</SelectItem>
                        <SelectItem value="integration">集成</SelectItem>
                        <SelectItem value="system">系统</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>过期时间（可选）</Label>
                    <Input
                      type="datetime-local"
                      value={keyForm.expires_at}
                      onChange={(e) => setKeyForm((f) => ({ ...f, expires_at: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setKeyOpen(false)}>取消</Button>
                  <Button onClick={handleCreateKey} disabled={creating}>
                    {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    创建
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">名称</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">前缀</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">类型</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">最后使用</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.map((k) => (
                    <tr key={k.id} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{k.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{k.key_prefix}...</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{k.type}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${statusBadge(k.status)}`}>{k.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {k.status === 'active' && (
                          <Button size="sm" variant="outline" className="text-red-500" onClick={() => handleRevokeKey(k.id)}>
                            吊销
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {apiKeys.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        暂无 API Key
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

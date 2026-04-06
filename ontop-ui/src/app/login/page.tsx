'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { ArrowRight, KeyRound, ShieldCheck, Sparkles, Zap } from 'lucide-react';

const featureItems = [
  '连接数据源并生成本体',
  '维护 OBDA 映射与语义规则',
  '运行 SPARQL 与 AI 语义问答',
];

export default function LoginPage() {
  const router = useRouter();
  const [account, setAccount] = useState('admin@tianzhi.local');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!account.trim() || !password.trim()) {
      toast.error('请输入账号和密码');
      setSubmitting(false);
      return;
    }

    toast.success(remember ? '已进入工作台，并记住当前设备' : '已进入工作台');
    router.push('/');
    setSubmitting(false);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,oklch(0.28_0.08_280),transparent_30%),radial-gradient(circle_at_85%_15%,oklch(0.23_0.07_200),transparent_28%),linear-gradient(180deg,oklch(0.14_0.02_270),oklch(0.11_0.02_260))] text-foreground">
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="absolute left-[-8rem] top-16 h-56 w-56 rounded-full bg-[oklch(0.72_0.17_85/.24)] blur-3xl" />
      <div className="absolute right-[-6rem] top-24 h-64 w-64 rounded-full bg-[oklch(0.68_0.15_220/.20)] blur-3xl" />
      <div className="absolute bottom-[-8rem] right-[18%] h-72 w-72 rounded-full bg-[oklch(0.72_0.14_160/.14)] blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl items-center gap-16 px-6 py-12 lg:grid-cols-[1.08fr_420px] lg:px-12">
        <section className="space-y-12 text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-4 py-2 backdrop-blur">
            <Zap className="h-4 w-4 text-[oklch(0.78_0.16_85)]" />
            <span className="text-sm font-medium">天织语义平台</span>
          </div>

          <div className="max-w-3xl space-y-6">
            <Badge variant="outline" className="border-white/16 bg-white/6 text-white">
              简洁，但不单调
            </Badge>
            <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              登录后，进入你的本体工作台
            </h1>
            <p className="max-w-xl text-sm leading-7 text-white/70 sm:text-base">
              把数据源、Bootstrap、映射、SPARQL 和 AI 助手放进同一条工作流。
              页面只做一件事: 让你快速进入状态，不在这里浪费注意力。
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {featureItems.map((item, index) => (
              <Card key={item} className="border-white/8 bg-white/[0.045] text-white shadow-none backdrop-blur-sm">
                <CardContent className="space-y-5 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/8">
                      <span className="text-xs font-semibold text-white/72">0{index + 1}</span>
                    </div>
                    <Sparkles className="h-4 w-4 text-[oklch(0.82_0.14_85)]" />
                  </div>
                  <p className="text-sm leading-7 text-white/82">{item}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-5 pt-1 text-sm text-white/65">
            <div className="flex items-center gap-2 rounded-full border border-emerald-400/12 bg-emerald-400/6 px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <span>当前演示环境支持本地快速登录</span>
            </div>
            <Link href="/" className="inline-flex items-center gap-1 text-white transition-colors hover:text-[oklch(0.82_0.14_85)]">
              跳过登录查看工作台
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section>
          <Card className="border-white/10 bg-white/[0.94] shadow-2xl shadow-black/20 backdrop-blur-xl">
            <CardContent className="p-8 sm:p-9">
              <div className="mb-8 space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] shadow-lg shadow-[oklch(0.65_0.18_200/.28)]">
                  <KeyRound className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-2xl font-semibold text-foreground">欢迎回来</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  用你的平台账号登录。页面尽量克制，动作尽量直接。
                </p>
              </div>

              <form className="space-y-6" onSubmit={handleLogin}>
                <div className="space-y-2.5">
                  <Label htmlFor="account">账号</Label>
                  <Input
                    id="account"
                    value={account}
                    onChange={(event) => setAccount(event.target.value)}
                    placeholder="name@company.com"
                    className="h-11 border-border/80 bg-background/80 shadow-sm"
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">密码</Label>
                    <button type="button" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                      忘记密码
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="请输入密码"
                    className="h-11 border-border/80 bg-background/80 shadow-sm"
                  />
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-3.5">
                  <label className="flex items-center gap-3 text-sm text-foreground">
                    <Checkbox
                      checked={remember}
                      onCheckedChange={(checked) => setRemember(checked === true)}
                    />
                    <span>记住这台设备</span>
                  </label>
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    本地演示
                  </Badge>
                </div>

                <Button type="submit" className="h-11 w-full" disabled={submitting}>
                  {submitting ? '登录中...' : '进入工作台'}
                </Button>
              </form>

              <div className="mt-6 rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-foreground">演示账号</p>
                  <Badge variant="outline">免接入</Badge>
                </div>
                <p className="mt-2 leading-6">账号已预填，密码可输入任意非空内容进入首页。</p>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

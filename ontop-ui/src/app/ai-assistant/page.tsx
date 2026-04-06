'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Bot,
  Send,
  Sparkles,
  ChevronDown,
  ChevronRight,
  User,
  Code2,
  Database,
  Table as TableIcon,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ai, sparql, type OntologySummary, type QuickQuestion } from '@/lib/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps?: {
    sparql: string;
    sql: string;
    results: string;
  };
  error?: string;
}

function buildAssistantExamples(summary: OntologySummary): string[] {
  const examples: string[] = [];

  if (summary.classes.includes('PropertyProject')) {
    examples.push('"查询所有物业项目"');
  }
  if (summary.classes.includes('SpaceUnit')) {
    examples.push('"统计每个项目的空间单元数量"');
  }
  if (summary.classes.includes('Bill')) {
    examples.push('"找出待缴账单及金额"');
  }
  if (summary.classes.includes('WorkOrder')) {
    examples.push('"最近有哪些工单"');
  }
  if (examples.length === 0 && summary.classes.length > 0) {
    examples.push(`"查询所有 ${summary.classes[0]}"`);
  }
  if (examples.length === 0) {
    examples.push('"查询当前知识图谱中的全部实体"');
  }

  return examples.slice(0, 4);
}

export default function AIAssistantPage() {
  const [quickQuestions, setQuickQuestions] = useState<QuickQuestion[]>([]);
  const [sceneLabel, setSceneLabel] = useState('当前端点');
  const [examplePrompts, setExamplePrompts] = useState<string[]>([
    '"查询当前知识图谱中的全部实体"',
  ]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好！我是天织语义平台 AI 助手，可以基于当前活跃本体回答业务问题。',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({
    sparql: true,
    sql: true,
    results: true,
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    void loadAssistantContext();
  }, []);

  const loadAssistantContext = async () => {
    try {
      const [questionConfig, summary, endpoint] = await Promise.all([
        ai.getQuickQuestions(),
        ai.ontologySummary(),
        sparql.endpointStatus(),
      ]);

      setQuickQuestions(questionConfig.questions);
      setExamplePrompts(buildAssistantExamples(summary));

      const mappingFile = endpoint.mapping_path.split('/').pop() || '活跃映射';
      const mappingPath = endpoint.mapping_path.toLowerCase();

      if (mappingPath.includes('lvfa')) setSceneLabel('lvfa');
      else if (mappingPath.includes('retail')) setSceneLabel('retail');
      else setSceneLabel(mappingFile);

      const suggestedQuestion = questionConfig.questions[0]?.question;
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: suggestedQuestion
            ? `你好！我是天织语义平台 AI 助手，当前连接的是 ${mappingFile}。你可以直接问我：“${suggestedQuestion}”。`
            : `你好！我是天织语义平台 AI 助手，当前连接的是 ${mappingFile}。`,
        },
      ]);
    } catch {
      setQuickQuestions([]);
      setExamplePrompts(['"查询当前知识图谱中的全部实体"']);
      setSceneLabel('当前端点');
    }
  };

  const handleSend = async (text?: string) => {
    const question = text || inputValue.trim();
    if (!question || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
    };

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: 'assistant', content: '正在处理...' },
    ]);

    try {
      let sparqlText = '';
      let sql = '';
      let results = '';
      let answer = '';

      for await (const step of ai.streamQuery(question)) {
        switch (step.step) {
          case 'analyzing':
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: step.message || '分析本体...' }
                  : message
              )
            );
            break;
          case 'sparql_generated':
            sparqlText = step.sparql || '';
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: 'SPARQL 已生成，正在执行...',
                      steps: { sparql: sparqlText, sql, results },
                    }
                  : message
              )
            );
            break;
          case 'executing':
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, content: step.message || '执行查询...' }
                  : message
              )
            );
            break;
          case 'executed':
            sql = step.sql || '';
            results = step.results || '';
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: '查询已执行，生成回答...',
                      steps: { sparql: sparqlText, sql, results },
                    }
                  : message
              )
            );
            break;
          case 'answer':
            answer = step.answer || '';
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: answer,
                      steps: sparqlText ? { sparql: sparqlText, sql, results } : undefined,
                    }
                  : message
              )
            );
            break;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误';
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId ? { ...item, content: '查询失败', error: message } : item
        )
      );
    }

    setIsLoading(false);
  };

  const toggleStep = (step: string) => {
    setExpandedSteps((prev) => ({ ...prev, [step]: !prev[step] }));
  };

  const parseResults = (resultsStr: string): Array<Record<string, string>> => {
    try {
      const parsed: unknown = JSON.parse(resultsStr);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (row): row is Record<string, string> => Boolean(row) && typeof row === 'object'
      );
    } catch {
      return [];
    }
  };

  return (
    <div className="flex" style={{ height: 'calc(100vh - 56px - 48px)' }}>
      <div className="flex flex-1 flex-col border-r border-border">
        <div className="mb-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">AI 助手</h1>
              <p className="text-sm text-muted-foreground">围绕当前活跃本体进行自然语言问答</p>
            </div>
            <Badge variant="outline" className="ml-auto border-primary/30 bg-primary/5 text-primary">
              当前场景: {sceneLabel}
            </Badge>
          </div>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    message.role === 'user'
                      ? 'bg-primary/10'
                      : 'bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className="h-4 w-4 text-primary" />
                  ) : (
                    <Bot className="h-4 w-4 text-white" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card'
                  }`}
                >
                  {message.error ? (
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <p className="text-sm">{message.error}</p>
                    </div>
                  ) : (
                    <p className="text-sm">{message.content}</p>
                  )}

                  {message.steps && (
                    <div className="mt-4 space-y-2">
                      {message.steps.sparql && (
                        <Collapsible
                          open={expandedSteps.sparql}
                          onOpenChange={() => toggleStep('sparql')}
                        >
                          <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg bg-muted/50 p-2 text-left">
                            {expandedSteps.sparql ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <Code2 className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">SPARQL 查询</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/30 p-3 font-mono text-xs">
                              {message.steps.sparql}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {message.steps.sql && (
                        <Collapsible open={expandedSteps.sql} onOpenChange={() => toggleStep('sql')}>
                          <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg bg-muted/50 p-2 text-left">
                            {expandedSteps.sql ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <Database className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">重写 SQL</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/30 p-3 font-mono text-xs">
                              {message.steps.sql}
                            </pre>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {message.steps.results &&
                        (() => {
                          const parsed = parseResults(message.steps.results);
                          if (parsed.length === 0) return null;
                          const cols = Object.keys(parsed[0]);

                          return (
                            <Collapsible
                              open={expandedSteps.results}
                              onOpenChange={() => toggleStep('results')}
                            >
                              <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-lg bg-muted/50 p-2 text-left">
                                {expandedSteps.results ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                                <TableIcon className="h-4 w-4 text-primary" />
                                <span className="text-sm font-medium">查询结果</span>
                                <Badge variant="secondary" className="ml-auto">
                                  {parsed.length} 条
                                </Badge>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                                  <table className="w-full text-xs">
                                    <thead className="bg-muted/50">
                                      <tr>
                                        {cols.map((col) => (
                                          <th key={col} className="px-3 py-2 text-left font-medium">
                                            {col}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {parsed.map((row, index) => (
                                        <tr key={index} className="border-t border-border">
                                          {cols.map((col) => (
                                            <td key={col} className="px-3 py-2 font-mono">
                                              {row[col] ?? ''}
                                            </td>
                                          ))}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })()}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)]">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-card p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">正在处理查询...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-border p-4">
          <div className="flex gap-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="输入你的问题..."
              className="flex-1"
            />
            <Button
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isLoading}
              className="bg-gradient-to-r from-[oklch(0.70_0.15_280)] to-[oklch(0.65_0.18_200)] hover:opacity-90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {quickQuestions.map((question) => (
              <Button
                key={question.id}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleSend(question.question)}
              >
                <Sparkles className="mr-1 h-3 w-3" />
                {question.question}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-72 border-l border-border p-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">使用说明</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            <p className="mb-2">AI 助手会基于当前活跃端点的本体与映射，把自然语言翻译成可执行的 SPARQL。</p>
            <ul className="space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-primary">1.</span>输入你的问题
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">2.</span>AI 自动生成 SPARQL
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">3.</span>系统重写为 SQL
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">4.</span>返回查询结果
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">示例问题</CardTitle>
          </CardHeader>
          <CardContent className="text-xs">
            <ul className="space-y-2 text-muted-foreground">
              {examplePrompts.map((prompt) => (
                <li key={prompt} className="rounded bg-muted/50 p-2">
                  {prompt}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

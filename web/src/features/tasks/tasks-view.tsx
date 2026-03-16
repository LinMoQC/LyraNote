"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { m, type Variants } from "framer-motion";
import { Clock, Loader2, Plus, Rss, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { createTask, getTasks, type TaskCreateInput } from "@/services/task-service";
import { TaskCard } from "./task-card";

const SCHEDULE_OPTIONS = [
  { value: "daily", label: "每天" },
  { value: "every_3_days", label: "每 3 天" },
  { value: "weekly", label: "每周一" },
  { value: "biweekly", label: "每两周" },
  { value: "monthly", label: "每月" },
];

const DELIVERY_OPTIONS = [
  { value: "note", label: "写入笔记" },
  { value: "email", label: "发送邮件" },
  { value: "both", label: "笔记 + 邮件" },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 24, mass: 0.8 },
  },
};

export function TasksView() {
  const queryClient = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: getTasks,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    topic: "",
    schedule: "daily",
    delivery: "note",
    email: "",
    feedUrls: [] as string[],
  });
  const [feedInput, setFeedInput] = useState("");
  const [feedEditing, setFeedEditing] = useState(false);
  const feedInputRef = useRef<HTMLInputElement>(null);

  const { success, error } = useToast();

  const createMutation = useMutation({
    mutationFn: (input: TaskCreateInput) => createTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setCreateOpen(false);
      setForm({ name: "", topic: "", schedule: "daily", delivery: "note", email: "", feedUrls: [] });
      setFeedInput("");
      setFeedEditing(false);
      success("定时任务创建成功");
    },
    onError: () => error("创建任务失败，请重试"),
  });

  function addFeedUrl() {
    const url = feedInput.trim();
    if (!url || form.feedUrls.includes(url)) return;
    setForm((f) => ({ ...f, feedUrls: [...f.feedUrls, url] }));
    setFeedInput("");
    setFeedEditing(false);
  }

  function startFeedEdit() {
    setFeedEditing(true);
    requestAnimationFrame(() => feedInputRef.current?.focus());
  }

  function removeFeedUrl(url: string) {
    setForm((f) => ({ ...f, feedUrls: f.feedUrls.filter((u) => u !== url) }));
  }

  function handleCreate() {
    if (!form.name.trim() || !form.topic.trim() || createMutation.isPending) return;
    createMutation.mutate({
      name: form.name.trim(),
      topic: form.topic.trim(),
      schedule: form.schedule,
      delivery: form.delivery,
      email: form.delivery !== "note" ? form.email || undefined : undefined,
      feed_urls: form.feedUrls.length > 0 ? form.feedUrls : undefined,
    });
  }

  return (
    <div className="flex h-full flex-col gap-6 p-8">
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">定时任务</h1>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus size={15} />
          新建任务
        </button>
      </div>

      {/* ── Task list ───────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-muted-foreground/40" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/40 bg-card/30 px-8 py-16 text-center">
          <Clock size={32} className="mx-auto mb-4 text-muted-foreground/20" />
          <p className="text-[14px] font-medium text-foreground/60">
            暂无定时任务
          </p>
          <p className="mt-1.5 text-[12px] text-muted-foreground/50">
            点击右上角「新建任务」或在聊天中告诉 AI 来创建
          </p>
        </div>
      ) : (
        <m.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {/* New task card */}
          <m.div variants={item}>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex h-full min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/40 bg-card/20 transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Plus size={18} className="text-primary" />
              </div>
              <span className="text-[13px] text-muted-foreground/60">新建任务</span>
            </button>
          </m.div>

          {tasks.map((task) => (
            <m.div key={task.id} variants={item}>
              <TaskCard task={task} />
            </m.div>
          ))}
        </m.div>
      )}

      {/* ── Create dialog ───────────────────────────────────────── */}
      <Dialog
        open={createOpen}
        title="新建定时任务"
        description="创建一个 AI 自动执行的周期性内容任务"
        onClose={() => setCreateOpen(false)}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">任务名称</label>
            <Input
              autoFocus
              placeholder="例：AI 前沿日报"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">关注主题</label>
            <Input
              placeholder="例：大语言模型最新进展、RAG 技术"
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Rss size={12} />
                订阅源（可选）
              </span>
            </label>
            <div
              className="min-h-[56px] rounded-xl border border-border/40 bg-muted/10 p-2"
              onClick={() => { if (!feedEditing && form.feedUrls.length === 0) startFeedEdit(); }}
            >
              {form.feedUrls.length === 0 && !feedEditing ? (
                <button
                  type="button"
                  onClick={startFeedEdit}
                  className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-[12px] text-muted-foreground/40 transition-colors hover:bg-muted/30 hover:text-muted-foreground/60"
                >
                  <Plus size={14} />
                  添加 RSS / Atom 订阅源
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5">
                  {form.feedUrls.map((url) => (
                    <span
                      key={url}
                      className="group inline-flex items-center gap-1 rounded-lg border border-border/30 bg-background/60 px-2 py-1 text-[11px] text-muted-foreground transition-colors"
                    >
                      <Rss size={10} className="shrink-0 text-orange-400" />
                      <span className="max-w-[180px] truncate">{url}</span>
                      <button
                        type="button"
                        onClick={() => removeFeedUrl(url)}
                        className="ml-0.5 rounded-sm p-0.5 opacity-40 transition-opacity hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                  {feedEditing ? (
                    <input
                      ref={feedInputRef}
                      className="min-w-[140px] flex-1 rounded-lg border border-primary/30 bg-background/80 px-2 py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/40 focus:border-primary/50"
                      placeholder="粘贴订阅链接，回车确认"
                      value={feedInput}
                      onChange={(e) => setFeedInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addFeedUrl(); }
                        if (e.key === "Escape") { setFeedEditing(false); setFeedInput(""); }
                      }}
                      onBlur={() => { if (!feedInput.trim()) { setFeedEditing(false); setFeedInput(""); } }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={startFeedEdit}
                      className="inline-flex items-center gap-0.5 rounded-lg border border-dashed border-border/30 px-2 py-1 text-[11px] text-muted-foreground/40 transition-colors hover:border-primary/30 hover:text-primary/60"
                    >
                      <Plus size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">执行频率</label>
              <div className="flex flex-wrap gap-1.5">
                {SCHEDULE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, schedule: opt.value }))}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                      form.schedule === opt.value
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/40 text-muted-foreground/60 hover:border-border hover:text-foreground/80"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">交付方式</label>
              <div className="flex flex-wrap gap-1.5">
                {DELIVERY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, delivery: opt.value }))}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-[12px] transition-colors",
                      form.delivery === opt.value
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/40 text-muted-foreground/60 hover:border-border hover:text-foreground/80"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {form.delivery !== "note" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">邮箱地址</label>
              <Input
                type="email"
                placeholder="your@email.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              disabled={createMutation.isPending}
              onClick={() => { setCreateOpen(false); setForm({ name: "", topic: "", schedule: "daily", delivery: "note", email: "", feedUrls: [] }); setFeedInput(""); setFeedEditing(false); }}
            >
              取消
            </Button>
            <Button
              disabled={!form.name.trim() || !form.topic.trim() || createMutation.isPending}
              onClick={handleCreate}
            >
              {createMutation.isPending ? "创建中..." : "创建任务"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

"use client";

/**
 * @file 设置表单通用 Hook
 * @description 封装设置页各 Section 共用的表单逻辑：
 *              加载配置、更新字段、提交保存、错误处理和保存成功提示。
 *              减少各 Section 组件的重复代码。
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getConfig, updateConfig, type AppConfigMap } from "@/services/config-service";

/**
 * 设置表单状态管理 Hook
 * @description 自动从后端加载配置项，提供 set（更新字段）和 save（提交保存）方法。
 *              保存成功后显示 2.5 秒的「已保存」提示。
 * @returns {{ form, setForm, loading, saving, saved, error, set, save }}
 */
export function useConfigForm() {
  const tc = useTranslations("common");
  const [form, setForm] = useState<Partial<AppConfigMap>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getConfig()
      .then((d) => { setForm(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const set = (key: keyof AppConfigMap, v: string) =>
    setForm((f) => ({ ...f, [key]: v as never }));

  async function save(fields: Partial<AppConfigMap>) {
    setSaving(true);
    setError(null);
    try {
      await updateConfig(fields);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError(tc("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return { form, setForm, loading, saving, saved, error, set, save } as const;
}

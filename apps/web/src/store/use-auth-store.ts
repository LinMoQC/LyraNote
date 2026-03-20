"use client";

/**
 * @file 认证状态 Store（旧版，仅保留演示数据）
 * @description 保留的静态用户资料 Store。实际认证状态由 AuthProvider（Context）管理。
 */

import { create } from "zustand";

import type { UserProfile } from "@/types";

type AuthStore = {
  user: UserProfile;
};

export const useAuthStore = create<AuthStore>(() => ({
  user: {
    id: "demo-user",
    name: "Demo Operator",
    role: "Product Design"
  }
}));

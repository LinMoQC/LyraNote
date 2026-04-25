"use client";

/**
 * @file 附件图片渲染组件
 * @description 用于消息气泡中已发送图片的懒加载渲染，含加载动画与错误降级。
 */

import { useState } from "react";
import { FileText } from "lucide-react";
import Image from "next/image";
import { m } from "framer-motion";
import { cn } from "./utils";

interface MessageAttachment {
  name: string
  type: string
  previewUrl: string | null
}

export function AttachmentImage({ att }: { att: MessageAttachment }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs text-white/80">
        <FileText size={12} />
        <span className="max-w-[120px] truncate">{att.name}</span>
      </span>
    );
  }

  return (
    <span className="relative inline-block">
      {!loaded && (
        <span className="flex h-32 w-32 items-center justify-center rounded-lg border border-white/20 bg-white/5">
          <m.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="h-5 w-5 rounded-full border-2 border-white/20 border-t-white/70"
          />
        </span>
      )}
      <Image
        src={att.previewUrl!}
        alt={att.name}
        width={200}
        height={160}
        unoptimized
        className={cn(
          "max-h-40 max-w-[200px] rounded-lg border border-white/20 object-cover",
          loaded ? "block" : "absolute left-0 top-0 opacity-0",
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </span>
  );
}

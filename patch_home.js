const fs = require("fs");
const path = require("path");

const filePath = path.join(process.cwd(), "apps/desktop/src/pages/home/home-page.tsx");
let content = fs.readFileSync(filePath, "utf-8");

// replace SUGGESTIONS
content = content.replace(
  /const SUGGESTIONS = \[\s*"分析知识库核心主题",\s*"生成结构化研究摘要",\s*"对比不同来源观点",\s*"根据笔记制定学习计划",\s*\]/g,
  `const SUGGESTIONS = [
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "帮我分析知识库中的核心主题" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "为我的研究生成一份结构化摘要" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "对比不同来源中的相似观点" },
  { icon: <Sparkles size={14} className="text-[var(--color-accent)] opacity-80" />, text: "根据笔记内容生成学习计划" },
]`
);

// replace render
content = content.replace(
  /return \(\s*<div className="flex flex-col items-center justify-center h-full px-6 pb-12">[\s\S]*?\)\n\}/,
  \`return (
    <div className="flex flex-col items-center justify-center h-full px-6 pb-12 gap-8">
      {/* Title Area */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springs.gentle, delay: 0.05 }}
        className="flex flex-col items-center gap-4 text-center mt-8"
      >
        <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden ring-1 ring-white/10 bg-white/5 drop-shadow-xl">
          <img src="/bot_avatar.png" alt="AI Avatar" className="w-full h-full object-cover" />
        </div>
        <div>
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
            有什么我可以帮你的？
          </h2>
          <p className="text-[12px] mt-1.5" style={{ color: "var(--color-text-tertiary)" }}>
            基于你的知识库，我可以帮你分析、总结和探索任何内容
          </p>
        </div>
      </motion.div>

      {/* Suggestions Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="grid grid-cols-2 gap-2 w-full max-w-[560px]"
      >
        {SUGGESTIONS.map((s, idx) => (
          <motion.button
            key={idx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springs.bouncy, delay: 0.15 + idx * 0.05 }}
            whileHover={{ scale: 1.01, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleSuggestion(s.text)}
            className="flex items-center gap-2.5 px-4 py-3.5 rounded-xl text-left text-[12.5px] transition-colors"
            style={{
              background: "rgba(255,255,255,0.015)",
              border: "1px solid rgba(255,255,255,0.05)",
              color: "var(--color-text-secondary)",
            }}
          >
            <span className="shrink-0">{s.icon}</span>
            <span className="leading-snug truncate">{s.text}</span>
          </motion.button>
        ))}
      </motion.div>

      {/* Input card */}
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...springs.smooth, delay: 0.2 }}
        className="w-full max-w-[720px] mt-4"
      >
        <motion.div
          animate={{
            boxShadow: focused
              ? "0 0 0 1.5px rgba(124,110,247,0.5), 0 8px 32px rgba(0,0,0,0.4)"
              : "0 0 0 1px rgba(255,255,255,0.08), 0 4px 16px rgba(0,0,0,0.25)",
          }}
          transition={springs.snappy}
          className="rounded-[20px] overflow-hidden"
          style={{ background: "var(--color-bg-elevated)", border: "none" }}
          onClick={() => textareaRef.current?.focus()}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit() }
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="向 AI 提问，或描述你想探索的内容…"
            rows={1}
            className="w-full bg-transparent outline-none resize-none text-[14px] leading-relaxed px-5 pt-4 pb-12 no-scrollbar"
            style={{
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
              minHeight: "44px",
              caretColor: "var(--color-accent)",
            }}
          />
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
            <div className="relative flex items-center gap-1.5 pl-2 pb-1 pointer-events-auto">
              <button className="flex items-center justify-center w-[30px] h-[30px] rounded-lg text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[#ffffff12] transition-colors">
                <Paperclip size={15} strokeWidth={1.5} className="opacity-70" />
              </button>
            </div>
            <div className="flex items-center gap-2.5 pr-2 pb-1 pointer-events-auto">
              <span className="text-[11px] text-[var(--color-text-tertiary)] opacity-60 select-none mr-1">
                按 Enter 发送 · Shift+Enter 换行
              </span>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="flex items-center justify-center w-[30px] h-[30px] rounded-full transition-all disabled:opacity-30 hover:bg-[#ffffff12]"
                style={{
                  background: input.trim() ? "var(--color-accent)" : "transparent",
                  color: input.trim() ? "white" : "var(--color-text-secondary)",
                }}
              >
                <ArrowUp size={16} strokeWidth={2} />
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}\`
);

fs.writeFileSync(filePath, content, "utf-8");

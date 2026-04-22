import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

export function FloatingOrb({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      title="打开 AI 帮写"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.93 }}
      className="absolute bottom-6 right-6 z-10 flex h-12 w-12 items-center justify-center rounded-full shadow-lg shadow-indigo-900/50 ring-1 ring-white/10"
      style={{
        background: "radial-gradient(circle at 35% 35%, #a78bfa, #6366f1 55%, #3b82f6)",
      }}
    >
      <Sparkles size={20} className="text-white" />

      {/* subtle highlight */}
      <div className="absolute left-2.5 top-2 h-3 w-3 rounded-full bg-white/20 blur-[3px]" />

      {/* pulsing ring */}
      <motion.div
        className="absolute inset-0 rounded-full ring-2 ring-indigo-400/30"
        animate={{ scale: [1, 1.18, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </motion.button>
  )
}

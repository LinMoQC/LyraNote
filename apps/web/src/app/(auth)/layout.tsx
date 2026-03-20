export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      {/* Background gradient blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 left-1/2 h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-primary/[0.06] blur-3xl" />
        <div className="absolute -bottom-20 right-0 h-[500px] w-[500px] rounded-full bg-violet-500/[0.05] blur-3xl" />
        <div className="absolute bottom-40 left-0 h-[300px] w-[300px] rounded-full bg-indigo-500/[0.04] blur-3xl" />
      </div>
      <div className="relative z-10 w-full">
        {children}
      </div>
    </div>
  )
}

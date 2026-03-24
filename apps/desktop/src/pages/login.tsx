import { useState } from "react";
import { Bot } from "lucide-react";
import { useAuthStore } from "@/store/use-auth-store";
import { setToken, setServerUrl, getHttpClient } from "@/lib/http-client";
import { createAuthService } from "@lyranote/api-client";
import { cn } from "@/lib/utils";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { setAuth } = useAuthStore();
  const [serverUrl, setServerUrlInput] = useState("http://localhost:8000/api/v1");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      setServerUrl(serverUrl.trim());
      const authService = createAuthService(getHttpClient());
      const tokenRes = await authService.login({ username, password });
      setToken(tokenRes.access_token);

      const me = await authService.getMe();
      setAuth(
        { id: me.id, username: me.username, name: me.name, email: me.email, avatar_url: me.avatar_url },
        tokenRes.access_token
      );
      onLogin();
    } catch {
      setError("Invalid credentials or server unreachable.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-sidebar-bg">
      <div className="w-80">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-brand/20 flex items-center justify-center mb-3">
            <Bot size={24} className="text-brand" />
          </div>
          <h1 className="text-lg font-semibold text-sidebar-text">LyraNote</h1>
          <p className="text-xs text-sidebar-text-muted mt-1">Desktop Client</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            label="Server URL"
            type="url"
            value={serverUrl}
            onChange={setServerUrlInput}
            placeholder="http://localhost:8000/api/v1"
          />
          <Field
            label="Username"
            type="text"
            value={username}
            onChange={setUsername}
            placeholder="admin"
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
          />

          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || !username || !password}
            className="w-full py-2 rounded-lg bg-brand hover:bg-brand-hover text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-sidebar-text-muted mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-surface-raised border border-sidebar-border rounded-lg px-3 py-2 text-xs text-sidebar-text placeholder-sidebar-text-muted outline-none focus:border-brand transition-colors"
      />
    </div>
  );
}

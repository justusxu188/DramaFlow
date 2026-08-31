"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Blocks, LogIn, ShieldCheck } from "lucide-react";

export function AuthForm({
  mode,
}: {
  mode: "login" | "setup";
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(formData: FormData) {
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
        ...(mode === "setup"
          ? { name: formData.get("name") }
          : {}),
      }),
    });
    const payload = await response.json() as {
      error?: string;
      setupRequired?: boolean;
    };
    if (!response.ok) {
      if (payload.setupRequired) {
        router.replace("/setup");
        return;
      }
      setError(payload.error ?? "操作失败");
      setSubmitting(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const setup = mode === "setup";
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-brand">
          <span className="brand-mark">
            <Blocks size={22} strokeWidth={2.4} />
          </span>
          <div>
            <strong>FrameFlow</strong>
            <small>SHORT DRAMA STUDIO</small>
          </div>
        </div>
        <header>
          {setup ? <ShieldCheck size={24} /> : <LogIn size={24} />}
          <h1>{setup ? "创建首个管理员" : "登录"}</h1>
          <p>
            {setup
              ? "首次启动配置完成后，普通用户由管理员创建。"
              : "使用管理员分配的账号进入工作台。"}
          </p>
        </header>
        <form action={submit}>
          {setup && (
            <label>
              <span>姓名</span>
              <input
                name="name"
                required
                maxLength={40}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            <span>用户名</span>
            <input
              name="username"
              required
              minLength={3}
              maxLength={40}
              autoComplete="username"
            />
          </label>
          <label>
            <span>密码</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              maxLength={128}
              autoComplete={
                setup ? "new-password" : "current-password"
              }
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button
            className="button primary"
            disabled={submitting}
            type="submit"
          >
            {submitting
              ? "正在提交"
              : setup
                ? "完成初始化"
                : "登录"}
          </button>
        </form>
      </section>
    </main>
  );
}

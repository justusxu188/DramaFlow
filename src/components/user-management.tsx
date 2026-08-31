"use client";

import { useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import type { AppUser } from "@/lib/user-store";

export function UserManagement({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AppUser[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function request(
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
  ) {
    const response = await fetch("/api/admin/users", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as {
      data?: AppUser;
      error?: string;
    };
    if (!response.ok || !payload.data) {
      throw new Error(payload.error ?? "用户操作失败");
    }
    return payload.data;
  }

  async function create(formData: FormData) {
    setBusyId("create");
    setError("");
    try {
      const user = await request("POST", {
        username: formData.get("username"),
        name: formData.get("name"),
        password: formData.get("password"),
        role: formData.get("role"),
      });
      setUsers((current) => [...current, user]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "用户创建失败");
    } finally {
      setBusyId("");
    }
  }

  async function update(
    userId: string,
    patch: Record<string, unknown>,
  ) {
    setBusyId(userId);
    setError("");
    try {
      const user = await request("PATCH", { userId, ...patch });
      setUsers((current) =>
        current.map((item) => item.id === user.id ? user : item),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "用户更新失败");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="section-block user-management">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ACCESS CONTROL</p>
          <h2>用户管理</h2>
        </div>
        <span className="work-count">{users.length} 个账号</span>
      </div>
      <form action={create} className="user-create-form">
        <label>
          <span>姓名</span>
          <input name="name" required maxLength={40} />
        </label>
        <label>
          <span>用户名</span>
          <input name="username" required minLength={3} maxLength={40} />
        </label>
        <label>
          <span>初始密码</span>
          <input name="password" type="password" required minLength={8} />
        </label>
        <label>
          <span>角色</span>
          <select name="role" defaultValue="user">
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <button
          className="button primary"
          type="submit"
          disabled={busyId === "create"}
        >
          <UserPlus size={16} />
          {busyId === "create" ? "创建中" : "创建用户"}
        </button>
      </form>
      {error && <p className="form-error">{error}</p>}
      <div className="user-list">
        {users.map((user) => (
          <article className="user-row" key={user.id}>
            <div>
              <strong>{user.name}</strong>
              <small>@{user.username}</small>
            </div>
            <span>{user.role === "admin" ? "管理员" : "普通用户"}</span>
            <span className={user.active ? "user-active" : "user-disabled"}>
              {user.active ? "已启用" : "已停用"}
            </span>
            <form
              action={(formData) =>
                update(user.id, {
                  password: formData.get("password"),
                })
              }
              className="user-password-form"
            >
              <input
                name="password"
                type="password"
                placeholder="新密码"
                minLength={8}
                required
              />
              <button
                className="button ghost compact"
                type="submit"
                disabled={busyId === user.id}
              >
                <KeyRound size={15} />
                重置密码
              </button>
            </form>
            <button
              className="button ghost compact"
              type="button"
              disabled={
                busyId === user.id || user.id === currentUserId
              }
              onClick={() =>
                void update(user.id, { active: !user.active })
              }
            >
              {user.active ? "停用" : "启用"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

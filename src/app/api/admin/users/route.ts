import { NextResponse } from "next/server";
import { z } from "zod";
import { adminApiUser } from "@/lib/authorization";
import {
  createUser,
  listUsers,
  resetUserPassword,
  setUserActive,
} from "@/lib/user-store";

const createSchema = z.object({
  username: z.string(),
  name: z.string(),
  password: z.string(),
  role: z.enum(["admin", "user"]),
});

const updateSchema = z.object({
  userId: z.string().min(1),
  active: z.boolean().optional(),
  password: z.string().optional(),
}).refine(
  (input) =>
    input.active !== undefined || input.password !== undefined,
  "没有需要更新的用户字段",
);

export async function GET() {
  const auth = await adminApiUser();
  if (auth.response) return auth.response;
  return NextResponse.json({ data: await listUsers() });
}

export async function POST(request: Request) {
  const auth = await adminApiUser();
  if (auth.response) return auth.response;
  try {
    const input = createSchema.parse(await request.json());
    const user = await createUser(input);
    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "用户创建失败",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await adminApiUser();
  if (!auth.user || auth.response) return auth.response;
  try {
    const input = updateSchema.parse(await request.json());
    if (input.userId === auth.user.id && input.active === false) {
      return NextResponse.json(
        { error: "不能停用当前登录的管理员账号" },
        { status: 400 },
      );
    }
    let user =
      input.active === undefined
        ? await listUsers().then(
            (users) =>
              users.find((item) => item.id === input.userId) ??
              null,
          )
        : await setUserActive(input.userId, input.active);
    if (user && input.password !== undefined) {
      user = await resetUserPassword(input.userId, input.password);
    }
    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: user });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "用户更新失败",
      },
      { status: 400 },
    );
  }
}

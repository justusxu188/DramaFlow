import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  authenticateUser,
  createFirstAdmin,
  createUser,
  listUsers,
  setUserActive,
} from "@/lib/user-store";

let directory = "";

describe("user store", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "frameflow-users-"));
    process.env.FRAMEFLOW_USER_STORE_PATH = path.join(
      directory,
      "users.json",
    );
  });

  afterEach(async () => {
    delete process.env.FRAMEFLOW_USER_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  it("stores scrypt hashes and authenticates active users", async () => {
    const user = await createFirstAdmin({
      username: "Admin",
      name: "管理员",
      password: "correct-password",
    });

    expect(user.username).toBe("admin");
    expect(
      await authenticateUser("ADMIN", "correct-password"),
    ).toMatchObject({ id: user.id, role: "admin" });
    expect(
      await authenticateUser("admin", "wrong-password"),
    ).toBeNull();

    const persisted = await readFile(
      process.env.FRAMEFLOW_USER_STORE_PATH!,
      "utf8",
    );
    expect(persisted).toContain("scrypt$");
    expect(persisted).not.toContain("correct-password");
  });

  it("allows only one first administrator", async () => {
    const attempts = await Promise.allSettled([
      createFirstAdmin({
        username: "admin-one",
        name: "管理员一",
        password: "password-one",
      }),
      createFirstAdmin({
        username: "admin-two",
        name: "管理员二",
        password: "password-two",
      }),
    ]);

    expect(attempts.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(await listUsers()).toHaveLength(1);
  });

  it("does not authenticate disabled users", async () => {
    const user = await createUser({
      username: "creator",
      name: "创作者",
      password: "creator-password",
      role: "user",
    });
    await setUserActive(user.id, false);

    expect(
      await authenticateUser("creator", "creator-password"),
    ).toBeNull();
  });
});

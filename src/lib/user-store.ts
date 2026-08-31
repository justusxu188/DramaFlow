import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export type UserRole = "admin" | "user";

export type AppUser = {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

type StoredUser = AppUser & {
  passwordHash: string;
};

type UserData = {
  users: StoredUser[];
};

const defaultDataPath = path.join(
  process.cwd(),
  "data",
  "user-store.json",
);
let mutationQueue = Promise.resolve();

function dataPath() {
  return process.env.FRAMEFLOW_USER_STORE_PATH ?? defaultDataPath;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

function publicUser(user: StoredUser): AppUser {
  const { passwordHash: _passwordHash, ...result } = user;
  return result;
}

async function readData(): Promise<UserData> {
  try {
    const override = process.env.FRAMEFLOW_USER_STORE_PATH;
    const content = override
      ? await readFile(
          /* turbopackIgnore: true */ override,
          "utf8",
        )
      : await readFile(defaultDataPath, "utf8");
    const value = JSON.parse(
      content,
    ) as Partial<UserData>;
    return {
      users: Array.isArray(value.users) ? value.users : [],
    };
  } catch {
    return { users: [] };
  }
}

async function writeData(data: UserData) {
  const target = dataPath();
  await mkdir(path.dirname(target), { recursive: true });
  const temporaryPath = `${target}.${crypto.randomUUID()}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, target);
}

async function mutateData<T>(
  change: (data: UserData) => T | Promise<T>,
): Promise<T> {
  const operation = mutationQueue
    .catch(() => undefined)
    .then(async () => {
      const data = await readData();
      const result = await change(data);
      await writeData(data);
      return result;
    });
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export async function hashPassword(password: string) {
  if (password.length < 8 || password.length > 128) {
    throw new Error("密码长度需为 8 至 128 个字符");
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
) {
  const [algorithm, saltValue, hashValue] = encodedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !saltValue ||
    !hashValue
  ) {
    return false;
  }
  try {
    const expected = Buffer.from(hashValue, "base64");
    const actual = await scrypt(
      password,
      Buffer.from(saltValue, "base64"),
      expected.length,
    ) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function hasUsers() {
  return (await readData()).users.length > 0;
}

export async function listUsers(): Promise<AppUser[]> {
  return (await readData()).users
    .map(publicUser)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getUserById(userId: string) {
  const user = (await readData()).users.find(
    (item) => item.id === userId,
  );
  return user ? publicUser(user) : null;
}

export async function authenticateUser(
  username: string,
  password: string,
) {
  const user = (await readData()).users.find(
    (item) =>
      item.username === normalizeUsername(username) &&
      item.active,
  );
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return null;
  }
  return publicUser(user);
}

export async function createUser(input: {
  username: string;
  name: string;
  password: string;
  role: UserRole;
}) {
  const username = normalizeUsername(input.username);
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    throw new Error("用户名需为 3 至 40 位字母、数字、点、横线或下划线");
  }
  const name = input.name.trim();
  if (!name || name.length > 40) {
    throw new Error("姓名需为 1 至 40 个字符");
  }
  const passwordHash = await hashPassword(input.password);
  return mutateData((data) => {
    if (data.users.some((item) => item.username === username)) {
      throw new Error("用户名已存在");
    }
    const now = new Date().toISOString();
    const user: StoredUser = {
      id: `user-${crypto.randomUUID()}`,
      username,
      name,
      role: input.role,
      active: true,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    data.users.push(user);
    return publicUser(user);
  });
}

export async function createFirstAdmin(input: {
  username: string;
  name: string;
  password: string;
}) {
  const username = normalizeUsername(input.username);
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    throw new Error("用户名需为 3 至 40 位字母、数字、点、横线或下划线");
  }
  const name = input.name.trim();
  if (!name || name.length > 40) {
    throw new Error("姓名需为 1 至 40 个字符");
  }
  const passwordHash = await hashPassword(input.password);
  return mutateData((data) => {
    if (data.users.length) {
      throw new Error("系统已完成初始化");
    }
    const now = new Date().toISOString();
    const user: StoredUser = {
      id: `user-${crypto.randomUUID()}`,
      username,
      name,
      role: "admin",
      active: true,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    data.users.push(user);
    return publicUser(user);
  });
}

export async function resetUserPassword(
  userId: string,
  password: string,
) {
  const passwordHash = await hashPassword(password);
  return mutateData((data) => {
    const user = data.users.find((item) => item.id === userId);
    if (!user) return null;
    user.passwordHash = passwordHash;
    user.updatedAt = new Date().toISOString();
    return publicUser(user);
  });
}

export async function setUserActive(
  userId: string,
  active: boolean,
) {
  return mutateData((data) => {
    const user = data.users.find((item) => item.id === userId);
    if (!user) return null;
    user.active = active;
    user.updatedAt = new Date().toISOString();
    return publicUser(user);
  });
}

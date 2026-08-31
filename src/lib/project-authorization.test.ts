import {
  mkdtemp,
  rm,
  writeFile,
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
  assignUnownedProjects,
  createProject,
  getProject,
  listProjects,
} from "@/lib/project-store";

let directory = "";

describe("project ownership", () => {
  beforeEach(async () => {
    directory = await mkdtemp(
      path.join(os.tmpdir(), "frameflow-projects-"),
    );
    process.env.FRAMEFLOW_PROJECT_STORE_PATH = path.join(
      directory,
      "projects.json",
    );
  });

  afterEach(async () => {
    delete process.env.FRAMEFLOW_PROJECT_STORE_PATH;
    await rm(directory, { recursive: true, force: true });
  });

  it("filters ordinary users to their own projects", async () => {
    const first = await createProject({
      name: "项目一",
      genre: "都市",
      episodeCount: 1,
    }, "user-1");
    const second = await createProject({
      name: "项目二",
      genre: "古装",
      episodeCount: 1,
    }, "user-2");

    expect(
      await listProjects({ id: "user-1", role: "user" }),
    ).toEqual([expect.objectContaining({ id: first.id })]);
    expect(
      await getProject(second.id, {
        id: "user-1",
        role: "user",
      }),
    ).toBeNull();
    expect(
      await listProjects({ id: "admin-1", role: "admin" }),
    ).toHaveLength(2);
  });

  it("assigns historical unowned projects to the first admin", async () => {
    await writeFile(
      process.env.FRAMEFLOW_PROJECT_STORE_PATH!,
      JSON.stringify({
        projects: [{
          id: "legacy-project",
          name: "历史项目",
          genre: "都市",
          episodeCount: 1,
          status: "ready",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
        }],
        assets: [],
      }),
      "utf8",
    );

    expect(await assignUnownedProjects("admin-1")).toBe(1);
    expect(
      await getProject("legacy-project", {
        id: "admin-1",
        role: "user",
      }),
    ).toMatchObject({ ownerId: "admin-1" });
  });
});

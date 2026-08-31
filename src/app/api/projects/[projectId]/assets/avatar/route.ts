import { NextResponse } from "next/server";
import { z } from "zod";
import { getArkAssetsClient } from "@/lib/ark-assets";
import { groupImageAssetsByIdentity } from "@/lib/image-asset-groups";
import {
  getImageAssetsByIds,
  listImageAssets,
  updateImageAssetMetadata,
} from "@/lib/project-store";
import {
  authenticatedApiUser,
  authorizedProject,
} from "@/lib/authorization";

const inputSchema = z.object({
  action: z.enum([
    "register",
    "refresh",
    "repair_group",
  ]),
  assetId: z.string().min(1),
});

export async function POST(
  request: Request,
  context: {
    params: Promise<{ projectId: string }>;
  },
) {
  const requestId = crypto.randomUUID();
  try {
    const { projectId } = await context.params;
    const auth = await authenticatedApiUser();
    if (!auth.user || auth.response) return auth.response;
    if (!(await authorizedProject(projectId, auth.user))) {
      return NextResponse.json(
        { error: "项目不存在", requestId },
        { status: 404 },
      );
    }
    const input = inputSchema.parse(
      await request.json(),
    );
    const [asset] = await getImageAssetsByIds(
      projectId,
      [input.assetId],
    );
    if (!asset) {
      return NextResponse.json(
        { error: "图片不存在或不属于当前项目", requestId },
        { status: 404 },
      );
    }
    const client = getArkAssetsClient();
    const targetProjectName = client.getProjectName();

    async function registerInTargetProject() {
      const allAssets = await listImageAssets(projectId);
      const group = groupImageAssetsByIdentity(
        allAssets,
      ).find(([, item]) =>
        item.assets.some(
          (itemAsset) => itemAsset.id === asset.id,
        ),
      )?.[1];
      let groupId = group?.assets.find(
        (item) =>
          item.metadata.avatarGroupId &&
          (item.metadata.avatarProjectName ??
            "default") === targetProjectName,
      )?.metadata.avatarGroupId;
      if (!groupId) {
        groupId = await client.createGroup({
          name: asset.metadata.characterName,
          description:
            `FrameFlow 项目 ${projectId} 的自定义虚拟人像`,
        });
      }
      const remote = await client.createImageAsset({
        groupId,
        name: asset.name,
        url: asset.sourceUrl,
      });
      const updated = await updateImageAssetMetadata(
        projectId,
        asset.id,
        {
          avatarGroupId: remote.groupId,
          avatarAssetId: remote.id,
          avatarStatus: remote.status,
          avatarAssetType: remote.assetType,
          avatarProjectName: remote.projectName,
          avatarRemoteName: remote.name ?? asset.name,
          avatarError: "",
          avatarUpdatedAt: new Date().toISOString(),
        },
      );
      if (!updated) {
        throw new Error(
          `虚拟人像已提交至方舟（Asset ID：${remote.id}），但本地记录失败，请勿重复入库`,
        );
      }
      return NextResponse.json(
        { data: remote, requestId },
        { status: 202 },
      );
    }

    if (input.action === "repair_group") {
      if (
        !asset.metadata.avatarAssetId ||
        !asset.metadata.avatarGroupId
      ) {
        return NextResponse.json(
          { error: "该图片尚未登记为虚拟人像", requestId },
          { status: 409 },
        );
      }
      const allAssets = await listImageAssets(projectId);
      const identityGroup =
        groupImageAssetsByIdentity(allAssets).find(
          ([, item]) =>
            item.assets.some(
              (itemAsset) =>
                itemAsset.id === asset.id,
            ),
        )?.[1];
      const targetGroupId =
        identityGroup?.assets.find(
          (item) =>
            item.id !== asset.id &&
            item.metadata.avatarGroupId &&
            (item.metadata.avatarProjectName ??
              "default") === targetProjectName &&
            item.metadata.avatarGroupId !==
              asset.metadata.avatarGroupId,
        )?.metadata.avatarGroupId;
      if (!targetGroupId) {
        return NextResponse.json(
          {
            error: "未找到同一人物的目标素材组",
            requestId,
          },
          { status: 409 },
        );
      }
      await client.deleteAsset(
        asset.metadata.avatarAssetId,
      );
      try {
        await client.deleteGroup(
          asset.metadata.avatarGroupId,
        );
      } catch {
        // The empty historical group does not affect inference.
      }
      const remote = await client.createImageAsset({
        groupId: targetGroupId,
        name: asset.name,
        url: asset.sourceUrl,
      });
      const updated = await updateImageAssetMetadata(
        projectId,
        asset.id,
        {
          avatarGroupId: remote.groupId,
          avatarAssetId: remote.id,
          avatarStatus: remote.status,
          avatarAssetType: remote.assetType,
          avatarProjectName: remote.projectName,
          avatarRemoteName:
            remote.name ?? asset.name,
          avatarError: "",
          avatarUpdatedAt: new Date().toISOString(),
        },
      );
      if (!updated) {
        throw new Error(
          `虚拟人像已重新提交至方舟（Asset ID：${remote.id}），但本地记录失败`,
        );
      }
      return NextResponse.json(
        { data: remote, requestId },
        { status: 202 },
      );
    }

    if (input.action === "refresh") {
      if (!asset.metadata.avatarAssetId) {
        return NextResponse.json(
          { error: "该图片尚未登记为虚拟人像", requestId },
          { status: 409 },
        );
      }
      if (
        (asset.metadata.avatarProjectName ??
          "default") !== targetProjectName
      ) {
        return await registerInTargetProject();
      }
      const remote = await client.getAsset(
        asset.metadata.avatarAssetId,
      );
      const updated = await updateImageAssetMetadata(
        projectId,
        asset.id,
        {
          avatarGroupId: remote.groupId,
          avatarAssetId: remote.id,
          avatarStatus: remote.status,
          avatarAssetType: remote.assetType,
          avatarProjectName: remote.projectName,
          avatarRemoteName: remote.name ?? asset.name,
          avatarError: remote.error ?? "",
          avatarUpdatedAt:
            remote.updatedAt ?? new Date().toISOString(),
        },
      );
      if (!updated) {
        throw new Error("虚拟人像状态保存失败");
      }
      return NextResponse.json({
        data: remote,
        requestId,
      });
    }

    if (asset.metadata.avatarAssetId) {
      if (
        (asset.metadata.avatarProjectName ??
          "default") !== targetProjectName
      ) {
        return await registerInTargetProject();
      }
      const remote = await client.getAsset(
        asset.metadata.avatarAssetId,
      );
      const updated = await updateImageAssetMetadata(
        projectId,
        asset.id,
        {
          avatarGroupId: remote.groupId,
          avatarAssetId: remote.id,
          avatarStatus: remote.status,
          avatarAssetType: remote.assetType,
          avatarProjectName: remote.projectName,
          avatarRemoteName: remote.name ?? asset.name,
          avatarError: remote.error ?? "",
          avatarUpdatedAt:
            remote.updatedAt ?? new Date().toISOString(),
        },
      );
      if (!updated) {
        throw new Error("虚拟人像状态保存失败");
      }
      return NextResponse.json({
        data: remote,
        requestId,
      });
    }

    return await registerInTargetProject();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "虚拟人像登记失败";
    return NextResponse.json(
      { error: message, requestId },
      { status: 400 },
    );
  }
}

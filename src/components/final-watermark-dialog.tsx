"use client";

import { useEffect, useState } from "react";
import {
  Image as ImageIcon,
  LoaderCircle,
  Stamp,
  Type,
  X,
} from "lucide-react";
import type { PipelineData } from "@/components/pipeline-workspace-types";

type Composition = PipelineData["compositions"][number];

type Props = {
  projectId: string;
  composition: Composition;
  onClose: () => void;
  onCompleted: () => Promise<void>;
};

export function FinalWatermarkDialog({
  projectId,
  composition,
  onClose,
  onCompleted,
}: Props) {
  const [mode, setMode] = useState<"image" | "text">(
    composition.processedOperation === "text_watermark"
      ? "text"
      : "image",
  );
  const [text, setText] = useState(
    composition.watermarkText ?? "",
  );
  const [capabilities, setCapabilities] = useState({
    image: false,
    text: false,
  });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/post-production`)
      .then(async (response) => {
        const payload = await response.json() as {
          data?: {
            vodWatermarkCapabilities?: {
              image: boolean;
              text: boolean;
            };
          };
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "水印配置读取失败");
        }
        setCapabilities(
          payload.data?.vodWatermarkCapabilities ?? {
            image: false,
            text: false,
          },
        );
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "水印配置读取失败",
        ),
      )
      .finally(() => setLoadingConfig(false));
  }, [projectId]);

  async function applyWatermark() {
    if (!composition.videoUrl) return;
    setProcessing(true);
    setError("");
    try {
      const requestBody = {
        operation: "watermark",
        compositionId: composition.id,
        sourceVideoUrl: composition.videoUrl,
        watermarkMode: mode,
        ...(mode === "text" ? { text: text.trim() } : {}),
      };
      const startResponse = await fetch(
        `/api/projects/${projectId}/post-production`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            ...requestBody,
          }),
        },
      );
      const startPayload = await startResponse.json() as {
        data?: { id?: string };
        error?: string;
      };
      if (!startResponse.ok || !startPayload.data?.id) {
        throw new Error(
          startPayload.error ?? "水印任务启动失败",
        );
      }
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const statusResponse = await fetch(
          `/api/projects/${projectId}/post-production`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "status",
              taskId: startPayload.data.id,
              ...requestBody,
            }),
          },
        );
        const statusPayload = await statusResponse.json() as {
          data?: { status?: string };
          error?: string;
        };
        if (!statusResponse.ok && statusResponse.status !== 202) {
          throw new Error(
            statusPayload.error ?? "水印处理失败",
          );
        }
        if (statusPayload.data?.status === "completed") {
          await onCompleted();
          onClose();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      throw new Error("水印处理时间过长，请稍后重试");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "水印处理失败",
      );
    } finally {
      setProcessing(false);
    }
  }

  const selectedModeConfigured = capabilities[mode];

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal watermark-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="watermark-title"
      >
        <header className="modal-heading">
          <div>
            <span>最终成片</span>
            <h3 id="watermark-title">添加水印</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            title="关闭"
            disabled={processing}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="watermark-mode-switch">
          <button
            type="button"
            className={mode === "image" ? "selected" : ""}
            onClick={() => setMode("image")}
          >
            <ImageIcon size={16} />
            图片水印
          </button>
          <button
            type="button"
            className={mode === "text" ? "selected" : ""}
            onClick={() => setMode("text")}
          >
            <Type size={16} />
            文字水印
          </button>
        </div>
        <div className="video-tool-body">
          {mode === "image" ? (
            <div className="watermark-template-summary">
              <ImageIcon size={20} />
              <span>使用系统配置的品牌图片水印模板</span>
            </div>
          ) : (
            <label className="field">
              <span>水印文字</span>
              <input
                value={text}
                maxLength={120}
                placeholder="输入水印文字"
                disabled={processing}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
          )}
          {!loadingConfig && !selectedModeConfigured && (
            <div className="pipeline-callout warning">
              当前环境尚未配置
              {mode === "image" ? "图片" : "文字"}
              水印模板。
            </div>
          )}
          {error && (
            <div className="pipeline-callout error">{error}</div>
          )}
        </div>
        <footer className="modal-actions">
          <button
            className="button ghost"
            type="button"
            disabled={processing}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button primary"
            type="button"
            disabled={
              loadingConfig ||
              processing ||
              !selectedModeConfigured ||
              (mode === "text" && !text.trim())
            }
            onClick={() => void applyWatermark()}
          >
            {processing ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Stamp size={15} />
            )}
            {processing ? "处理中" : "生成水印成片"}
          </button>
        </footer>
      </section>
    </div>
  );
}

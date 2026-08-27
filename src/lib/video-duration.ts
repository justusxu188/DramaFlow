export function probeVideoDuration(
  source: Blob | string,
  timeoutMs = 15000,
) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const isRemoteSource = typeof source === "string";
    const objectUrl = isRemoteSource ? null : URL.createObjectURL(source);
    const sourceUrl = isRemoteSource ? source : objectUrl!;
    let settled = false;

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (error) reject(error);
    }

    const timeout = window.setTimeout(
      () => finish(new Error("读取视频时长超时")),
      timeoutMs,
    );

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const durationMs = Math.round(video.duration * 1000);
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        finish(new Error("视频文件未返回有效时长"));
        return;
      }
      finish();
      resolve(durationMs);
    };
    video.onerror = () => finish(new Error("无法读取视频时长"));
    video.src = sourceUrl;
  });
}

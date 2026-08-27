import { env, assertRealProviderConfig } from "@/lib/env";
import { ArkCreativeProvider } from "./ark";
import { MediaKitProvider } from "./mediakit";
import { MockCreativeProvider } from "./mock";
import type { CreativeProvider } from "./types";

class RealCreativeProvider implements CreativeProvider {
  private ark = new ArkCreativeProvider();
  private mediaKit = new MediaKitProvider();

  analyzeStory: CreativeProvider["analyzeStory"] = (input) =>
    this.ark.analyzeStory(input);

  analyzeStoryline: CreativeProvider["analyzeStoryline"] = (input) =>
    this.mediaKit.analyzeStoryline(input);

  restoreDramaScript: CreativeProvider["restoreDramaScript"] = (input) =>
    this.mediaKit.restoreDramaScript(input);

  generateScripts: CreativeProvider["generateScripts"] = (input) =>
    this.ark.generateScripts(input);

  generateImage: CreativeProvider["generateImage"] = (input) =>
    this.ark.generateImage(input);

  extractFrames: CreativeProvider["extractFrames"] = (input) =>
    this.mediaKit.extractFrames(input);

  createPreroll: CreativeProvider["createPreroll"] = (input) =>
    this.ark.createPreroll(input);

  getPrerollTask: CreativeProvider["getPrerollTask"] = (id) =>
    this.ark.getPrerollTask(id);

  segmentScenes: CreativeProvider["segmentScenes"] = (input) =>
    this.mediaKit.segmentScenes(input);

  createHighlight: CreativeProvider["createHighlight"] = (input) =>
    this.mediaKit.createHighlight(input);

  getMediaTask: CreativeProvider["getMediaTask"] = (id) =>
    this.mediaKit.getMediaTask(id);

  trimVideo: CreativeProvider["trimVideo"] = (input) =>
    this.mediaKit.trimVideo(input);

  concatVideos: CreativeProvider["concatVideos"] = (input) =>
    this.mediaKit.concatVideos(input);
}

let provider: CreativeProvider | undefined;

export function getCreativeProvider(): CreativeProvider {
  if (provider) return provider;
  if (env.PROVIDER_MODE === "real") {
    assertRealProviderConfig();
    provider = new RealCreativeProvider();
  } else {
    provider = new MockCreativeProvider();
  }
  return provider;
}

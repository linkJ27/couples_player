import { describe, expect, it } from "vitest";
import { convertSrtToVtt, offsetVtt } from "./subtitles";

describe("subtitle conversion", () => {
  it("converts srt cues to webvtt and applies offset", () => {
    expect(
      convertSrtToVtt(
        `1
00:00:01,000 --> 00:00:03,500
Hello
`,
        500
      )
    ).toContain("00:00:01.500 --> 00:00:04.000");
  });

  it("does not produce negative timestamps", () => {
    expect(offsetVtt("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello", -2_000)).toContain(
      "00:00:00.000 --> 00:00:00.000"
    );
  });
});


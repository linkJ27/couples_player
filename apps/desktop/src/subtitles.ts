export interface SubtitleTrack {
  name: string;
  url: string;
}

export function isSubtitleFile(file: File): boolean {
  return /\.(srt|vtt)$/i.test(file.name);
}

export async function createSubtitleTrack(file: File, offsetMs: number): Promise<SubtitleTrack> {
  const text = await file.text();
  const content = /\.srt$/i.test(file.name) ? convertSrtToVtt(text, offsetMs) : offsetVtt(text, offsetMs);
  const blob = new Blob([content], { type: "text/vtt;charset=utf-8" });
  return {
    name: file.name,
    url: URL.createObjectURL(blob)
  };
}

export function convertSrtToVtt(input: string, offsetMs = 0): string {
  const normalized = input.replace(/\r/g, "").trim();
  if (!normalized) {
    return "WEBVTT\n";
  }

  const body = normalized
    .split("\n")
    .map((line) => {
      if (/^\d+$/.test(line.trim())) {
        return "";
      }

      return line.replace(
        /(\d{2}:\d{2}:\d{2}),(\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}),(\d{3})/,
        (_match, start, startMs, end, endMs) =>
          `${offsetTimestamp(`${start}.${startMs}`, offsetMs)} --> ${offsetTimestamp(`${end}.${endMs}`, offsetMs)}`
      );
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  return `WEBVTT\n\n${body}\n`;
}

export function offsetVtt(input: string, offsetMs = 0): string {
  const normalized = input.trimStart().startsWith("WEBVTT") ? input : `WEBVTT\n\n${input}`;
  return normalized.replace(
    /(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})/g,
    (_match, start, end) => `${offsetTimestamp(start, offsetMs)} --> ${offsetTimestamp(end, offsetMs)}`
  );
}

function offsetTimestamp(timestamp: string, offsetMs: number): string {
  return formatTimestamp(Math.max(0, parseTimestamp(timestamp) + offsetMs));
}

function parseTimestamp(timestamp: string): number {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/.exec(timestamp);
  if (!match) {
    return 0;
  }

  const [, hours, minutes, seconds, milliseconds] = match;
  return (
    Number(hours) * 3_600_000 +
    Number(minutes) * 60_000 +
    Number(seconds) * 1_000 +
    Number(milliseconds)
  );
}

function formatTimestamp(totalMs: number): string {
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1_000);
  const milliseconds = Math.floor(totalMs % 1_000);

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${milliseconds.toString().padStart(3, "0")}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}


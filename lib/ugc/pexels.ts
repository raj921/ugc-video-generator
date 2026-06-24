import { fetchWithTimeout } from "./net";
import { unique } from "./text";
import type { MediaSelection } from "./types";
import { requiredEnv } from "./env";

type PexelsVideoFile = {
  width: number;
  height: number;
  file_type: string;
  link: string;
};

type PexelsVideo = {
  url: string;
  duration: number;
  user: { name: string };
  video_files: PexelsVideoFile[];
};

type PexelsSearchResponse = {
  videos: PexelsVideo[];
};

type ScoredCandidate = {
  file: PexelsVideoFile;
  video: PexelsVideo;
  score: number;
};

const TARGET_RATIO = 9 / 16;

export async function getPexelsVideo(
  query: string
): Promise<MediaSelection["backgroundVideos"][number]> {
  const result = await getPexelsVideos(query);
  return result[0];
}

export async function getPexelsVideos(
  query: string,
  count = 3
): Promise<MediaSelection["backgroundVideos"]> {
  const attempts = unique([
    query,
    "phone app vertical",
    "person using phone",
    "startup phone",
  ]);

  for (const attempt of attempts) {
    const params = new URLSearchParams({
      query: attempt,
      orientation: "portrait",
      per_page: "8",
    });

    const response = await fetchWithTimeout(
      `https://api.pexels.com/v1/videos/search?${params}`,
      {
        headers: {
          Authorization: requiredEnv("PEXELS_API_KEY"),
        },
      }
    );

    if (!response.ok) continue;

    const data = (await response.json()) as PexelsSearchResponse;
    const picks = pickPexelsFiles(data, count);
    if (picks.length > 0) return picks;
  }

  throw new Error("No Pexels background video found");
}

function pickPexelsFiles(
  data: PexelsSearchResponse,
  count: number
): MediaSelection["backgroundVideos"] {
  const videos = Array.isArray(data.videos) ? data.videos : [];

  const candidates: ScoredCandidate[] = videos.flatMap((video) =>
    video.video_files
      .filter(
        (file) =>
          file.file_type === "video/mp4" &&
          file.width &&
          file.height &&
          file.link
      )
      .map((file) => ({
        file,
        video,
        score: scoreCandidate(file, video),
      }))
  );

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => b.score - a.score);

  const pool = Math.min(candidates.length, Math.max(count, 3));
  const indices = shuffle(Array.from({ length: pool }, (_, i) => i));

  return indices.slice(0, Math.min(count, pool)).map((i) => ({
    url: candidates[i].file.link,
    width: candidates[i].file.width,
    height: candidates[i].file.height,
  }));
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function scoreCandidate(file: PexelsVideoFile, video: PexelsVideo): number {
  const ratio = file.width / file.height;
  const ratioFit = Math.abs(ratio - TARGET_RATIO);

  // Portrait orientation bonus
  const portraitBonus = file.height >= file.width ? 100 : 0;

  // Resolution quality: prefer 720-1080p, de-prioritize very low / very high
  const resolutionScore = (() => {
    if (file.height < 480) return 5;
    if (file.height <= 1080) return Math.min(file.height, 1920) / 20;
    return 40 - (file.height - 1080) / 80;
  })();

  // Clip long enough to cover a typical 7s render without a hard loop seam.
  // Pexels clips over ~12s are rare; reward 6s+ and penalize very short.
  const durationScore = (() => {
    if (!video.duration) return 0;
    if (video.duration >= 6) return 15;
    if (video.duration >= 4) return 8;
    return -10;
  })();

  return portraitBonus + resolutionScore - ratioFit * 50 + durationScore;
}

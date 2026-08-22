#!/usr/bin/env node
/**
 * Scrape a kwik.cx download page via ScrapingBee, save the download <form> HTML
 * to info/, resolve the direct video URL and download the file into vids/.
 *
 * Add URLs to `to_download` below and run `pnpm run music:scrape`.
 * For a one-off URL:
 *   pnpm run music:scrape -- https://kwik.cx/f/re24o8tskvwT
 * Add `--no-download` to only save info/ metadata.
 *
 * Output:
 *   info/<id>.html   the download form markup
 *   info/<id>.json   parsed action / _token / size / resolved video url
 *   vids/<filename>  the downloaded video
 */

import { createWriteStream } from "node:fs";
import { mkdir, writeFile, rename, stat, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { Client } from "discord.js-selfbot-v13";

const API_KEY = process.env.SCRAPINGBEE_API_KEY;

if (!API_KEY) {
  console.error("Missing SCRAPINGBEE_API_KEY. Add it to the environment before running.");
  process.exit(1);
}

const INFO_DIR = path.resolve(process.cwd(), "info");
const VIDS_DIR = path.resolve(process.cwd(), "vids");
const to_channel = "1540345417911242842";
const client = new Client();


/*
pnpm run music:scrape
*/

// URLs are processed in order, one at a time, when the script starts.
const to_download = [
   "https://kwik.cx/f/pKkQykaj84O2",
   "https://kwik.cx/f/Qjfd4HPR8OKc",
   "https://kwik.cx/f/tBCY77O1Shzc",
  "https://kwik.cx/f/mYLxlP3ZOrxf",
  "https://kwik.cx/f/J2E6SVsxYpM8",
  "https://kwik.cx/f/5rYCQXAfB7hM"
];

// kwik blocks datacenter IPs, so stealth_proxy is the only reliable route.
const PROXY_MODES = [{ stealth_proxy: "true" }, { premium_proxy: "true" }, {}];
const MAX_ATTEMPTS = 5;

function validateDownloadedVideo(videoPath) {
  const extension = path.extname(videoPath).toLowerCase();
  const validExtensions = new Set([".mp4", ".mkv", ".avi", ".webm"]);
  if (!validExtensions.has(extension)) {
    throw new Error(`Unsupported video file extension: ${extension || "(none)"}`);
  }
}

async function loginToDiscord() {
  const token = process.env.token;
  if (!token) {
    throw new Error("Missing token. Add the Discord selfbot token to the environment.");
  }

  await new Promise((resolve, reject) => {
    client.once("ready", () => {
      console.log(`[discord] Logged in as ${client.user.tag}`);
      resolve();
    });
    client.once("error", reject);
    client.login(token).catch(reject);
  });
}

async function postVideoToDiscord(videoPath, episodeNumber) {
  validateDownloadedVideo(videoPath);
  const file = await stat(videoPath);
  if (!file.isFile() || file.size === 0) {
    throw new Error(`Downloaded video is missing or empty: ${videoPath}`);
  }

  console.log(`[discord] Preparing upload: ${path.basename(videoPath)}`);
  console.log(`[discord] Fetching channel ${to_channel}`);
  const channel = await client.channels.fetch(to_channel);
  if (!channel || typeof channel.send !== "function") {
    throw new Error(`Channel ${to_channel} is not available for sending messages`);
  }

  const episodeLabel = `Episode ${String(episodeNumber).padStart(2, "0")}`;
  console.log(`[discord] Uploading ${(file.size / 1024 / 1024).toFixed(2)} MB as "${episodeLabel}"`);
  await channel.send({
    content: episodeLabel,
    files: [{ attachment: videoPath, name: path.basename(videoPath) }],
  });
  console.log(`[discord] Posted "${episodeLabel}" to channel ${to_channel}`);
}

function usage(msg) {
  throw new Error(
    `${msg}\nUsage: pnpm run music:scrape -- <kwik.cx url> [--no-download]`,
  );
}

function beeUrl(params) {
  const endpoint = new URL("https://app.scrapingbee.com/api/v1/");
  for (const [k, v] of Object.entries({ api_key: API_KEY, ...params })) {
    if (v !== undefined && v !== null && v !== "") endpoint.searchParams.set(k, String(v));
  }
  return endpoint;
}

/** GET a page through ScrapingBee, returning { html, cookies }. */
async function beeGet(url, { json = false } = {}) {
  let lastError;
  for (const proxy of PROXY_MODES) {
    const res = await fetch(
      beeUrl({
        url,
        render_js: "true",
        wait: "15000",
        wait_for: ".button",
        block_resources: "false",
        json_response: json ? "true" : undefined,
        ...proxy,
      }),
    );
    const body = await res.text();
    if (!res.ok) {
      lastError = `ScrapingBee GET failed [${res.status}] (${JSON.stringify(proxy)}): ${body.slice(0, 300)}`;
      console.warn(lastError);
      continue;
    }
    if (!json) return { html: body, cookies: [] };
    const data = JSON.parse(body);
    const html = typeof data.body === "string" ? data.body : "";
    return { html, cookies: data.cookies ?? [] };
  }
  throw new Error(lastError);
}

/** GET the embed player page through ScrapingBee, returning { html, xhr }. */
async function beeGetEmbed(url, cookies) {
  const cookieHeader = (cookies ?? []).map((c) => `${c.name}=${c.value}`).join(";");
  let lastError;
  for (const proxy of PROXY_MODES) {
    const res = await fetch(
      beeUrl({
        url,
        render_js: "true",
        wait: "10000",
        block_resources: "false",
        json_response: "true",
        cookies: cookieHeader || undefined,
        ...proxy,
      }),
    );
    const body = await res.text();
    if (!res.ok) {
      lastError = `ScrapingBee embed GET failed [${res.status}] (${JSON.stringify(proxy)}): ${body.slice(0, 300)}`;
      console.warn(lastError);
      continue;
    }
    const data = JSON.parse(body);
    return {
      html: typeof data.body === "string" ? data.body : "",
      xhr: data.xhr ?? [],
    };
  }
  throw new Error(lastError);
}

function extractForm(html) {
  const formMatch = html.match(
    /<form[^>]*action="https?:\/\/kwik\.[a-z.]+\/d\/[^"]+"[\s\S]*?<\/form>/i,
  );
  if (!formMatch) return null;
  const form = formMatch[0];
  const label =
    form
      .match(/<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]
      ?.replace(/&nbsp;/g, " ")
      .replace(/<[^>]+>/g, "")
      .trim() ?? null;
  return {
    html: form,
    action: form.match(/action="([^"]+)"/i)?.[1] ?? null,
    method: (form.match(/method="([^"]+)"/i)?.[1] ?? "POST").toUpperCase(),
    token: form.match(/name="_token"\s+value="([^"]*)"/i)?.[1] ?? null,
    label,
    size: label?.match(/\(([^)]+)\)/)?.[1] ?? null,
  };
}

function extractFilename(html) {
  return html.match(/<title>\s*([^<:]+?\.(?:mp4|mkv|avi|webm))\s*(?:::|<)/i)?.[1]?.trim() ?? null;
}

/** Decode the packed inline script used by kwik and return the embed URL. */
function extractEmbedUrl(html) {
  // First try the easy case: the URL is already visible in the rendered HTML.
  const plain = html.match(/['"](\/e\/[A-Za-z0-9]+\?autoplay=1)['"]/);
  if (plain) return new URL(plain[1], "https://kwik.cx").href;

  // Otherwise decode the packed script block that injects the player iframe.
  const scriptMatch = html.match(/<script>\s*(var _0x[\da-f]+=\["",\s*"split"[\s\S]*?)<\/script>/i);
  if (!scriptMatch) return null;

  const packed = scriptMatch[1];
  let decoded = "";
  const fakeEval = (code) => {
    decoded = code;
  };
  const fake$ = () => ({ on: () => {}, click: () => {}, remove: () => {}, html: () => ({}) });
  try {
    new Function("eval", "$", packed.replace(/^eval/, "return"))(fakeEval, fake$);
  } catch {
    return null;
  }

  const m = decoded.match(/url\s*=\s*['"](\/e\/[^'"]+)['"]/);
  if (m) return new URL(m[1], "https://kwik.cx").href;
  return null;
}

/** Find the direct media URL from the embed page's captured XHR or HTML. */
function extractVideoUrl(html, xhr) {
  // 1. XHR captures the actual HLS manifest request.
  const m3u8 = xhr.find((r) => /\.m3u8(\?|$)/i.test(r.url))?.url;
  if (m3u8) return m3u8;
  const mp4 = xhr.find((r) => /\.(mp4|mkv|avi|webm)(\?|$)/i.test(r.url))?.url;
  if (mp4) return mp4;

  // 2. Fallback to scanning the rendered HTML.
  const direct = html.match(
    /https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4|mkv|avi|webm)(?:\?[^\s"'<>\\]*)?/i,
  );
  if (direct) return direct[0].replace(/&amp;/g, "&");

  return null;
}

function sanitize(name) {
  return name.replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200);
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

/**
 * The CDN sits behind Cloudflare and rejects Node's and ffmpeg's TLS
 * fingerprints (403), so every media request goes through curl.
 */
function curlRun(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    let err = "";
    proc.stdout.on("data", (d) => out.push(d));
    proc.stderr.on("data", (d) => (err += d));
    proc.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`curl exited ${code}: ${err.slice(-300)}`)),
    );
    proc.on("error", reject);
  });
}

function curlGet(url, referer, extra = []) {
  return curlRun([
    "-sSL",
    "--fail",
    "--retry",
    "3",
    "--retry-delay",
    "1",
    "-H",
    `User-Agent: ${UA}`,
    "-H",
    `Referer: ${referer}`,
    ...extra,
    url,
  ]);
}

async function downloadDirectVideo(url, filename, referer) {
  await mkdir(VIDS_DIR, { recursive: true });
  const target = path.join(VIDS_DIR, sanitize(filename));
  const tmp = `${target}.part`;

  console.log(`[download] Starting direct video download`);
  console.log(`[download] Source: ${url}`);
  console.log(`[download] Destination: ${target}`);
  await curlGet(url, referer, ["-o", tmp, "--progress-bar"]);
  console.log(`[download] Download finished, finalizing file`);
  await rename(tmp, target);
  const { size } = await stat(target);
  console.log(`[download] Saved ${(size / 1024 / 1024).toFixed(2)} MB to ${target}`);
  return target;
}

async function downloadHlsVideo(m3u8Url, filename, referer) {
  await mkdir(VIDS_DIR, { recursive: true });
  const target = path.join(VIDS_DIR, sanitize(filename));
  const tsPath = `${target}.ts.part`;

  console.log(`[download] Starting HLS download`);
  console.log(`[download] Manifest: ${m3u8Url}`);
  console.log(`[download] Destination: ${target}`);

  console.log(`[download] Fetching HLS manifest`);
  const manifest = (await curlGet(m3u8Url, referer)).toString("utf8");
  const base = new URL(m3u8Url);
  const segments = manifest
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => new URL(l, base).href);
  if (!segments.length) throw new Error("HLS manifest contained no segments");
  console.log(`[download] HLS manifest contains ${segments.length} segment(s)`);

  const keyUri = manifest.match(/#EXT-X-KEY:[^\n]*URI="([^"]+)"/)?.[1];
  const ivHex = manifest.match(/#EXT-X-KEY:[^\n]*IV=0x([0-9a-fA-F]+)/)?.[1];
  const seq = Number(manifest.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1] ?? 0);
  const key = keyUri
    ? await (async () => {
        console.log(`[download] Fetching HLS encryption key`);
        return curlGet(new URL(keyUri, base).href, referer);
      })()
    : null;
  if (!key) console.log(`[download] HLS stream is not encrypted`);

  const out = createWriteStream(tsPath);
  const CONCURRENCY = 8;
  const buffers = new Array(segments.length);
  let done = 0;
  let cursor = 0;
  let nextWrite = 0;

  const flush = async () => {
    while (buffers[nextWrite]) {
      const chunk = buffers[nextWrite];
      buffers[nextWrite] = null;
      nextWrite++;
      if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
    }
  };

  const worker = async () => {
    while (cursor < segments.length) {
      const i = cursor++;
      let data = await curlGet(segments[i], referer);
      if (key) {
        const iv = Buffer.alloc(16);
        if (ivHex) Buffer.from(ivHex.padStart(32, "0"), "hex").copy(iv);
        else iv.writeUInt32BE(seq + i, 12);
        const decipher = createDecipheriv("aes-128-cbc", key, iv);
        decipher.setAutoPadding(false);
        data = Buffer.concat([decipher.update(data), decipher.final()]);
      }
      buffers[i] = data;
      done++;
      if (done % 10 === 0 || done === segments.length) {
        process.stdout.write(`\r[download] Segments ${done}/${segments.length}`);
      }
      await flush();
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await flush();
  await new Promise((r) => out.end(r));
  process.stdout.write("\n");
  console.log(`[download] All HLS segments assembled, remuxing with ffmpeg`);

  // Remux the concatenated MPEG-TS into a proper mp4 container.
  await new Promise((resolve, reject) => {
    const proc = spawn(
      "ffmpeg",
      ["-y", "-i", tsPath, "-c", "copy", "-bsf:a", "aac_adtstoasc", target],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`)),
    );
    proc.on("error", reject);
  });
  await rm(tsPath, { force: true });

  const { size } = await stat(target);
  console.log(`[download] Saved ${(size / 1024 / 1024).toFixed(2)} MB to ${target}`);
  return target;
}


async function scrapeAndDownload(url, noDownload, episodeNumber) {
  console.log(`[scrape] Validating URL`);
  if (!/^https?:\/\/kwik\.[a-z.]+\/f\/[A-Za-z0-9]+/i.test(url)) {
    usage("expected a url like https://kwik.cx/f/re24o8tskvwT");
  }

  const id = url.replace(/\/+$/, "").split("/").pop();
  console.log(`[scrape] Preparing output directories for ${id}`);
  await mkdir(INFO_DIR, { recursive: true });

  // 1. Load the file page until the (JS-injected) download form is present.
  let page = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[scrape] Fetching source page via ScrapingBee (attempt ${attempt}/${MAX_ATTEMPTS})`);
    const result = await beeGet(url, { json: true });
    if (extractForm(result.html)) {
      page = result;
      console.log(`[scrape] Download form found`);
      break;
    }
    console.warn("  download form not present yet (Cloudflare interstitial), retrying...");
  }
  if (!page) throw new Error("Could not load the kwik download form after several attempts");

  const form = extractForm(page.html);
  const filename = extractFilename(page.html) ?? `${id}.mp4`;
  console.log(`[scrape] Found file: ${filename}${form.size ? ` (${form.size})` : ""}`);

  // 2. Resolve the real video URL via the embed player page.
  let videoUrl = null;
  let embedPage = null;
  const embedUrl = extractEmbedUrl(page.html);
  if (embedUrl) {
    console.log(`[scrape] Loading embedded player`);
    embedPage = await beeGetEmbed(embedUrl, page.cookies);
    videoUrl = extractVideoUrl(embedPage.html, embedPage.xhr);
    console.log(videoUrl ? `[scrape] Media URL resolved` : "[scrape] Could not resolve a media URL");
  } else {
    console.warn("Could not find embed URL on the file page.");
  }

  // 3. Persist the scraped info.
  console.log(`[scrape] Writing metadata to info/`);
  await writeFile(path.join(INFO_DIR, `${id}.html`), form.html + "\n", "utf8");
  await writeFile(
    path.join(INFO_DIR, `${id}.json`),
    JSON.stringify(
      {
        source: url,
        scraped_at: new Date().toISOString(),
        filename,
        action: form.action,
        method: form.method,
        _token: form.token,
        label: form.label,
        size: form.size,
        embed_url: embedUrl,
        video_url: videoUrl,
        html: form.html,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`[scrape] Saved ${path.join(INFO_DIR, `${id}.html`)}`);
  console.log(`[scrape] Saved ${path.join(INFO_DIR, `${id}.json`)}`);

  if (embedPage && !videoUrl) {
    const dump = path.join(INFO_DIR, `${id}.embed-page.html`);
    await writeFile(dump, embedPage.html, "utf8");
    console.error(`Embed page saved to ${dump} for inspection`);
  }

  // 4. Download the video.
  if (noDownload) {
    console.log(`[scrape] Metadata-only mode enabled; download skipped`);
    return;
  }
  if (!videoUrl) {
    throw new Error("No video URL resolved");
  }

  console.log(`[scrape] Starting video download`);
  let downloadedPath;
  if (/\.m3u8(\?|$)/i.test(videoUrl)) {
    downloadedPath = await downloadHlsVideo(videoUrl, filename, embedUrl ?? url);
  } else {
    downloadedPath = await downloadDirectVideo(videoUrl, filename, embedUrl ?? url);
  }
  console.log(`[scrape] Valid video downloaded; sending to Discord`);
  await postVideoToDiscord(downloadedPath, episodeNumber);
  console.log(`[scrape] Completed ${url}`);
}

async function main() {
  const args = process.argv.slice(2);
  const noDownload = args.includes("--no-download");
  const commandLineUrls = args.filter((arg) => !arg.startsWith("--"));
  const urls = commandLineUrls.length ? commandLineUrls : to_download;

  if (!urls.length) {
    console.log("No URLs queued. Add kwik.cx URLs to the to_download array in index.js.");
    return;
  }

  console.log(`[queue] Found ${urls.length} URL(s); processing sequentially`);
  if (!noDownload) {
    console.log(`[discord] Connecting before processing the download queue`);
    await loginToDiscord();
  } else {
    console.log(`[discord] Metadata-only mode; Discord login skipped`);
  }

  let failed = 0;
  for (const [index, url] of urls.entries()) {
    console.log(`\n[queue] Starting ${index + 1}/${urls.length}: ${url}`);
    try {
      await scrapeAndDownload(url, noDownload, index + 1);
      console.log(`[queue] Finished ${index + 1}/${urls.length}`);
    } catch (err) {
      failed++;
      console.error(`Failed: ${err.message}`);
      console.error("Continuing with the next URL...");
    }
  }

  if (failed) {
    throw new Error(`${failed} of ${urls.length} download(s) failed`);
  }

  if (!noDownload) {
    console.log(`[queue] All videos posted successfully; deleting vids/`);
    await rm(VIDS_DIR, { recursive: true, force: true });
    console.log(`[queue] Deleted ${VIDS_DIR}`);
  }
  console.log(`[queue] All ${urls.length} URL(s) processed successfully`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

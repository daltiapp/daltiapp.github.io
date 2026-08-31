import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DRIVE_API_ORIGIN = "https://www.googleapis.com";
const DRIVE_VIEW_ORIGIN = "https://drive.google.com";
const MAX_IMAGE_FILES = 12;
const MAX_IMAGE_DIMENSION = 2400;
const WEBP_QUALITY = 88;

const MIME_EXTENSIONS = new Map([
  ["image/avif", "avif"],
  ["image/bmp", "bmp"],
  ["image/gif", "gif"],
  ["image/heic", "heic"],
  ["image/heif", "heif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/tiff", "tiff"],
  ["image/webp", "webp"]
]);

const EXTENSION_MIMES = new Map([
  [".avif", "image/avif"],
  [".bmp", "image/bmp"],
  [".gif", "image/gif"],
  [".heic", "image/heic"],
  [".heif", "image/heif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
  [".webp", "image/webp"]
]);

function configurationValue(explicitValue, environmentValue) {
  const explicit = String(explicitValue ?? "").trim();
  return explicit || String(environmentValue ?? "").trim();
}

function redact(value, accessToken = "") {
  let message = String(value ?? "");
  const token = String(accessToken || "");
  if (token) {
    message = message.split(token).join("[REDACTED]");
    const encodedToken = encodeURIComponent(token);
    if (encodedToken !== token) message = message.split(encodedToken).join("[REDACTED]");
  }
  return message
    .replace(/authorization["']?\s*[:=]\s*["']?[^,}\r\n]+/gi, "Authorization: [REDACTED]")
    .replace(/Bearer\s+[^\s,;"']+/gi, "Bearer [REDACTED]")
    .slice(0, 800);
}

function safeError(error, accessToken = "") {
  const rawMessage = error instanceof Error ? error.message : String(error || "알 수 없는 오류");
  return new Error(redact(rawMessage, accessToken));
}

function validateIdentifier(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 256 || !/^[0-9A-Za-z_-]+$/.test(normalized)) {
    throw new Error(`${label} 형식이 올바르지 않습니다.`);
  }
  return normalized;
}

function validateSourceId(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 128 || !/^[0-9A-Za-z_-]+$/.test(normalized)) {
    throw new Error("Google Drive 이미지 업로드에 필요한 sourceId 형식이 올바르지 않습니다.");
  }
  return normalized;
}

function validateAccount(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.startsWith("-") || normalized.length > 320 || /[\s\0]/.test(normalized)) {
    throw new Error("Google Drive 계정 형식이 올바르지 않습니다.");
  }
  return normalized;
}

function normalizeMimeType(value, filePath) {
  const supplied = String(value || "").split(";", 1)[0].trim().toLowerCase();
  const inferred = EXTENSION_MIMES.get(path.extname(filePath).toLowerCase()) || "";
  const mimeType = supplied || inferred;
  if (!mimeType.startsWith("image/") || !MIME_EXTENSIONS.has(mimeType)) {
    throw new Error(`지원하는 이미지 MIME 형식이 아닙니다: ${mimeType || "unknown"}`);
  }
  return mimeType;
}

function normalizeFileInput(value) {
  if (typeof value === "string") return { filePath: value, mimeType: "", expectedSha256: "", compress: true };
  if (!value || typeof value !== "object") {
    throw new Error("Google Drive 업로드 파일 정보가 올바르지 않습니다.");
  }
  return {
    filePath: value.path || value.localPath || "",
    mimeType: value.mimeType || value.contentType || "",
    expectedSha256: value.sha256 || "",
    compress: value.compress !== false
  };
}

async function compressToWebp(filePath, sourceMimeType, options = {}) {
  if (options.compress === false || sourceMimeType === "image/gif" || sourceMimeType === "image/heic" || sourceMimeType === "image/heif") {
    return null;
  }
  const env = options.env || process.env;
  const cwebpBin = String(env.DALTI_CWEBP_BIN || "cwebp").trim() || "cwebp";
  const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "dalti-kau-image-"));
  const resizedPath = path.join(tempDirectory, `source${path.extname(filePath).toLowerCase() || ".img"}`);
  const outputPath = path.join(tempDirectory, "compressed.webp");
  try {
    let inputPath = filePath;
    if (sourceMimeType !== "image/webp") {
      await execFileAsync("sips", ["-Z", String(MAX_IMAGE_DIMENSION), filePath, "--out", resizedPath], {
        encoding: "utf8", maxBuffer: 64 * 1024, timeout: 30_000, windowsHide: true
      });
      inputPath = resizedPath;
    }
    await execFileAsync(cwebpBin, ["-quiet", "-q", String(WEBP_QUALITY), "-m", "6", inputPath, "-o", outputPath], {
      encoding: "utf8", maxBuffer: 64 * 1024, timeout: 60_000, windowsHide: true
    });
    const bytes = await fs.readFile(outputPath);
    if (!bytes.length) return null;
    return { bytes, mimeType: "image/webp", compressed: true };
  } catch {
    return null;
  } finally {
    await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function prepareImageFile(value, sourceId) {
  const input = normalizeFileInput(value);
  const filePath = String(input.filePath || "").trim();
  if (!filePath) throw new Error("Google Drive 업로드 이미지 경로가 없습니다.");

  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    throw new Error(`Google Drive 업로드 이미지 파일을 찾을 수 없습니다: ${filePath}`);
  }
  if (!stats.isFile()) throw new Error(`Google Drive 업로드 대상이 파일이 아닙니다: ${filePath}`);
  if (stats.size <= 0) throw new Error(`빈 이미지 파일은 업로드할 수 없습니다: ${filePath}`);

  const mimeType = normalizeMimeType(input.mimeType, filePath);
  const bytes = await fs.readFile(filePath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (input.expectedSha256) {
    const expectedSha256 = String(input.expectedSha256).trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expectedSha256) || expectedSha256 !== sha256) {
      throw new Error(`이미지 SHA-256 검증에 실패했습니다: ${filePath}`);
    }
  }

  const compressed = await compressToWebp(filePath, mimeType, input);
  const uploadBytes = compressed?.bytes || bytes;
  const uploadMimeType = compressed?.mimeType || mimeType;
  const uploadSha256 = crypto.createHash("sha256").update(uploadBytes).digest("hex");
  const extension = MIME_EXTENSIONS.get(uploadMimeType);
  return {
    bytes: uploadBytes,
    filePath,
    mimeType: uploadMimeType,
    sourceId,
    sourceSha256: sha256,
    sha256: uploadSha256,
    compressed: Boolean(compressed?.compressed),
    filename: `kau-${sourceId}-${uploadSha256}.${extension}`
  };
}

export function validateGoogleDriveApiUrl(value) {
  let target;
  try {
    target = new URL(String(value || ""));
  } catch {
    throw new Error("Google Drive API 주소 형식이 올바르지 않습니다.");
  }
  const allowedPath = target.pathname === "/drive/v3/files"
    || target.pathname.startsWith("/drive/v3/files/")
    || target.pathname === "/upload/drive/v3/files";
  if (
    target.protocol !== "https:"
    || target.hostname !== "www.googleapis.com"
    || target.username
    || target.password
    || !allowedPath
    || target.searchParams.has("access_token")
  ) {
    throw new Error("허용되지 않은 Google Drive API 주소입니다.");
  }
  return target;
}

function driveApiUrl(pathname, searchParams = {}) {
  const target = new URL(pathname, DRIVE_API_ORIGIN);
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      target.searchParams.set(key, String(value));
    }
  }
  return validateGoogleDriveApiUrl(target);
}

async function readApiResponse(response, operation, accessToken) {
  if (!response || typeof response.status !== "number") {
    throw new Error(`Google Drive ${operation} 응답이 올바르지 않습니다.`);
  }
  if (response.redirected || (response.status >= 300 && response.status < 400)) {
    throw new Error(`Google Drive ${operation} 요청에서 리디렉션을 거부했습니다.`);
  }
  if (response.url) validateGoogleDriveApiUrl(response.url);

  let responseText = "";
  try {
    responseText = await response.text();
  } catch {
    throw new Error(`Google Drive ${operation} 응답을 읽지 못했습니다.`);
  }

  let payload = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      if (response.ok) throw new Error(`Google Drive ${operation} 응답 JSON이 올바르지 않습니다.`);
    }
  }
  if (!response.ok) {
    const apiMessage = payload?.error?.message ? `: ${payload.error.message}` : "";
    throw new Error(redact(`Google Drive ${operation} 실패 (${response.status})${apiMessage}`, accessToken));
  }
  return payload;
}

async function driveFetch(fetchImpl, target, init, operation, accessToken) {
  const validatedTarget = validateGoogleDriveApiUrl(target);
  let response;
  try {
    response = await fetchImpl(validatedTarget, {
      ...init,
      redirect: "manual",
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch (error) {
    throw new Error(redact(
      `Google Drive ${operation} 요청 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`,
      accessToken
    ));
  }
  return readApiResponse(response, operation, accessToken);
}

async function defaultExecFileImpl(command, args, options) {
  return execFileAsync(command, args, options);
}

export async function getGoogleDriveAccessToken({ accessToken, account } = {}, options = {}) {
  const injectedToken = String(accessToken || "").trim();
  if (injectedToken) {
    if (/\s/.test(injectedToken)) throw new Error("주입된 Google access token 형식이 올바르지 않습니다.");
    return injectedToken;
  }

  const env = options.env || process.env;
  const selectedAccount = validateAccount(configurationValue(account, env.DALTI_GDRIVE_ACCOUNT));
  const configuredGcloudBin = String(env.DALTI_GCLOUD_BIN || "").trim();
  if (configuredGcloudBin && (!path.isAbsolute(configuredGcloudBin) || configuredGcloudBin.includes("\0"))) {
    throw new Error("DALTI_GCLOUD_BIN은 절대경로여야 합니다.");
  }
  const gcloudBin = configuredGcloudBin || "gcloud";
  const args = ["auth", "print-access-token"];
  if (selectedAccount) args.push(selectedAccount);
  const execFileImpl = options.execFileImpl || defaultExecFileImpl;

  let result;
  try {
    result = await execFileImpl(gcloudBin, args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      timeout: 30_000,
      windowsHide: true
    });
  } catch {
    throw new Error("gcloud에서 Google access token을 가져오지 못했습니다.");
  }
  const token = String(typeof result === "string" ? result : result?.stdout || "").trim();
  if (!token || token.length > 16_384 || /\s/.test(token)) {
    throw new Error("gcloud가 유효한 Google access token을 반환하지 않았습니다.");
  }
  return token;
}

function escapeDriveQueryLiteral(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findExistingFile({ filename, folderId, fetchImpl, accessToken }) {
  const query = `'${escapeDriveQueryLiteral(folderId)}' in parents and name = '${escapeDriveQueryLiteral(filename)}' and trashed = false`;
  const target = driveApiUrl("/drive/v3/files", {
    q: query,
    spaces: "drive",
    pageSize: 100,
    fields: "files(id,name,mimeType,parents)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true
  });
  const payload = await driveFetch(fetchImpl, target, { method: "GET" }, "파일 검색", accessToken);
  if (!Array.isArray(payload.files)) throw new Error("Google Drive 파일 검색 응답에 files 배열이 없습니다.");
  const matches = payload.files
    .filter(file => file?.name === filename && file?.id)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (!matches.length) return null;
  return { ...matches[0], id: validateIdentifier(matches[0].id, "Google Drive 파일 ID") };
}

function multipartBody(image, folderId) {
  const boundary = `dalti_${image.sha256.slice(0, 32)}`;
  const metadata = Buffer.from(JSON.stringify({
    name: image.filename,
    parents: [folderId],
    appProperties: {
      daltiSourceId: image.sourceId,
      daltiSha256: image.sha256
    }
  }));
  const prefix = Buffer.from([
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata.toString("utf8"),
    `--${boundary}`,
    `Content-Type: ${image.mimeType}`,
    "Content-Transfer-Encoding: binary",
    "",
    ""
  ].join("\r\n"));
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([prefix, image.bytes, suffix]),
    contentType: `multipart/related; boundary=${boundary}`
  };
}

async function uploadFile({ image, folderId, fetchImpl, accessToken }) {
  const multipart = multipartBody(image, folderId);
  const target = driveApiUrl("/upload/drive/v3/files", {
    uploadType: "multipart",
    fields: "id,name,mimeType,parents",
    supportsAllDrives: true
  });
  const payload = await driveFetch(fetchImpl, target, {
    method: "POST",
    headers: { "Content-Type": multipart.contentType },
    body: multipart.body
  }, "파일 업로드", accessToken);
  return {
    ...payload,
    id: validateIdentifier(payload?.id, "Google Drive 파일 ID")
  };
}

async function hasAnyoneReaderPermission({ fileId, fetchImpl, accessToken }) {
  let pageToken = "";
  const seenPageTokens = new Set();
  do {
    const target = driveApiUrl(`/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
      pageSize: 100,
      pageToken,
      fields: "nextPageToken,permissions(id,type,role)",
      supportsAllDrives: true
    });
    const payload = await driveFetch(fetchImpl, target, { method: "GET" }, "공개 권한 확인", accessToken);
    if (!Array.isArray(payload.permissions)) {
      throw new Error("Google Drive 권한 응답에 permissions 배열이 없습니다.");
    }
    if (payload.permissions.some(permission => permission?.type === "anyone" && permission?.role === "reader")) {
      return true;
    }
    pageToken = String(payload.nextPageToken || "");
    if (pageToken && seenPageTokens.has(pageToken)) {
      throw new Error("Google Drive 권한 페이지 토큰이 반복되었습니다.");
    }
    if (pageToken) seenPageTokens.add(pageToken);
  } while (pageToken);
  return false;
}

async function createAnyoneReaderPermission({ fileId, fetchImpl, accessToken }) {
  const target = driveApiUrl(`/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
    fields: "id,type,role",
    supportsAllDrives: true
  });
  await driveFetch(fetchImpl, target, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ type: "anyone", role: "reader" })
  }, "공개 권한 생성", accessToken);
}

function publicViewUrl(fileId) {
  const target = new URL("/uc", DRIVE_VIEW_ORIGIN);
  target.searchParams.set("export", "view");
  target.searchParams.set("id", validateIdentifier(fileId, "Google Drive 파일 ID"));
  return target.toString();
}

async function uploadGoogleDriveImagesInternal(request = {}, options = {}) {
  const env = options.env || process.env;
  const sourceId = validateSourceId(request.sourceId);
  const folderId = validateIdentifier(
    configurationValue(request.folderId, env.DALTI_KAU_DRIVE_FOLDER_ID),
    "Google Drive 폴더 ID"
  );
  if (!Array.isArray(request.files)) throw new Error("Google Drive 업로드 files 배열이 필요합니다.");
  if (request.files.length > MAX_IMAGE_FILES) {
    throw new Error(`Google Drive 이미지는 한 번에 ${MAX_IMAGE_FILES}개까지만 업로드할 수 있습니다.`);
  }

  const images = [];
  for (const file of request.files) images.push(await prepareImageFile(file, sourceId));
  if (!images.length) return { urls: [], files: [] };

  let accessToken = "";
  try {
    accessToken = await getGoogleDriveAccessToken({
      accessToken: request.accessToken,
      account: request.account
    }, options);
    const fetchImpl = options.fetchImpl || fetch;
    const completedByFilename = new Map();
    const urls = [];
    const files = [];

    for (const image of images) {
      let completed = completedByFilename.get(image.filename);
      if (!completed) {
        const existing = await findExistingFile({
          filename: image.filename,
          folderId,
          fetchImpl,
          accessToken
        });
        const driveFile = existing || await uploadFile({
          image,
          folderId,
          fetchImpl,
          accessToken
        });
        const hasPermission = await hasAnyoneReaderPermission({
          fileId: driveFile.id,
          fetchImpl,
          accessToken
        });
        if (!hasPermission) {
          await createAnyoneReaderPermission({
            fileId: driveFile.id,
            fetchImpl,
            accessToken
          });
        }
        completed = {
          fileId: driveFile.id,
          filename: image.filename,
          mimeType: image.mimeType,
          sha256: image.sha256,
          sourceSha256: image.sourceSha256,
          compressed: image.compressed,
          reused: Boolean(existing),
          permissionCreated: !hasPermission,
          url: publicViewUrl(driveFile.id)
        };
        completedByFilename.set(image.filename, completed);
      }
      urls.push(completed.url);
      files.push({ ...completed, path: image.filePath });
    }
    return { urls, files };
  } catch (error) {
    throw safeError(error, accessToken || request.accessToken);
  }
}

export async function uploadGoogleDriveImages(request = {}, options = {}) {
  try {
    return await uploadGoogleDriveImagesInternal(request, options);
  } catch (error) {
    throw safeError(error, request?.accessToken);
  }
}

export async function uploadGoogleDriveImageUrls(request = {}, options = {}) {
  const result = await uploadGoogleDriveImages(request, options);
  return result.urls;
}

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getGoogleDriveAccessToken,
  uploadGoogleDriveImageUrls,
  uploadGoogleDriveImages,
  validateGoogleDriveApiUrl
} from "../google-drive-upload.mjs";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function imageFixture(extension = "jpg", bytes = Buffer.from("dalti-poster-image")) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dalti-drive-upload-"));
  const filePath = path.join(directory, `poster.${extension}`);
  await fs.writeFile(filePath, bytes);
  return {
    bytes,
    directory,
    filePath,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
}

test("새 이미지는 결정적 이름으로 multipart 업로드하고 공개 URL을 반환한다", async () => {
  const fixture = await imageFixture();
  const calls = [];
  const accessToken = "success-secret-access-token";
  const responses = [
    { files: [] },
    { id: "driveFile123", name: "uploaded" },
    { permissions: [] },
    { id: "permission123", type: "anyone", role: "reader" }
  ];
  const fetchImpl = async (target, init) => {
    calls.push({ target: target.toString(), init });
    return jsonResponse(responses[calls.length - 1]);
  };

  try {
    const result = await uploadGoogleDriveImages({
      sourceId: "kau123",
      folderId: "folder_123",
      account: "owner@example.com",
      accessToken,
      files: [{ path: fixture.filePath, sha256: fixture.sha256, mimeType: "image/jpeg" }]
    }, {
      fetchImpl,
      execFileImpl: async () => {
        throw new Error("주입 토큰이 있으면 gcloud를 실행하면 안 됩니다.");
      }
    });

    const filename = `kau-kau123-${fixture.sha256}.jpg`;
    assert.deepEqual(result.urls, ["https://drive.google.com/uc?export=view&id=driveFile123"]);
    assert.equal(result.files[0].filename, filename);
    assert.equal(result.files[0].reused, false);
    assert.equal(result.files[0].permissionCreated, true);
    assert.deepEqual(calls.map(call => call.init.method), ["GET", "POST", "GET", "POST"]);

    for (const call of calls) {
      const target = new URL(call.target);
      assert.equal(target.protocol, "https:");
      assert.equal(target.hostname, "www.googleapis.com");
      assert.equal(target.searchParams.has("access_token"), false);
      assert.equal(new Headers(call.init.headers).get("authorization"), `Bearer ${accessToken}`);
    }
    assert.match(calls[0].target, /\/drive\/v3\/files\?/);
    assert.match(new URL(calls[0].target).searchParams.get("q"), new RegExp(filename));
    assert.match(calls[1].target, /\/upload\/drive\/v3\/files\?/);
    assert.match(new Headers(calls[1].init.headers).get("content-type"), /^multipart\/related; boundary=/);
    assert.ok(Buffer.isBuffer(calls[1].init.body));
    assert.ok(calls[1].init.body.includes(Buffer.from(filename)));
    assert.ok(calls[1].init.body.includes(fixture.bytes));
    assert.deepEqual(JSON.parse(calls[3].init.body), { type: "anyone", role: "reader" });
  } finally {
    await fs.rm(fixture.directory, { recursive: true, force: true });
  }
});

test("같은 sourceId와 SHA 파일은 기존 Drive 파일과 anyone/reader 권한을 재사용한다", async () => {
  const fixture = await imageFixture("png");
  const calls = [];
  const fetchImpl = async (target, init) => {
    calls.push({ target: target.toString(), init });
    if (calls.length === 1) {
      return jsonResponse({
        files: [{ id: "existingFile123", name: `kau-source_9-${fixture.sha256}.png`, mimeType: "image/png" }]
      });
    }
    return jsonResponse({ permissions: [{ id: "public123", type: "anyone", role: "reader" }] });
  };

  try {
    const urls = await uploadGoogleDriveImageUrls({
      sourceId: "source_9",
      folderId: "folder_123",
      accessToken: "reuse-secret-token",
      files: [{ path: fixture.filePath, mimeType: "image/png" }]
    }, { fetchImpl });

    assert.deepEqual(urls, ["https://drive.google.com/uc?export=view&id=existingFile123"]);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(call => call.init.method), ["GET", "GET"]);
    assert.ok(calls.every(call => !call.target.includes("upload/drive")));
  } finally {
    await fs.rm(fixture.directory, { recursive: true, force: true });
  }
});

test("기존 파일에 anyone/reader가 없을 때만 공개 읽기 권한을 만든다", async () => {
  const fixture = await imageFixture();
  const calls = [];
  const responses = [
    { files: [{ id: "privateFile123", name: `kau-source10-${fixture.sha256}.jpg` }] },
    { permissions: [{ id: "userPermission", type: "user", role: "reader" }] },
    { id: "anyonePermission", type: "anyone", role: "reader" }
  ];
  const fetchImpl = async (target, init) => {
    calls.push({ target: target.toString(), init });
    return jsonResponse(responses[calls.length - 1]);
  };

  try {
    const result = await uploadGoogleDriveImages({
      sourceId: "source10",
      folderId: "folder_123",
      accessToken: "permission-secret-token",
      files: [fixture.filePath]
    }, { fetchImpl });

    assert.equal(result.files[0].reused, true);
    assert.equal(result.files[0].permissionCreated, true);
    assert.deepEqual(calls.map(call => call.init.method), ["GET", "GET", "POST"]);
    assert.match(calls[2].target, /\/drive\/v3\/files\/privateFile123\/permissions/);
    assert.deepEqual(JSON.parse(calls[2].init.body), { type: "anyone", role: "reader" });
  } finally {
    await fs.rm(fixture.directory, { recursive: true, force: true });
  }
});

test("gcloud 토큰은 지정 계정 stdout에서만 받고 API 오류에 토큰·Authorization을 노출하지 않는다", async () => {
  const fixture = await imageFixture();
  const secret = "never-print-this-access-token";
  let invocation;
  let requestedUrl;
  const execFileImpl = async (command, args, options) => {
    invocation = { command, args, options };
    return { stdout: `${secret}\n`, stderr: "" };
  };
  const fetchImpl = async (target, init) => {
    requestedUrl = target.toString();
    const authorization = new Headers(init.headers).get("authorization");
    return jsonResponse({
      error: { message: `invalid token ${secret}; Authorization: ${authorization}` }
    }, 401);
  };

  try {
    await assert.rejects(
      uploadGoogleDriveImages({
        sourceId: "source11",
        files: [{ path: fixture.filePath, mimeType: "image/jpeg" }]
      }, {
        env: {
          DALTI_GCLOUD_BIN: "/opt/google-cloud-sdk/bin/gcloud",
          DALTI_GDRIVE_ACCOUNT: "drive-owner@example.com",
          DALTI_KAU_DRIVE_FOLDER_ID: "folder_env_123"
        },
        execFileImpl,
        fetchImpl
      }),
      error => {
        assert.doesNotMatch(error.message, new RegExp(secret));
        assert.doesNotMatch(error.message, /Authorization:\s*Bearer/i);
        assert.match(error.message, /Google Drive 파일 검색 실패 \(401\)/);
        return true;
      }
    );
    assert.equal(invocation.command, "/opt/google-cloud-sdk/bin/gcloud");
    assert.deepEqual(invocation.args, ["auth", "print-access-token", "drive-owner@example.com"]);
    assert.equal(invocation.options.encoding, "utf8");
    assert.equal(new URL(requestedUrl).searchParams.has("access_token"), false);
  } finally {
    await fs.rm(fixture.directory, { recursive: true, force: true });
  }
});

test("파일·MIME·SHA와 Drive API 호스트를 업로드 전에 검증한다", async () => {
  const fixture = await imageFixture("txt");
  let fetchCount = 0;
  const options = { fetchImpl: async () => { fetchCount += 1; } };
  try {
    await assert.rejects(
      uploadGoogleDriveImages({
        sourceId: "source12",
        folderId: "folder_123",
        accessToken: "validation-secret-token",
        files: [{ path: fixture.filePath, mimeType: "text/plain" }]
      }, options),
      /이미지 MIME/
    );
    await assert.rejects(
      uploadGoogleDriveImages({
        sourceId: "source12",
        folderId: "folder_123",
        accessToken: "validation-secret-token",
        files: [{ path: path.join(fixture.directory, "missing.jpg"), mimeType: "image/jpeg" }]
      }, options),
      /찾을 수 없습니다/
    );
    await assert.rejects(
      uploadGoogleDriveImages({
        sourceId: "source12",
        folderId: "folder_123",
        accessToken: "validation-secret-token",
        files: [{
          path: fixture.filePath,
          mimeType: "image/jpeg",
          sha256: "0".repeat(64)
        }]
      }, options),
      /SHA-256 검증/
    );
    assert.throws(() => validateGoogleDriveApiUrl("http://www.googleapis.com/drive/v3/files"), /허용되지 않은/);
    assert.throws(() => validateGoogleDriveApiUrl("https://evil.example/drive/v3/files"), /허용되지 않은/);
    assert.throws(
      () => validateGoogleDriveApiUrl("https://www.googleapis.com/drive/v3/files?access_token=secret"),
      /허용되지 않은/
    );
    assert.equal(fetchCount, 0);
  } finally {
    await fs.rm(fixture.directory, { recursive: true, force: true });
  }
});

test("DALTI_GCLOUD_BIN 상대경로와 Drive API 리디렉션을 거부한다", async () => {
  const fixture = await imageFixture();
  try {
    await assert.rejects(
      uploadGoogleDriveImages({
        sourceId: "source13",
        folderId: "folder_123",
        files: [fixture.filePath]
      }, {
        env: { DALTI_GCLOUD_BIN: "bin/gcloud" },
        execFileImpl: async () => ({ stdout: "unused" })
      }),
      /절대경로/
    );

    await assert.rejects(
      uploadGoogleDriveImages({
        sourceId: "source13",
        folderId: "folder_123",
        accessToken: "redirect-secret-token",
        files: [fixture.filePath]
      }, {
        fetchImpl: async () => ({
          status: 302,
          ok: false,
          redirected: false,
          url: "https://evil.example/redirect",
          text: async () => ""
        })
      }),
      /리디렉션을 거부/
    );
  } finally {
    await fs.rm(fixture.directory, { recursive: true, force: true });
  }
});

test("DALTI_GCLOUD_BIN이 없으면 셸 없이 gcloud 실행 파일을 직접 호출한다", async () => {
  let invocation;
  const token = await getGoogleDriveAccessToken({}, {
    env: { DALTI_GDRIVE_ACCOUNT: "fallback@example.com" },
    execFileImpl: async (command, args) => {
      invocation = { command, args };
      return { stdout: "fallback-access-token\n" };
    }
  });
  assert.equal(token, "fallback-access-token");
  assert.deepEqual(invocation, {
    command: "gcloud",
    args: ["auth", "print-access-token", "fallback@example.com"]
  });
});

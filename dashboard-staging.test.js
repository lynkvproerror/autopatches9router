"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");

const bootstrapPath = path.join(__dirname, "automation", "dashboard-staging-server.js");

function loadBootstrap() {
    assert.ok(
        fs.existsSync(bootstrapPath),
        "automation/dashboard-staging-server.js must provide the isolated dashboard gateway",
    );
    delete require.cache[require.resolve(bootstrapPath)];
    return require(bootstrapPath);
}

function getContract() {
    const bootstrap = loadBootstrap();
    const classifyRequest = bootstrap.classifyDashboardStagingRequest ?? bootstrap.classifyRequest;
    const createHandler = bootstrap.createDashboardStagingHandler;

    assert.equal(typeof classifyRequest, "function", "bootstrap must export a request classifier");
    assert.equal(typeof createHandler, "function", "bootstrap must export createDashboardStagingHandler");
    return { classifyRequest, createHandler };
}

async function listen(server) {
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    return server.address().port;
}

async function close(server) {
    if (!server.listening) return;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function request({ port, path: requestPath, method = "GET", headers = {}, body }) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: "127.0.0.1",
            port,
            path: requestPath,
            method,
            headers,
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString("utf8"),
            }));
        });
        req.on("error", reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

test("request classifier keeps UI local, proxies control API, and blocks model API aliases", () => {
    const { classifyRequest } = getContract();

    for (const requestPath of ["/", "/dashboard/quota", "/_next/static/chunks/app.js"]) {
        assert.equal(classifyRequest(requestPath), "local", `${requestPath} must stay on dashboard 20128`);
    }
    for (const requestPath of ["/api/health", "/api/providers", "/api/oauth/codex/bulk-import?dryRun=1"]) {
        assert.equal(classifyRequest(requestPath), "proxy", `${requestPath} must use API 53220`);
    }
    for (const requestPath of [
        "/v1",
        "/v1/models",
        "/v1beta/models",
        "/responses",
        "/codex/session",
        "/api/v1/responses",
        "/api/version/update",
        "/api/version/shutdown",
        "/api/shutdown",
    ]) {
        assert.equal(classifyRequest(requestPath), "blocked", `${requestPath} must not reach either service`);
    }
});

test("dashboard UI requests are handled locally instead of reaching API 53220", async () => {
    const { createHandler } = getContract();
    let apiHits = 0;
    const apiServer = http.createServer((_req, res) => {
        apiHits += 1;
        res.end("unexpected-api-hit");
    });
    const apiPort = await listen(apiServer);
    const stageServer = http.createServer(createHandler({
        apiOrigin: `http://127.0.0.1:${apiPort}`,
        dashboardHandler: (req, res) => {
            res.statusCode = 200;
            res.setHeader("content-type", "text/plain");
            res.end(`local-ui:${req.url}`);
        },
    }));
    const stagePort = await listen(stageServer);

    try {
        const response = await request({ port: stagePort, path: "/dashboard/quota?patched=1" });
        assert.equal(response.statusCode, 200);
        assert.equal(response.body, "local-ui:/dashboard/quota?patched=1");
        assert.equal(apiHits, 0);
    } finally {
        await close(stageServer);
        await close(apiServer);
    }
});

test("dashboard health endpoint bypasses login redirects and both backends", async () => {
    const { createHandler } = getContract();
    let apiHits = 0;
    let dashboardHits = 0;
    const apiServer = http.createServer((_req, res) => {
        apiHits += 1;
        res.end("unexpected-api-hit");
    });
    const apiPort = await listen(apiServer);
    const stageServer = http.createServer(createHandler({
        apiOrigin: `http://127.0.0.1:${apiPort}`,
        releaseId: "release-health-test",
        dashboardHandler: (_req, res) => {
            dashboardHits += 1;
            res.statusCode = 302;
            res.setHeader("location", "/login");
            res.end();
        },
    }));
    const stagePort = await listen(stageServer);

    try {
        const response = await request({ port: stagePort, path: "/_9router/dashboard-health" });
        assert.equal(response.statusCode, 200);
        assert.equal(response.headers["x-9router-role"], "dashboard");
        assert.equal(response.headers["x-9router-dashboard-release"], "release-health-test");
        assert.deepEqual(JSON.parse(response.body), {
            ok: true,
            role: "dashboard",
            releaseId: "release-health-test",
        });
        assert.equal(apiHits, 0);
        assert.equal(dashboardHits, 0);
    } finally {
        await close(stageServer);
        await close(apiServer);
    }
});

test("safe API calls proxy request and stream the backend response without buffering", async () => {
    const { createHandler } = getContract();
    let backendRequest;
    let backendFinished = false;
    const apiServer = http.createServer((req, res) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            backendRequest = {
                method: req.method,
                url: req.url,
                body: Buffer.concat(chunks).toString("utf8"),
            };
            res.statusCode = 207;
            res.setHeader("content-type", "text/plain");
            res.setHeader("x-proxied-by", "fake-api-53220");
            res.flushHeaders();
            res.write("first-");
            setTimeout(() => {
                backendFinished = true;
                res.end("second");
            }, 80);
        });
    });
    const apiPort = await listen(apiServer);
    const stageServer = http.createServer(createHandler({
        apiOrigin: `http://127.0.0.1:${apiPort}`,
        dashboardHandler: (_req, res) => {
            res.statusCode = 500;
            res.end("API request incorrectly handled by dashboard");
        },
    }));
    const stagePort = await listen(stageServer);

    try {
        let firstChunkArrivedBeforeBackendEnd = false;
        const response = await new Promise((resolve, reject) => {
            const req = http.request({
                host: "127.0.0.1",
                port: stagePort,
                path: "/api/providers?include=quota",
                method: "POST",
                headers: { "content-type": "application/json" },
            }, (res) => {
                const chunks = [];
                res.on("data", (chunk) => {
                    if (chunks.length === 0) firstChunkArrivedBeforeBackendEnd = !backendFinished;
                    chunks.push(chunk);
                });
                res.on("end", () => resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString("utf8"),
                }));
            });
            req.on("error", reject);
            req.end('{"account":"demo"}');
        });

        assert.deepEqual(backendRequest, {
            method: "POST",
            url: "/api/providers?include=quota",
            body: '{"account":"demo"}',
        });
        assert.equal(response.statusCode, 207);
        assert.equal(response.headers["x-proxied-by"], "fake-api-53220");
        assert.equal(response.body, "first-second");
        assert.equal(firstChunkArrivedBeforeBackendEnd, true, "proxy buffered the backend stream");
    } finally {
        await close(stageServer);
        await close(apiServer);
    }
});

test("closing a dashboard SSE response closes the API upstream request", async () => {
    const { createHandler } = getContract();
    let upstreamClosed = false;
    let resolveUpstreamClosed;
    const upstreamClosedPromise = new Promise((resolve) => {
        resolveUpstreamClosed = resolve;
    });
    const apiServer = http.createServer((req, res) => {
        req.once("close", () => {
            upstreamClosed = true;
            resolveUpstreamClosed();
        });
        res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
        });
        res.write("data: {\"ok\":true}\n\n");
    });
    const apiPort = await listen(apiServer);
    const stageServer = http.createServer(createHandler({
        apiOrigin: `http://127.0.0.1:${apiPort}`,
        dashboardHandler: (_req, res) => res.end("unexpected-dashboard-hit"),
    }));
    const stagePort = await listen(stageServer);

    try {
        await new Promise((resolve, reject) => {
            const req = http.request({
                host: "127.0.0.1",
                port: stagePort,
                path: "/api/usage/stream",
                headers: { accept: "text/event-stream" },
            }, (res) => {
                res.once("data", () => {
                    res.destroy();
                    resolve();
                });
                res.once("error", () => resolve());
                res.once("aborted", () => resolve());
            });
            req.once("error", reject);
            req.end();
        });

        await Promise.race([
            upstreamClosedPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("API upstream remained open after dashboard response closed")), 500)),
        ]);
        assert.equal(upstreamClosed, true);
    } finally {
        stageServer.closeAllConnections();
        apiServer.closeAllConnections();
        await close(stageServer);
        await close(apiServer);
    }
});

test("blocked API and shutdown paths reach neither dashboard nor API backend", async () => {
    const { createHandler } = getContract();
    let apiHits = 0;
    let dashboardHits = 0;
    const apiServer = http.createServer((_req, res) => {
        apiHits += 1;
        res.end("unexpected-api-hit");
    });
    const apiPort = await listen(apiServer);
    const stageServer = http.createServer(createHandler({
        apiOrigin: `http://127.0.0.1:${apiPort}`,
        dashboardHandler: (_req, res) => {
            dashboardHits += 1;
            res.end("unexpected-dashboard-hit");
        },
    }));
    const stagePort = await listen(stageServer);

    try {
        for (const requestPath of [
            "/v1/models",
            "/v1beta/models",
            "/responses",
            "/codex/request",
            "/api/v1/responses",
            "/api/version/update",
            "/api/version/shutdown",
            "/api/shutdown",
        ]) {
            const response = await request({ port: stagePort, path: requestPath });
            assert.ok(response.statusCode >= 400, `${requestPath} was not blocked`);
        }
        assert.equal(apiHits, 0);
        assert.equal(dashboardHits, 0);
    } finally {
        await close(stageServer);
        await close(apiServer);
    }
});

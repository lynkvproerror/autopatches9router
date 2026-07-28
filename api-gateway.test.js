"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const appRoot = process.env.NINE_ROUTER_APP || path.join(
    process.env.APPDATA || "",
    "npm/node_modules/9router/app",
);

function loadGateway(env = {}) {
    const source = fs.readFileSync(path.join(appRoot, "custom-server.js"), "utf8");
    let nextHits = 0;
    let server;
    const nextHandler = (_req, res) => {
        nextHits += 1;
        res.statusCode = 204;
        res.end();
    };
    const http = {
        createServer(...args) {
            server = { handler: args.find((argument) => typeof argument === "function") };
            return server;
        },
    };
    const fakeRequire = (request) => {
        if (request === "http") return http;
        if (request === "./server.js") {
            http.createServer(nextHandler);
            return {};
        }
        throw new Error(`Unexpected require: ${request}`);
    };

    vm.runInNewContext(source, {
        Buffer,
        URL,
        console,
        module: { exports: {} },
        exports: {},
        process: { env },
        require: fakeRequire,
    });

    assert.equal(typeof server?.handler, "function", "custom server did not install its HTTP handler");
    return { handler: server.handler, getNextHits: () => nextHits };
}

function createResponse() {
    const headers = new Map();
    return {
        statusCode: 200,
        ended: false,
        setHeader(name, value) {
            headers.set(name.toLowerCase(), String(value));
        },
        getHeader(name) {
            return headers.get(name.toLowerCase());
        },
        end() {
            this.ended = true;
        },
    };
}

test("API port redirects dashboard routes to the isolated dashboard port", () => {
    const { handler, getNextHits } = loadGateway();
    const req = {
        url: "/dashboard/quota?patched=1",
        headers: { host: "localhost:53220" },
        socket: { remoteAddress: "127.0.0.1" },
    };
    const res = createResponse();

    handler(req, res);

    assert.equal(res.statusCode, 307);
    assert.equal(res.getHeader("location"), "http://localhost:20128/dashboard/quota?patched=1");
    assert.equal(res.getHeader("cache-control"), "no-store");
    assert.equal(res.getHeader("x-9router-dashboard-redirect"), "20128");
    assert.equal(res.ended, true);
    assert.equal(getNextHits(), 0, "dashboard request reached the API Next.js handler");
});

test("dashboard redirect preserves supported loopback hosts and ignores origin overrides", () => {
    const { handler } = loadGateway({ NINE_ROUTER_DASHBOARD_ORIGIN: "https://example.invalid" });

    for (const [host, expectedOrigin] of [
        ["127.0.0.1:53220", "http://127.0.0.1:20128"],
        ["localhost:53220", "http://localhost:20128"],
    ]) {
        const res = createResponse();
        handler({
            url: "/dashboard",
            headers: { host },
            socket: { remoteAddress: "127.0.0.1" },
        }, res);

        assert.equal(res.statusCode, 307);
        assert.equal(res.getHeader("location"), `${expectedOrigin}/dashboard`);
    }
});

test("dashboard route matching includes the root and excludes near-miss paths", () => {
    const { handler, getNextHits } = loadGateway();

    for (const url of ["/dashboard", "/dashboard/"]) {
        const res = createResponse();
        handler({ url, headers: { host: "localhost:53220" }, socket: {} }, res);
        assert.equal(res.statusCode, 307, `${url} did not redirect`);
    }

    const nearMiss = createResponse();
    handler({ url: "/dashboardish", headers: { host: "localhost:53220" }, socket: {} }, nearMiss);
    assert.equal(nearMiss.statusCode, 204);
    assert.equal(nearMiss.getHeader("location"), undefined);
    assert.equal(getNextHits(), 1, "near-miss route did not reach the API Next.js handler");
});

test("API and inference routes remain on port 53220", () => {
    const { handler, getNextHits } = loadGateway();
    const req = {
        url: "/v1/models",
        headers: { "x-forwarded-for": "198.51.100.10" },
        socket: { remoteAddress: "203.0.113.20" },
    };
    const res = createResponse();

    handler(req, res);

    assert.equal(res.statusCode, 204);
    assert.equal(res.getHeader("location"), undefined);
    assert.equal(req.headers["x-9r-real-ip"], "203.0.113.20");
    assert.equal(getNextHits(), 1);
});

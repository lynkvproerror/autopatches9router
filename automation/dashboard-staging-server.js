"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const BLOCKED_DATA_PATHS = [
    /^\/v1(?:\/|$)/i,
    /^\/v1beta(?:\/|$)/i,
    /^\/responses(?:\/|$)/i,
    /^\/codex(?:\/|$)/i,
    /^\/api\/v1(?:\/|$)/i,
    /^\/api\/v1beta(?:\/|$)/i,
];

const BLOCKED_CONTROL_PATHS = [
    /^\/api\/version\/update\/?$/i,
    /^\/api\/version\/shutdown\/?$/i,
    /^\/api\/shutdown\/?$/i,
];

const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
]);

function getPathname(requestPath) {
    try {
        return new URL(requestPath || "/", "http://dashboard.local").pathname;
    } catch {
        return "/";
    }
}

function classifyDashboardStagingRequest(requestPath) {
    const pathname = getPathname(requestPath);
    if (BLOCKED_DATA_PATHS.some((pattern) => pattern.test(pathname))) return "blocked";
    if (BLOCKED_CONTROL_PATHS.some((pattern) => pattern.test(pathname))) return "blocked";
    if (/^\/api(?:\/|$)/i.test(pathname)) return "proxy";
    return "local";
}

function isLoopbackAddress(address) {
    return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function copyProxyHeaders(headers) {
    const copied = {};
    for (const [name, value] of Object.entries(headers || {})) {
        if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase()) && value !== undefined) copied[name] = value;
    }
    return copied;
}

function sendJson(res, statusCode, body) {
    if (res.headersSent) return res.destroy();
    const payload = Buffer.from(JSON.stringify(body));
    res.statusCode = statusCode;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("content-length", String(payload.length));
    res.end(payload);
}

function proxyControlRequest(req, res, apiOrigin) {
    const target = new URL(req.url || "/", apiOrigin);
    const transport = target.protocol === "https:" ? https : http;
    const headers = copyProxyHeaders(req.headers);
    const originalHost = req.headers.host;
    headers.host = target.host;
    headers["x-forwarded-host"] = originalHost || "";
    headers["x-forwarded-proto"] = "http";
    headers["x-forwarded-for"] = req.socket.remoteAddress || "127.0.0.1";

    let upstreamResponse;
    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        if (upstreamResponse && !upstreamResponse.destroyed) upstreamResponse.destroy();
        if (!upstream.destroyed) upstream.destroy();
    };

    const upstream = transport.request({
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        headers,
    }, (response) => {
        upstreamResponse = response;
        if (res.destroyed) return cleanup();
        const responseHeaders = copyProxyHeaders(response.headers);
        responseHeaders["x-9router-dashboard-proxy"] = "53220";
        res.writeHead(response.statusCode || 502, responseHeaders);
        response.pipe(res);
    });

    upstream.on("error", (error) => {
        if (cleanedUp) return;
        sendJson(res, 502, {
            error: "dashboard_api_unavailable",
            message: error.message,
        });
    });
    req.once("aborted", cleanup);
    res.once("close", () => {
        if (!res.writableEnded) cleanup();
    });
    req.pipe(upstream);
}

function createDashboardStagingHandler(options) {
    const apiOrigin = new URL(options.apiOrigin);
    const dashboardHandler = options.dashboardHandler;
    const releaseId = options.releaseId || "unmanaged";
    const enforceLoopback = options.enforceLoopback !== false;
    if (typeof dashboardHandler !== "function") throw new TypeError("dashboardHandler is required");

    return (req, res) => {
        res.setHeader("x-9router-role", "dashboard");
        res.setHeader("x-9router-dashboard-release", releaseId);
        if (enforceLoopback && !isLoopbackAddress(req.socket.remoteAddress)) {
            return sendJson(res, 403, { error: "dashboard_loopback_only" });
        }

        const pathname = getPathname(req.url);
        if (pathname === "/_9router/dashboard-health") {
            return sendJson(res, 200, { ok: true, role: "dashboard", releaseId });
        }

        const requestClass = classifyDashboardStagingRequest(req.url);
        if (requestClass === "blocked") {
            return sendJson(res, 421, {
                error: "dashboard_port_only",
                apiBase: "http://127.0.0.1:53220/v1",
            });
        }
        if (requestClass === "proxy") return proxyControlRequest(req, res, apiOrigin);
        return dashboardHandler(req, res);
    };
}

function startDashboardStagingServer() {
    const appRoot = path.resolve(process.env.NINE_ROUTER_DASHBOARD_APP_ROOT || "");
    const apiOrigin = process.env.NINE_ROUTER_API_ORIGIN || "http://127.0.0.1:53220";
    const releaseId = process.env.NINE_ROUTER_DASHBOARD_RELEASE || path.basename(path.dirname(appRoot));
    const appServer = path.join(appRoot, "server.js");
    if (!appRoot || !fs.existsSync(appServer)) throw new Error(`Dashboard stage is invalid: ${appRoot}`);

    const originalCreateServer = http.createServer.bind(http);
    http.createServer = (...args) => {
        const handlerIndex = args.findIndex((argument) => typeof argument === "function");
        if (handlerIndex < 0) return originalCreateServer(...args);
        const dashboardHandler = args[handlerIndex];
        const wrappedHandler = createDashboardStagingHandler({ apiOrigin, dashboardHandler, releaseId });
        const nextArgs = [...args];
        nextArgs[handlerIndex] = wrappedHandler;
        return originalCreateServer(...nextArgs);
    };

    process.env.NODE_ENV = "production";
    process.env.NINE_ROUTER_ROLE = "dashboard";
    require(appServer);
}

module.exports = {
    classifyDashboardStagingRequest,
    classifyRequest: classifyDashboardStagingRequest,
    createDashboardStagingHandler,
    startDashboardStagingServer,
};

if (require.main === module) startDashboardStagingServer();

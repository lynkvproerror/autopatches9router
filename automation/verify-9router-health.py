import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def request(url: str, timeout: float):
    try:
        response = urllib.request.urlopen(url, timeout=timeout)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read().decode("utf-8")
        return response.status, response.headers, body


def parse_json(body: str):
    return json.loads(body) if body else {}


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify the isolated 9router API and dashboard listeners.")
    parser.add_argument("--api-port", type=int, default=53220)
    parser.add_argument("--dashboard-port", type=int, default=20128)
    parser.add_argument("--port", type=int, help="Deprecated alias for --api-port.")
    parser.add_argument("--attempts", type=int, default=5)
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()

    api_port = args.port or args.api_port
    api_url = f"http://127.0.0.1:{api_port}"
    dashboard_url = f"http://127.0.0.1:{args.dashboard_port}"
    for attempt in range(1, args.attempts + 1):
        try:
            api_health_status, _, api_health_body = request(f"{api_url}/api/health", args.timeout)
            models_status, _, models_body = request(f"{api_url}/v1/models", args.timeout)
            dashboard_health_status, dashboard_health_headers, dashboard_health_body = request(
                f"{dashboard_url}/api/health",
                args.timeout,
            )
            dashboard_stage_status, dashboard_stage_headers, dashboard_stage_body = request(
                f"{dashboard_url}/_9router/dashboard-health",
                args.timeout,
            )
            blocked_status, _, blocked_body = request(f"{dashboard_url}/v1/models", args.timeout)

            api_health = parse_json(api_health_body)
            models = parse_json(models_body)
            dashboard_health = parse_json(dashboard_health_body)
            dashboard_stage = parse_json(dashboard_stage_body)
            blocked = parse_json(blocked_body)
            proxy_header = dashboard_health_headers.get("x-9router-dashboard-proxy")
            role_header = dashboard_stage_headers.get("x-9router-role")
            healthy = all(
                (
                    api_health_status == 200,
                    api_health.get("ok") is True,
                    models_status == 200,
                    dashboard_health_status == 200,
                    dashboard_health.get("ok") is True,
                    proxy_header == str(api_port),
                    dashboard_stage_status == 200,
                    role_header == "dashboard",
                    dashboard_stage.get("ok") is True,
                    dashboard_stage.get("role") == "dashboard",
                    blocked_status == 421,
                    blocked.get("error") == "dashboard_port_only",
                )
            )
            if healthy:
                model_items = models.get("models") or models.get("data") or []
                print(
                    json.dumps(
                        {
                            "api_port": api_port,
                            "dashboard_port": args.dashboard_port,
                            "dashboard_and_api_share_listener": False,
                            "api_health": api_health_status,
                            "models_health": models_status,
                            "model_count": len(model_items),
                            "dashboard_health": dashboard_health_status,
                            "dashboard_proxy_target": int(proxy_header),
                            "dashboard_stage": dashboard_stage_status,
                            "dashboard_release": dashboard_stage.get("releaseId"),
                            "dashboard_inference_route": blocked_status,
                        },
                        ensure_ascii=True,
                    )
                )
                return 0
        except (OSError, ValueError, urllib.error.URLError) as error:
            if attempt == args.attempts:
                print(f"9router health verification failed: {error}", file=sys.stderr)
                return 1
        if attempt < args.attempts:
            time.sleep(2)

    print("9router health verification failed: listener contract did not match", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

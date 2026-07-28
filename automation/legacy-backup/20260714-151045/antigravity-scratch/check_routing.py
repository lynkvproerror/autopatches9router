import urllib.request, json, sys
sys.stdout.reconfigure(encoding='utf-8')

# Check what model 9router actually routes gpt-5.6-sol to
# First check the combos via API
try:
    r = urllib.request.urlopen('http://127.0.0.1:53220/api/combos', timeout=5)
    combos = json.loads(r.read())
    print("=== All Combos ===")
    for c in combos:
        name = c.get('name', c.get('id', '?'))
        if '5.6' in str(name) or '5.5' in str(name):
            print(json.dumps(c, indent=2, ensure_ascii=False))
            print()
except Exception as e:
    print(f"combos API error: {e}")

# Check models endpoint
try:
    r = urllib.request.urlopen('http://127.0.0.1:53220/v1/models', timeout=5)
    data = json.loads(r.read())
    print("\n=== Models with 5.6 ===")
    for m in data.get('data', []):
        if '5.6' in m['id']:
            print(json.dumps(m, indent=2))
except Exception as e:
    print(f"models API error: {e}")

# Check recent request logs
try:
    r = urllib.request.urlopen('http://127.0.0.1:53220/api/request-details?limit=5', timeout=5)
    logs = json.loads(r.read())
    print("\n=== Recent Requests ===")
    for log in logs[:5]:
        model = log.get('model', '?')
        upstream = log.get('upstream_model', log.get('upstreamModel', '?'))
        provider = log.get('provider', '?')
        status = log.get('status', '?')
        print(f"  model={model} -> upstream={upstream} provider={provider} status={status}")
except Exception as e:
    print(f"request-details API error: {e}")

import subprocess
import time
import json
import concurrent.futures

PROXIES_FILE = "socks5_raw.txt"
TEST_URL = "https://www.google.com"
TIMEOUT = 10

def test_proxy(proxy):
    proxy = proxy.strip()
    if not proxy: return None
    
    start_time = time.time()
    try:
        # Using curl to test the proxy
        cmd = [
            "curl", "-s", "-o", "/dev/null", 
            "-w", "%{http_code}", 
            "--socks5", proxy, 
            "--connect-timeout", str(TIMEOUT),
            TEST_URL
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        status_code = result.stdout.strip()
        elapsed = time.time() - start_time
        
        if status_code == "200":
            # Check actual IP
            ip_cmd = ["curl", "-s", "--socks5", proxy, "https://api.ipify.org"]
            ip_check = subprocess.run(ip_cmd, capture_output=True, text=True)
            detected_ip = ip_check.stdout.strip()
            
            return {
                "proxy": proxy,
                "latency_ms": int(elapsed * 1000),
                "status": "working",
                "detected_ip": detected_ip
            }
    except Exception as e:
        pass
    return None

def main():
    with open(PROXIES_FILE, "r") as f:
        proxies = [line.strip() for line in f.readlines() if line.strip()]
    
    print(f"Testing {len(proxies)} proxies...")
    working_proxies = []
    
    # Test top 50 proxies in parallel
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(test_proxy, p): p for p in proxies[:50]}
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res:
                print(f"[OK] {res['proxy']} - {res['latency_ms']}ms")
                working_proxies.append(res)
            else:
                p = futures[future]
                # print(f"[FAIL] {p}")

    # Sort by latency
    working_proxies.sort(key=lambda x: x["latency_ms"])
    
    with open("working_proxies.json", "w") as f:
        json.dump(working_proxies, f, indent=4)
    
    print(f"\nFound {len(working_proxies)} working proxies. Saved to working_proxies.json")

if __name__ == "__main__":
    main()

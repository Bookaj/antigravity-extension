import csv
import base64
import sys

def extract_best_vpn(csv_file, min_speed=1000000): # 10 Mbps -> 10,000,000 bps. 1 Mbps -> 1,000,000. Let's try 1Mbps first.
    try:
        with open(csv_file, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        
        # Find header index
        header_idx = -1
        for i, line in enumerate(lines):
            if line.startswith('#HostName'):
                header_idx = i
                break
        
        if header_idx == -1:
            print("Header not found")
            return

        # Prepare clean lines for DictReader
        # Remove '#' from the header line to make keys clean
        lines[header_idx] = lines[header_idx].lstrip('#')
        
        # Data lines are from header onwards
        data_lines = lines[header_idx:]
        
        reader = csv.DictReader(data_lines)
        candidates = []
        for row in reader:
            try:
                # Filter bad rows
                if not row.get('OpenVPN_ConfigData_Base64'): continue
                
                speed = int(row.get('Speed', 0))
                if speed >= min_speed:
                    candidates.append(row)
            except ValueError:
                continue

        # Sort by speed descending
        candidates.sort(key=lambda x: int(x['Speed']), reverse=True)
        
        if not candidates:
            print(f"No suitable VPN found (min_speed={min_speed})")
            return

        # Get top 3 and print them
        print(f"Found {len(candidates)} candidates. Top 3:")
        for c in candidates[:3]:
            print(f"- {c['HostName']} ({c['CountryShort']}) Speed: {int(c['Speed'])/1000000:.2f} Mbps")

        best = candidates[0]
        print(f"Selected Best: {best['HostName']}")
        
        vpn_config = base64.b64decode(best['OpenVPN_ConfigData_Base64']).decode('utf-8')
        
        # Save to file
        filename = f"vpngate_{best['HostName']}.ovpn"
        with open(filename, 'w') as f:
            f.write(vpn_config)
            
        print(f"Config saved to: {filename}")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    extract_best_vpn("vpngate.csv")

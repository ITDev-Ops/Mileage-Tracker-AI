import requests
import time
import os
import sys

# Configure UTF-8 encoding for stdout on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Configure custom DNS nameservers to avoid resolution timeouts
try:
    import dns.resolver
    custom_resolver = dns.resolver.Resolver()
    custom_resolver.nameservers = ['8.8.8.8', '1.1.1.1']
    dns.resolver.default_resolver = custom_resolver
except Exception as dns_err:
    print(f"Failed to configure custom DNS resolver: {dns_err}")

BASE_URL = "http://localhost:8000/api"

def run_test():
    print("=== ADMIN ALERTS INTEGRATION TEST ===")
    print("=" * 60)
    
    unique = int(time.time())
    admin_email = f"admin_alert_{unique}@example.com"
    driver_email = f"hue_s34_{unique}@hotmail.com" # Using unique email suffix to avoid collision, with base as requested
    
    # 1. Register Admin
    print("\n1. Registering Admin user...")
    admin_reg = requests.post(f"{BASE_URL}/auth/register", json={
        "email": admin_email,
        "password": "adminpass123",
        "name": "Admin Alert Tester"
    })
    assert admin_reg.status_code == 200, f"Admin reg failed: {admin_reg.text}"
    admin_token = admin_reg.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    print("   [OK] Admin registered successfully.")
    
    # 2. Upgrade Admin to Business tier
    print("\n2. Upgrading Admin to Business tier via API...")
    upgrade_resp = requests.post(f"{BASE_URL}/test/upgrade-user", json={
        "email": admin_email,
        "tier": "business"
    })
    assert upgrade_resp.status_code == 200, f"Upgrade failed: {upgrade_resp.text}"
    print("      Upgrade successful!")
    
    # Verify upgrade
    me_resp = requests.get(f"{BASE_URL}/auth/me", headers=admin_headers)
    assert me_resp.json()["subscription_tier"] == "business", "Admin upgrade to business tier failed"
    print("   [OK] Admin upgraded to Business tier successfully.")
    
    # 3. Invite Team Member (Hubby)
    print("\n3. Inviting Driver (Hubby)...")
    invite_resp = requests.post(f"{BASE_URL}/team/invite", headers=admin_headers, json={
        "email": driver_email,
        "name": "Hubby",
        "role": "Driver",
        "subscription_tier": "free"
    })
    assert invite_resp.status_code == 200, f"Invite member failed: {invite_resp.text}"
    invite_data = invite_resp.json()
    invite_url = invite_data.get("invite_url", "")
    
    # Parse the token query parameter from the invite URL
    import urllib.parse
    parsed_url = urllib.parse.urlparse(invite_url)
    params = urllib.parse.parse_qs(parsed_url.query)
    invite_token = params.get("token", [None])[0]
    print(f"   [OK] Invited team member successfully. Token: {invite_token}")
    
    # 4. Register and Log in as Driver (Hubby)
    print("\n4. Registering and logging in as Driver...")
    driver_reg = requests.post(f"{BASE_URL}/auth/register", json={
        "email": driver_email,
        "password": "driverpass123",
        "name": "Hubby",
        "token": invite_token
    })
    assert driver_reg.status_code == 200, f"Driver register failed: {driver_reg.text}"
    driver_token = driver_reg.json()["access_token"]
    driver_headers = {"Authorization": f"Bearer {driver_token}"}
    print("   [OK] Driver account registered & logged in.")
    
    # Upgrade Driver to Pro tier to allow PDF export
    print("   Upgrading Driver to Pro tier...")
    upgrade_driver_resp = requests.post(f"{BASE_URL}/test/upgrade-user", json={
        "email": driver_email,
        "tier": "pro"
    })
    assert upgrade_driver_resp.status_code == 200, f"Upgrade driver failed: {upgrade_driver_resp.text}"
    print("   [OK] Driver upgraded to Pro tier successfully.")
    
    # 5. Export CSV report as Driver
    print("\n5. Driver exporting 2026 CSV Tax Report...")
    csv_resp = requests.get(f"{BASE_URL}/reports/export/csv?year=2026", headers=driver_headers)
    assert csv_resp.status_code == 200, f"CSV Export failed: {csv_resp.text}"
    print("   [OK] CSV report exported successfully.")
    
    # 6. Fetch Team Stats as Admin and assert the alert is present
    print("\n6. Fetching stats as Admin...")
    stats_resp = requests.get(f"{BASE_URL}/team/stats", headers=admin_headers)
    assert stats_resp.status_code == 200, f"Get team stats failed: {stats_resp.text}"
    stats_data = stats_resp.json()
    
    alerts = stats_data.get("alerts", [])
    print(f"   Alerts retrieved: {alerts}")
    
    # Assert CSV Alert is present
    csv_alert = next((a for a in alerts if "Hubby" in a["msg"] and "CSV" in a["msg"] and "2026" in a["msg"]), None)
    assert csv_alert is not None, "CSV alert not found in admin stats response"
    print("   [OK] Verified CSV export alert is present in Admin Dashboard data:")
    print(f"      - Message: '{csv_alert['msg']}'")
    print(f"      - Date/Time: '{csv_alert['date']}'")
    
    # 7. Export PDF report as Driver
    print("\n7. Driver exporting 2026 PDF Tax Report...")
    pdf_resp = requests.get(f"{BASE_URL}/reports/export/pdf?year=2026", headers=driver_headers)
    assert pdf_resp.status_code == 200, f"PDF Export failed: {pdf_resp.text}"
    print("   [OK] PDF report exported successfully.")
    
    # 8. Fetch Team Stats as Admin again and check for the PDF alert
    print("\n8. Fetching stats as Admin to verify PDF alert...")
    stats_resp2 = requests.get(f"{BASE_URL}/team/stats", headers=admin_headers)
    assert stats_resp2.status_code == 200, f"Get team stats failed: {stats_resp2.text}"
    stats_data2 = stats_resp2.json()
    alerts2 = stats_data2.get("alerts", [])
    print(f"   Alerts retrieved: {alerts2}")
    
    # Assert PDF Alert is present
    pdf_alert = next((a for a in alerts2 if "Hubby" in a["msg"] and "PDF" in a["msg"] and "2026" in a["msg"]), None)
    assert pdf_alert is not None, "PDF alert not found in admin stats response"
    print("   [OK] Verified PDF export alert is present in Admin Dashboard data:")
    print(f"      - Message: '{pdf_alert['msg']}'")
    print(f"      - Date/Time: '{pdf_alert['date']}'")
    
    print("\nALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_test()

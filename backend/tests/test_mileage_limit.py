import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://ai-mile-tracker-f2fed3697be0.herokuapp.com').rstrip('/')

@pytest.fixture(scope="module")
def new_user_session():
    """Register a new user to test from a clean state"""
    email = f"free_limit_test_{int(time.time())}@example.com"
    reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "password123",
        "name": "Limit Tester"
    })
    assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
    token = reg_resp.json().get("access_token") or reg_resp.json().get("token")
    user_id = reg_resp.json()["user"]["user_id"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Downgrade to free to test mileage limit
    downgrade_resp = requests.post(f"{BASE_URL}/api/payments/downgrade", headers=headers)
    assert downgrade_resp.status_code == 200, f"Downgrade failed: {downgrade_resp.text}"
    
    return {"headers": headers, "user_id": user_id, "token": token}


def test_mileage_limit_flow(new_user_session):
    headers = new_user_session["headers"]
    
    # 1. Verify initially at 0 miles
    stats_resp = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
    assert stats_resp.status_code == 200
    assert stats_resp.json()["monthly_miles"] == 0.0
    
    # 2. Add a trip of 34.0 miles (below warning threshold of 35.0)
    trip1_resp = requests.post(f"{BASE_URL}/api/trips", headers=headers, json={"start_address": "Point A"})
    assert trip1_resp.status_code == 200
    trip1_id = trip1_resp.json()["trip_id"]
    
    end1_resp = requests.post(f"{BASE_URL}/api/trips/{trip1_id}/end", headers=headers, json={
        "end_address": "Point B",
        "distance": 34.0
    })
    assert end1_resp.status_code == 200
    
    # Verify stats updated
    stats_resp = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
    assert stats_resp.json()["monthly_miles"] == 34.0
    
    # 3. Add a trip of 1.0 miles (total 35.0 miles -> warning threshold reached, but not blocked)
    trip2_resp = requests.post(f"{BASE_URL}/api/trips", headers=headers, json={"start_address": "Point B"})
    assert trip2_resp.status_code == 200
    trip2_id = trip2_resp.json()["trip_id"]
    
    end2_resp = requests.post(f"{BASE_URL}/api/trips/{trip2_id}/end", headers=headers, json={
        "end_address": "Point C",
        "distance": 1.0
    })
    assert end2_resp.status_code == 200
    
    # Verify stats shows 35.0
    stats_resp = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
    assert stats_resp.json()["monthly_miles"] == 35.0
    
    # Test that PDF export, receipt scanning, and trip creation are still allowed at 35.0 miles
    trip3_resp = requests.post(f"{BASE_URL}/api/trips", headers=headers, json={"start_address": "Point C"})
    assert trip3_resp.status_code == 200
    trip3_id = trip3_resp.json()["trip_id"]
    
    # End trip 3 with 5.0 miles -> brings total to 40.0 miles
    end3_resp = requests.post(f"{BASE_URL}/api/trips/{trip3_id}/end", headers=headers, json={
        "end_address": "Point D",
        "distance": 5.0
    })
    assert end3_resp.status_code == 200
    
    # Verify stats shows 40.0
    stats_resp = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
    assert stats_resp.json()["monthly_miles"] == 40.0
    
    # 4. Try starting a new manual trip (should be blocked with 403)
    trip4_resp = requests.post(f"{BASE_URL}/api/trips", headers=headers, json={"start_address": "Point D"})
    assert trip4_resp.status_code == 403
    assert "limit reached" in trip4_resp.json()["detail"].lower()
    
    # Try starting an auto trip / direct sync (should be blocked with 403)
    direct_resp = requests.post(f"{BASE_URL}/api/trips/direct", headers=headers, json={
        "start_time": "2026-06-05T12:00:00Z",
        "end_time": "2026-06-05T12:30:00Z",
        "distance": 1.0,
        "classification": "business"
    })
    assert direct_resp.status_code == 403
    assert "limit reached" in direct_resp.json()["detail"].lower()
    
    # Try receipt scanning (should be blocked with 403)
    scan_resp = requests.post(f"{BASE_URL}/api/expenses/scan", headers=headers, json={
        "receipt_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    })
    assert scan_resp.status_code == 403
    assert "requires a pro or business plan" in scan_resp.json()["detail"].lower()
    
    # Try PDF export (should be blocked with 403)
    pdf_resp = requests.get(f"{BASE_URL}/api/reports/export/pdf?year=2026", headers=headers)
    assert pdf_resp.status_code == 403
    assert "require a pro or business plan" in pdf_resp.json()["detail"].lower()

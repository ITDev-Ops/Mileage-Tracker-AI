import pytest
import requests
import os
import time

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://ai-mile-tracker-f2fed3697be0.herokuapp.com').rstrip('/')

@pytest.fixture(scope="module")
def user_session():
    """Register a new user to test from a clean state"""
    email = f"payment_test_{int(time.time())}@example.com"
    reg_resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "email": email,
        "password": "password123",
        "name": "Payment Tester"
    })
    assert reg_resp.status_code == 200, f"Registration failed: {reg_resp.text}"
    token = reg_resp.json().get("access_token") or reg_resp.json().get("token")
    user_id = reg_resp.json()["user"]["user_id"]
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    return {"headers": headers, "user_id": user_id, "token": token}

def test_stripe_checkout_and_status(user_session):
    headers = user_session["headers"]
    
    # 1. Initiate checkout creation
    checkout_data = {
        "plan": "pro",
        "origin_url": "http://localhost:19006"
    }
    resp = requests.post(f"{BASE_URL}/api/payments/create-checkout", headers=headers, json=checkout_data)
    assert resp.status_code == 200
    
    res_data = resp.json()
    assert "url" in res_data
    assert "session_id" in res_data
    
    session_id = res_data["session_id"]
    checkout_url = res_data["url"]
    
    # 2. Check that the status endpoint handles the session gracefully
    # If using live Stripe, status will be "open" or "expired" or "complete" depending on whether paid.
    # If mock key was used in local preview, it auto-fulfills and returns "paid".
    if session_id.startswith("cs_test_mock_"):
        # Make a request to the redirect URL (simulating the browser redirect from Stripe)
        # Note: no authorization header is sent because it's a public redirect
        redirect_resp = requests.get(checkout_url)
        assert redirect_resp.status_code == 200
        assert "html" in redirect_resp.headers.get("Content-Type", "").lower()
        assert "Payment Successful" in redirect_resp.text
        assert "Return to Application" in redirect_resp.text
        
        # Verify user is upgraded immediately upon redirect completion
        me_resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert me_resp.status_code == 200
        assert me_resp.json()["subscription_tier"] == "pro"
        
        # Verify subscription details returns card info accurately
        sub_resp = requests.get(f"{BASE_URL}/api/payments/subscription", headers=headers)
        assert sub_resp.status_code == 200
        sub_data = sub_resp.json()
        assert sub_data["card_brand"] == "Visa"
        assert sub_data["card_last4"] == "4242"
    else:
        status_resp = requests.get(f"{BASE_URL}/api/payments/status/{session_id}", headers=headers)
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert "payment_status" in status_data

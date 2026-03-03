"""Multi Mile Tracker - Backend API Tests"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Login and get token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "test@demo.com", "password": "test123"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

# Auth tests
class TestAuth:
    def test_login_success(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "test@demo.com", "password": "test123"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == "test@demo.com"

    def test_login_invalid_credentials(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "bad@email.com", "password": "wrong"})
        assert resp.status_code in [401, 400]

    def test_register_new_user(self):
        import time
        email = f"TEST_{int(time.time())}@example.com"
        resp = requests.post(f"{BASE_URL}/api/auth/register", json={"email": email, "password": "pass123", "name": "Test User"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data

    def test_get_profile(self, headers):
        resp = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data

# Dashboard
class TestDashboard:
    def test_dashboard_stats(self, headers):
        resp = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "monthly_miles" in data
        assert "yearly_deductions" in data
        assert "recent_trips" in data
        assert "chart_data" in data

# Trips
class TestTrips:
    def test_list_trips(self, headers):
        resp = requests.get(f"{BASE_URL}/api/trips", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_create_and_get_trip(self, headers):
        resp = requests.post(f"{BASE_URL}/api/trips", headers=headers, json={"start_address": "TEST_Start Location"})
        assert resp.status_code == 200
        data = resp.json()
        assert "trip_id" in data
        trip_id = data["trip_id"]

        # Verify persistence
        get_resp = requests.get(f"{BASE_URL}/api/trips/{trip_id}", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["trip_id"] == trip_id
        return trip_id

    def test_end_trip(self, headers):
        # Create trip first
        resp = requests.post(f"{BASE_URL}/api/trips", headers=headers, json={"start_address": "TEST_End Trip Start"})
        assert resp.status_code == 200
        trip_id = resp.json()["trip_id"]
        # End it
        end_resp = requests.post(f"{BASE_URL}/api/trips/{trip_id}/end", headers=headers,
                                  json={"end_address": "TEST_End Location", "distance": 5.5})
        assert end_resp.status_code == 200

# Expenses
class TestExpenses:
    def test_list_expenses(self, headers):
        resp = requests.get(f"{BASE_URL}/api/expenses", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_create_expense(self, headers):
        resp = requests.post(f"{BASE_URL}/api/expenses", headers=headers, json={
            "amount": 50.0, "category": "fuel", "description": "TEST_ Gas station", "date": "2025-01-15"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "expense_id" in data

# Reports
class TestReports:
    def test_reports_summary(self, headers):
        resp = requests.get(f"{BASE_URL}/api/reports/summary", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "total_miles" in data
        assert "total_deductions" in data

    def test_csv_export(self, headers):
        resp = requests.get(f"{BASE_URL}/api/reports/export/csv", headers=headers)
        assert resp.status_code == 200

# AI
class TestAI:
    def test_ai_chat(self, headers):
        resp = requests.post(f"{BASE_URL}/api/ai/chat", headers=headers, json={"message": "How much have I driven this year?"}, timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "response" in data

    def test_ai_insights(self, headers):
        resp = requests.get(f"{BASE_URL}/api/ai/insights", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "insights" in data

# Subscription
class TestSubscription:
    def test_get_subscription(self, headers):
        resp = requests.get(f"{BASE_URL}/api/payments/subscription", headers=headers)
        assert resp.status_code == 200

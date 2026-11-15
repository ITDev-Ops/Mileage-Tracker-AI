import os
import sys
import json
import uuid
from datetime import datetime, timezone
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

os.environ["TESTING"] = "true"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server
server.app.router.on_startup.clear()
from server import app, GoogleAuthRequest

class MockCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, filter_dict, projection=None, *args, **kwargs):
        for d in reversed(self.docs):
            match = True
            for k, v in filter_dict.items():
                if k == "$or":
                    sub_match = any(all(d.get(sk) == sv for sk, sv in cond.items()) for cond in v)
                    if not sub_match:
                        match = False
                        break
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                res = dict(d)
                if projection and "_id" in projection and projection["_id"] == 0:
                    res.pop("_id", None)
                return res
        return None

    async def insert_one(self, doc):
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = str(uuid.uuid4())
        self.docs.append(d)
        return d

    async def update_one(self, filter_dict, update_dict, *args, **kwargs):
        for d in self.docs:
            match = all(d.get(k) == v for k, v in filter_dict.items())
            if match:
                if "$set" in update_dict:
                    d.update(update_dict["$set"])
                return True
        return False

    async def update_many(self, filter_dict, update_dict, *args, **kwargs):
        count = 0
        for d in self.docs:
            match = all(d.get(k) == v for k, v in filter_dict.items())
            if match:
                if "$set" in update_dict:
                    d.update(update_dict["$set"])
                count += 1
        return count

    def find(self, filter_dict=None):
        matched = []
        filter_dict = filter_dict or {}
        for d in self.docs:
            match = all(d.get(k) == v for k, v in filter_dict.items())
            if match:
                matched.append(dict(d))
        class Cursor:
            def __init__(self, data):
                self.data = data
            async def to_list(self, length=100):
                return self.data[:length]
        return Cursor(matched)

class MockDB:
    def __init__(self):
        self.users = MockCollection()
        self.team_members = MockCollection()
        self.payment_transactions = MockCollection()
        self.legal_consents = MockCollection()

@pytest.fixture(autouse=True)
def setup_mock_db(monkeypatch):
    mock_db = MockDB()
    monkeypatch.setattr(server, "db", mock_db)
    return mock_db

def test_google_auth_missing_credentials():
    client = TestClient(app)
    res = client.post("/api/auth/google", json={})
    assert res.status_code == 400
    assert "Unable to verify Google credentials" in res.json()["detail"]

def test_google_auth_new_user_with_id_token(setup_mock_db):
    client = TestClient(app)
    fake_token = "valid-google-id-token-12345"

    class FakeResponse:
        status_code = 200
        def json(self):
            return {
                "email": "sarah.driver@gmail.com",
                "email_verified": "true",
                "name": "Sarah Driver",
                "picture": "https://lh3.googleusercontent.com/avatar/sarah.jpg",
                "sub": "google-sub-987654"
            }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = FakeResponse()
        res = client.post("/api/auth/google", json={"id_token": fake_token})

    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "sarah.driver@gmail.com"
    assert data["user"]["name"] == "Sarah Driver"
    assert data["user"]["google_id"] == "google-sub-987654"
    assert data["user"]["photo_url"] == "https://lh3.googleusercontent.com/avatar/sarah.jpg"
    assert data["user"]["subscription_tier"] == "pro"
    assert data["user"]["role"] == "Admin"

    # Verify user was saved in db.users
    user_in_db = [u for u in setup_mock_db.users.docs if u["email"] == "sarah.driver@gmail.com"]
    assert len(user_in_db) == 1
    assert user_in_db[0]["auth_provider"] == "google"

def test_google_auth_existing_user_login(setup_mock_db):
    client = TestClient(app)
    # Pre-seed existing user
    setup_mock_db.users.docs.append({
        "user_id": "user_existing_123",
        "email": "alex.commuter@gmail.com",
        "name": "Alex Commuter",
        "subscription_tier": "business",
        "role": "Admin",
        "is_active": True,
        "created_at": datetime.now(timezone.utc)
    })

    class FakeResponse:
        status_code = 200
        def json(self):
            return {
                "email": "alex.commuter@gmail.com",
                "name": "Alex Commuter Updated",
                "picture": "https://lh3.googleusercontent.com/avatar/alex.jpg",
                "sub": "google-sub-alex-1122"
            }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = FakeResponse()
        res = client.post("/api/auth/google", json={"access_token": "valid-google-access-token"})

    assert res.status_code == 200
    data = res.json()
    assert data["user"]["user_id"] == "user_existing_123"
    assert data["user"]["email"] == "alex.commuter@gmail.com"
    assert data["user"]["subscription_tier"] == "business"
    assert data["user"]["google_id"] == "google-sub-alex-1122"

def test_google_auth_invited_team_member(setup_mock_db):
    client = TestClient(app)
    # Pre-seed invited team member
    setup_mock_db.team_members.docs.append({
        "email": "invited.member@company.org",
        "name": "Invited Member",
        "role": "Driver",
        "status": "Pending",
        "subscription_tier": "business"
    })

    class FakeResponse:
        status_code = 200
        def json(self):
            return {
                "email": "invited.member@company.org",
                "name": "Invited Member",
                "sub": "google-sub-invited-9999"
            }

    with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
        mock_get.return_value = FakeResponse()
        res = client.post("/api/auth/google", json={"id_token": "token-invited-member"})

    assert res.status_code == 200
    data = res.json()
    assert data["user"]["role"] == "Driver"
    assert data["user"]["subscription_tier"] == "business"

    # Verify team member is marked Active
    tm = [t for t in setup_mock_db.team_members.docs if t["email"] == "invited.member@company.org"][0]
    assert tm["status"] == "Active"
    assert tm["user_id"] == data["user"]["user_id"]

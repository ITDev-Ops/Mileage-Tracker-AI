import os
import sys
import pytest
from fastapi.testclient import TestClient

os.environ["TESTING"] = "true"
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server
server.app.router.on_startup.clear()
from server import app

def test_support_contact_success_json():
    client = TestClient(app)
    payload = {
        "email": "sarah.driver@gmail.com",
        "subject": "App question",
        "message": "How do I export my mileage reports for IRS tax filing?",
        "type": "general"
    }
    res = client.post("/api/support/contact", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "delivered securely" in data["message"]

def test_support_contact_form_data():
    client = TestClient(app)
    form_data = {
        "email": "driver2@gmail.com",
        "subject": "Receipt OCR help",
        "message": "The camera photo was slightly blurry.",
        "type": "receipt"
    }
    res = client.post("/api/support/contact", data=form_data)
    assert res.status_code == 200
    assert res.json()["status"] == "success"

def test_support_contact_php_mailer_backward_compat():
    client = TestClient(app)
    form_data = {
        "email": "legacy.user@example.com",
        "subject": "Legacy form submission",
        "message": "Testing compatibility with php_mailer path.",
        "type": "general"
    }
    res = client.post("/php_mailer/process.php", data=form_data)
    assert res.status_code == 200
    assert res.json()["status"] == "success"

def test_support_contact_missing_fields():
    client = TestClient(app)
    res = client.post("/api/support/contact", json={"email": "sarah@gmail.com", "message": ""})
    assert res.status_code == 400
    assert "A valid email address and message are required" in res.json()["detail"]

def test_support_contact_honeypot_trap():
    client = TestClient(app)
    payload = {
        "email": "bot@spammer.net",
        "message": "Buy crypto now!",
        "subscribe_newsletter": "i_am_a_bot"
    }
    res = client.post("/api/support/contact", json=payload)
    assert res.status_code == 200
    assert res.json()["status"] == "success"

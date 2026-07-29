import asyncio
import os
import sys
import uuid
import certifi
import motor.motor_asyncio
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Load environment
ROOT_DIR = Path(__file__).parent.parent
backend_dir = ROOT_DIR / "backend"
sys.path.insert(0, str(backend_dir))
load_dotenv(backend_dir / ".env")

from httpx import AsyncClient, ASGITransport
import server

async def async_test_legal_consent_flow():
    print("\n==========================================")
    print("RUNNING LEGAL CONSENT FLOW TEST SUITE")
    print("==========================================\n")

    # Manually trigger startup_db_client to initialize db motor client
    await server.startup_db_client()

    # Connect to DB directly to verify records
    mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "multimile_db")
    async_client = motor.motor_asyncio.AsyncIOMotorClient(mongo_uri, tlsCAFile=certifi.where())
    async_db = async_client[db_name]

    test_id = uuid.uuid4().hex[:8]
    test_email = f"legal_test_{test_id}@example.com"
    test_password = "SecurePassword123!"
    test_name = "Legal Test User"

    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:

        print(f"[1] Testing Sign Up WITHOUT checking legal checkboxes...")
        res_bad = await client.post("/api/auth/register", json={
            "name": test_name,
            "email": test_email,
            "password": test_password,
            "tos_agreed": False,
            "privacy_policy_agreed": False,
            "product_video_agreed": False
        })
        print(f"Status Code: {res_bad.status_code}, Response: {res_bad.json()}")
        assert res_bad.status_code == 400
        assert "Terms of Service" in res_bad.json()["detail"]
        print("✔ PASSED: Sign Up correctly blocked without legal consent checkboxes!")

        print(f"\n[2] Testing Sign Up WITH all 3 checkboxes checked...")
        res_good = await client.post("/api/auth/register", json={
            "name": test_name,
            "email": test_email,
            "password": test_password,
            "tos_agreed": True,
            "privacy_policy_agreed": True,
            "product_video_agreed": True,
            "tos_version": "1.0",
            "privacy_policy_version": "1.0",
            "product_video_version": "1.0"
        })
        print(f"Status Code: {res_good.status_code}")
        assert res_good.status_code == 200
        res_json = res_good.json()
        assert "access_token" in res_json
        token = res_json["access_token"]
        user_data = res_json["user"]
        
        assert user_data.get("legal_consent_required") is False
        assert "legal_agreements" in user_data
        legal_agreements = user_data["legal_agreements"]
        assert legal_agreements.get("tos_agreed") is True
        assert legal_agreements.get("privacy_policy_agreed") is True
        assert legal_agreements.get("product_video_agreed") is True
        assert legal_agreements.get("tos_version") == "1.0"
        assert legal_agreements.get("privacy_policy_version") == "1.0"
        assert legal_agreements.get("product_video_version") == "1.0"
        assert "tos_agreed_at" in legal_agreements
        print(f"Recorded Legal Agreements: {legal_agreements}")
        print("✔ PASSED: Sign Up with legal checkboxes succeeded & recorded exact versions & timestamps!")

        # Verify MongoDB legal audit collection (db.legal_consents)
        audit_record = await async_db.legal_consents.find_one({"email": test_email, "event_type": "signup"})
        assert audit_record is not None
        assert audit_record["legal_agreements"]["tos_agreed"] is True
        print("✔ PASSED: Audit log record created in db.legal_consents!")

        print("\n[3] Testing Existing User without legal consent (simulate legacy user)...")
        legacy_email = f"legacy_user_{test_id}@example.com"
        legacy_pw_hash = server.get_password_hash("Password123!")
        legacy_user_doc = {
            "user_id": f"user_legacy_{test_id}",
            "email": legacy_email,
            "name": "Legacy User",
            "password_hash": legacy_pw_hash,
            "subscription_tier": "free",
            "tax_country": "US",
            "occupation_type": "self_employed",
            "vehicle_type": "car",
            "is_active": True,
            "status": "active",
            "created_at": datetime.now(timezone.utc)
        }
        await async_db.users.insert_one(legacy_user_doc)

        # Log in as legacy user
        res_login = await client.post("/api/auth/login", json={
            "email": legacy_email,
            "password": "Password123!"
        })
        print(f"Status Code: {res_login.status_code}")
        assert res_login.status_code == 200
        legacy_login_data = res_login.json()["user"]
        legacy_token = res_login.json()["access_token"]
        
        print(f"Legacy User legal_consent_required: {legacy_login_data.get('legal_consent_required')}")
        print(f"Legacy User missing_consents: {legacy_login_data.get('missing_consents')}")
        assert legacy_login_data.get("legal_consent_required") is True
        assert set(legacy_login_data.get("missing_consents", [])) == {"tos", "privacy_policy", "product_video"}
        print("✔ PASSED: Existing user missing consent correctly flagged as requiring legal consent!")

        print("\n[4] Testing /api/auth/accept-legal-terms for legacy user...")
        res_accept = await client.post(
            "/api/auth/accept-legal-terms",
            headers={"Authorization": f"Bearer {legacy_token}"},
            json={
                "tos_agreed": True,
                "privacy_policy_agreed": True,
                "product_video_agreed": True
            }
        )
        print(f"Accept Status Code: {res_accept.status_code}")
        assert res_accept.status_code == 200
        accepted_user = res_accept.json()
        assert accepted_user.get("legal_consent_required") is False
        print("✔ PASSED: Tap-to-agree modal submission recorded legal consent and cleared required flag!")

        print("\n[5] Testing Admin Legal Terms Update (bumping versions)...")
        res_admin = await client.post("/api/admin/legal-terms/update", json={
            "tos_version": "2.0",
            "privacy_policy_version": "2.0",
            "product_video_version": "2.0"
        })
        print(f"Admin Update Status Code: {res_admin.status_code}")
        assert res_admin.status_code == 200

        # Query get_me for user who agreed to version 1.0 earlier
        res_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        print(f"Me Status Code: {res_me.status_code}")
        assert res_me.status_code == 200
        me_data = res_me.json()
        print(f"After version update, legal_consent_required: {me_data.get('legal_consent_required')}")
        assert me_data.get("legal_consent_required") is True
        print("✔ PASSED: Document version update correctly re-triggers legal consent required flag for users!")

        # Reset legal versions back to 1.0 for system test environment
        await client.post("/api/admin/legal-terms/update", json={
            "tos_version": "1.0",
            "privacy_policy_version": "1.0",
            "product_video_version": "1.0"
        })

        # Cleanup test users
        await async_db.users.delete_many({"email": {"$in": [test_email, legacy_email]}})
        await async_db.legal_consents.delete_many({"email": {"$in": [test_email, legacy_email]}})
        async_client.close()

    print("\n==========================================")
    print("ALL LEGAL CONSENT TESTS PASSED SUCCESSFULLY! 🎉")
    print("==========================================\n")

if __name__ == "__main__":
    asyncio.run(async_test_legal_consent_flow())

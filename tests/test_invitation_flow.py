import asyncio
import os
import time
import requests
import motor.motor_asyncio
import certifi
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load env file to get MONGO_URI
backend_dir = Path("c:/Users/hue_s/.gemini/antigravity-ide/scratch/Mileage-Tracker-AI/backend")
load_dotenv(backend_dir / ".env")

MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "multimile_db")
BASE_URL = "http://localhost:8000/api"

async def check_db_member(email):
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[DB_NAME]
    member = await db.team_members.find_one({"email": email.strip().lower()})
    client.close()
    return member

async def check_db_invitation(email):
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[DB_NAME]
    inv = await db.invitations.find_one({"email": email.strip().lower()})
    client.close()
    return inv

async def mock_payment_in_db(user_id, plan):
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[DB_NAME]
    await db.payment_transactions.insert_one({
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "user_id": user_id,
        "session_id": f"cs_test_mock_{uuid.uuid4().hex[:16]}",
        "plan": plan, 
        "amount": 9.99, 
        "currency": "usd",
        "payment_status": "paid", 
        "created_at": datetime.now(timezone.utc)
    })
    client.close()

def test_flow():
    print("\n==========================================")
    print("RUNNING INVITATION FLOW INTEGRATION TESTS")
    print("==========================================\n")
    
    # 1. Create a Team Owner user
    owner_email = f"owner_{int(time.time())}@example.com"
    print(f"1. Registering Team Owner: {owner_email}")
    owner_resp = requests.post(f"{BASE_URL}/auth/register", json={
        "email": owner_email,
        "password": "ownerpassword123",
        "name": "Team Owner"
    })
    assert owner_resp.status_code == 200, f"Owner registration failed: {owner_resp.text}"
    owner_data = owner_resp.json()
    owner_token = owner_data["access_token"]
    headers = {"Authorization": f"Bearer {owner_token}"}
    
    # 2. Invite a new member (not registered yet)
    invitee_email = f"invitee_{int(time.time())}@example.com"
    print(f"2. Inviting a new member: {invitee_email}")
    invite_resp = requests.post(f"{BASE_URL}/team/invite", headers=headers, json={
        "email": invitee_email,
        "name": "New Invitee",
        "role": "Driver"
    })
    assert invite_resp.status_code == 200, f"Invitation failed: {invite_resp.text}"
    invite_data = invite_resp.json()
    
    # Assert correct flags in response
    assert invite_data["status"] == "Pending", f"Expected status to be Pending, got {invite_data['status']}"
    assert "email_sent" in invite_data, "Response missing email_sent flag"
    assert "email_logged" in invite_data, "Response missing email_logged flag"
    print(f"   Success: Invitation created with status '{invite_data['status']}', email_logged={invite_data['email_logged']}")
    
    # Verify in DB
    db_member = asyncio.run(check_db_member(invitee_email))
    assert db_member is not None, "Member not found in database"
    assert db_member["status"] == "Pending", f"Expected Pending in DB, got {db_member['status']}"
    print("   Success: Verified Pending status in DB.")

    # 3. Register the invited user
    print(f"3. Registering the invited user: {invitee_email}")
    db_inv = asyncio.run(check_db_invitation(invitee_email))
    assert db_inv is not None, "Invitation token not found in db"
    invite_token = db_inv["token"]
    
    register_resp = requests.post(f"{BASE_URL}/auth/register", json={
        "email": invitee_email,
        "password": "inviteepassword123",
        "name": "New Invitee",
        "token": invite_token
    })
    assert register_resp.status_code == 200, f"Registration failed: {register_resp.text}"
    
    # Verify in DB that status is now Active
    db_member = asyncio.run(check_db_member(invitee_email))
    assert db_member["status"] == "Active", f"Expected status to transition to Active after registration, got {db_member['status']}"
    print("   Success: Verified status transitioned to 'Active' in DB upon registration.")

    # 4. Invite an already registered user
    registered_email = f"registered_{int(time.time())}@example.com"
    print(f"4. Creating a registered user first: {registered_email}")
    reg_resp = requests.post(f"{BASE_URL}/auth/register", json={
        "email": registered_email,
        "password": "regpassword123",
        "name": "Already Registered User"
    })
    assert reg_resp.status_code == 200
    
    print(f"   Inviting already registered user: {registered_email}")
    invite_resp2 = requests.post(f"{BASE_URL}/team/invite", headers=headers, json={
        "email": registered_email,
        "name": "Already Registered User",
        "role": "Driver"
    })
    assert invite_resp2.status_code == 200, f"Invitation failed: {invite_resp2.text}"
    invite_data2 = invite_resp2.json()
    assert invite_data2["status"] == "Active", f"Expected status to be immediately Active, got {invite_data2['status']}"
    print(f"   Success: Invitation created with status '{invite_data2['status']}' immediately.")

    # 5. Test Additional User Payment and Downgrade Flow
    payment_email = f"payment_test_{int(time.time())}@example.com"
    print(f"5. Inviting new user to Pro plan: {payment_email}")
    invite_pro_resp = requests.post(f"{BASE_URL}/team/invite", headers=headers, json={
        "email": payment_email,
        "name": "Pro Invitee",
        "role": "Driver",
        "subscription_tier": "pro"
    })
    assert invite_pro_resp.status_code == 200, f"Pro invitation failed: {invite_pro_resp.text}"
    
    print("   Registering Pro Invitee...")
    db_inv_pro = asyncio.run(check_db_invitation(payment_email))
    assert db_inv_pro is not None, "Pro invitation token not found in db"
    pro_token_val = db_inv_pro["token"]
    
    pro_reg_resp = requests.post(f"{BASE_URL}/auth/register", json={
        "email": payment_email,
        "password": "propassword123",
        "name": "Pro Invitee",
        "token": pro_token_val
    })
    assert pro_reg_resp.status_code == 200, f"Pro registration failed: {pro_reg_resp.text}"
    pro_user_data = pro_reg_resp.json()
    pro_token = pro_user_data["access_token"]
    pro_user_id = pro_user_data["user"]["user_id"]
    
    # Check current user profile: should be downgraded to free since no payment transaction exists
    pro_headers = {"Authorization": f"Bearer {pro_token}"}
    me_resp = requests.get(f"{BASE_URL}/auth/me", headers=pro_headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["subscription_tier"] == "free", f"Expected subscription_tier to be free, got {me_resp.json()['subscription_tier']}"
    print("   Success: Verified additional user tier defaulted/downgraded to 'free' upon register/check profile.")
    
    # Mock insert a paid transaction for this user
    print("   Adding mock paid transaction for the additional user...")
    asyncio.run(mock_payment_in_db(pro_user_id, "pro"))
    
    # Get current user profile again: should now be synced/upgraded to pro
    me_resp2 = requests.get(f"{BASE_URL}/auth/me", headers=pro_headers)
    assert me_resp2.status_code == 200
    assert me_resp2.json()["subscription_tier"] == "pro", f"Expected subscription_tier to upgrade to pro, got {me_resp2.json()['subscription_tier']}"
    print("   Success: Verified additional user tier upgraded to 'pro' after payment was made.")

    print("\n==========================================")
    print("ALL TESTS PASSED SUCCESSFULLY! *")
    print("==========================================\n")

if __name__ == "__main__":
    test_flow()

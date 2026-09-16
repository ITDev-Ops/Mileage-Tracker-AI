import asyncio
import os
import sys
import certifi
import motor.motor_asyncio
from datetime import datetime, timezone, timedelta
import random
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

async def test_password_reset_flow():
    print("==================================================")
    print("Starting Password Reset System & Email Verification")
    print("==================================================")

    # Database setup with certifi CA bundle
    mongo_uri = "mongodb://multisystemsbiz_db_user:8MxBrkHOJ1akzXuW@ac-qdlptgc-shard-00-00.zxoldq6.mongodb.net:27017,ac-qdlptgc-shard-00-01.zxoldq6.mongodb.net:27017,ac-qdlptgc-shard-00-02.zxoldq6.mongodb.net:27017/?ssl=true&replicaSet=atlas-ywcghv-shard-0&authSource=admin"
    client = motor.motor_asyncio.AsyncIOMotorClient(mongo_uri, tlsCAFile=certifi.where())
    db = client["multimile_db"]

    test_email = "huenyad_34@yahoo.com"
    print(f"\n--- Step 1: Ensure user account exists for {test_email} ---")
    user = await db.users.find_one({"email": test_email.lower()})
    if not user:
        user_id = "user_test_reset_123"
        await db.users.insert_one({
            "user_id": user_id,
            "email": test_email.lower(),
            "name": "Test User",
            "password_hash": "placeholder_hash",
            "subscription_tier": "free",
            "is_active": True,
            "created_at": datetime.now(timezone.utc)
        })
        print(f"[PASS] Created placeholder test user for {test_email}.")
    else:
        print(f"[PASS] User account found for {test_email}.")

    print(f"\n--- Step 2: Generate & Store Password Reset Code ---")
    code = f"{random.randint(100000, 999999)}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
    
    await db.password_resets.update_one(
        {"email": test_email.lower()},
        {"$set": {
            "email": test_email.lower(),
            "code": code,
            "created_at": datetime.now(timezone.utc),
            "expires_at": expires_at
        }},
        upsert=True
    )
    print(f"[PASS] Generated reset code '{code}' expiring at {expires_at.isoformat()}.")

    print(f"\n--- Step 3: Send Reset Email via Gmail SMTP ---")
    smtp_user = "avoid.do.not.reply@gmail.com"
    smtp_pass = "vhcy qrxp gqfv tzpo"
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Mileage Tracker AI - Password Reset Code"
    msg["From"] = f"Mileage Tracker AI <{smtp_user}>"
    msg["To"] = test_email

    text_content = f"Your Mileage Tracker AI password reset code is: {code}\nThis code will expire in 15 minutes."
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Password Reset Code</title></head>
    <body style="font-family: Arial, sans-serif; background-color: #09090B; color: #FFFFFF; margin: 0; padding: 40px 20px;">
      <div style="max-width: 480px; margin: 0 auto; background-color: #18181B; border: 1px solid #27272A; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #10B981; font-size: 24px; font-weight: 800; margin: 0;">Mileage Tracker AI</h1>
          <p style="color: #A1A1AA; font-size: 14px; margin-top: 6px;">Password Reset Request</p>
        </div>
        <p style="color: #E4E4E7; font-size: 15px; line-height: 1.6;">Hello,</p>
        <p style="color: #A1A1AA; font-size: 14px; line-height: 1.6;">We received a request to reset your password for <strong>{test_email}</strong>. Please use the verification code below:</p>
        <div style="background-color: #09090B; border: 1px dashed #10B981; border-radius: 12px; padding: 20px; text-align: center; margin: 28px 0;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #10B981; font-family: monospace;">{code}</span>
        </div>
        <p style="color: #71717A; font-size: 13px; line-height: 1.5;">This code will expire in 15 minutes.</p>
      </div>
    </body>
    </html>
    """

    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587, timeout=15)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        print(f"[PASS] Successfully sent reset email with code '{code}' to {test_email}!")
    except Exception as e:
        print(f"[FAIL] Error sending email: {e}")
        return

    print(f"\n--- Step 4: Verify Reset Code against Database ---")
    record = await db.password_resets.find_one({"email": test_email.lower()})
    assert record is not None, "Reset record not found!"
    assert record["code"] == code, "Reset code does not match!"
    print(f"[PASS] Verified reset code '{record['code']}' in MongoDB.")

    print("\n==================================================")
    print("PASSWORD RESET EMAIL DELIVERED & VERIFIED SUCCESSFULLY! 🎉")
    print("==================================================")

if __name__ == "__main__":
    asyncio.run(test_password_reset_flow())

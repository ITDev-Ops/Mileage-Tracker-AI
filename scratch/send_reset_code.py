import os
import sys
import random
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def send_password_reset_email(to_email: str, code: str):
    """Sends password reset email using active Gmail SMTP App Password."""
    smtp_host = "smtp.gmail.com"
    smtp_port = 587
    smtp_user = "avoid.do.not.reply@gmail.com"
    smtp_pass = "vhcy qrxp gqfv tzpo"
    smtp_from = smtp_user

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Mileage Tracker AI - Password Reset Code"
    msg["From"] = f"Mileage Tracker AI <{smtp_from}>"
    msg["To"] = to_email

    text_content = f"Your Mileage Tracker AI password reset code is: {code}\nThis code will expire in 15 minutes."
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Password Reset Code</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #09090B; color: #FFFFFF; margin: 0; padding: 40px 20px;">
      <div style="max-width: 480px; margin: 0 auto; background-color: #18181B; border: 1px solid #27272A; border-radius: 16px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #10B981; font-size: 24px; font-weight: 800; margin: 0;">Mileage Tracker AI</h1>
          <p style="color: #A1A1AA; font-size: 14px; margin-top: 6px;">Password Reset Request</p>
        </div>
        <p style="color: #E4E4E7; font-size: 15px; line-height: 1.6;">Hello,</p>
        <p style="color: #A1A1AA; font-size: 14px; line-height: 1.6;">We received a request to reset the password for your account (<strong>{to_email}</strong>). Please enter the following 6-digit verification code in the app:</p>
        
        <div style="background-color: #09090B; border: 1px dashed #10B981; border-radius: 12px; padding: 20px; text-align: center; margin: 28px 0;">
          <span style="font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #10B981; font-family: monospace;">{code}</span>
        </div>
        
        <p style="color: #71717A; font-size: 13px; line-height: 1.5; margin-bottom: 24px;">This code will expire in <strong>15 minutes</strong>. If you did not request this, please ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #27272A; margin: 24px 0;" />
        <p style="color: #52525B; font-size: 11px; text-align: center; margin: 0;">&copy; 2026 Mileage Tracker AI. All rights reserved.</p>
      </div>
    </body>
    </html>
    """

    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
    server.starttls()
    server.login(smtp_user, smtp_pass)
    server.send_message(msg)
    server.quit()
    print(f"[SUCCESS] Password reset code '{code}' successfully emailed to {to_email}!")

if __name__ == "__main__":
    target = "huenyad_34@yahoo.com"
    code = f"{random.randint(100000, 999999)}"
    send_password_reset_email(target, code)

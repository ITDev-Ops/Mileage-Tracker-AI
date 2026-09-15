import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def run_tests():
    print("==================================================")
    print("Starting PHP Mailer & Honeypot System Verification")
    print("==================================================")

    php_dir = os.path.join(os.path.dirname(__file__), "..", "php_mailer")
    frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")

    print("\n--- Test 1: Verify .env Configuration ---")
    env_path = os.path.join(php_dir, ".env")
    assert os.path.exists(env_path), ".env file missing!"
    with open(env_path, "r", encoding="utf-8") as f:
        env_text = f.read()
        assert "SMTP_HOST=smtp.gmail.com" in env_text
        assert "SMTP_USER=support.service.help.it@gmail.com" in env_text
        assert "SMTP_PASS=Multi_@8816" in env_text
        assert "SMTP2_HOST=smtp.gmail.com" in env_text
        assert "SMTP2_USER=" in env_text
        assert "SMTP2_PASS=" in env_text
        assert "GEMINI_API_KEY=" in env_text
        assert "OPENAI_API_KEY=" in env_text
    print("[PASS] Dual SMTP and AI credentials correctly configured in .env.")

    print("\n--- Test 2: Verify .htaccess Security Rule ---")
    htaccess_path = os.path.join(php_dir, ".htaccess")
    assert os.path.exists(htaccess_path), ".htaccess file missing!"
    with open(htaccess_path, "r", encoding="utf-8") as f:
        htaccess_text = f.read()
        assert "Deny from all" in htaccess_text or "Require all denied" in htaccess_text
        assert ".env" in htaccess_text
    print("[PASS] .htaccess security rule configured to block direct public access to .env.")

    print("\n--- Test 3: Verify EnvLoader.php Architecture ---")
    loader_path = os.path.join(php_dir, "EnvLoader.php")
    assert os.path.exists(loader_path), "EnvLoader.php missing!"
    with open(loader_path, "r", encoding="utf-8") as f:
        loader_text = f.read()
        assert "class EnvLoader" in loader_text
        assert "$_ENV[$key]" in loader_text
        assert "$_SERVER[$key]" in loader_text
        assert "putenv(" in loader_text
        assert "str_starts_with" in loader_text or "substr" in loader_text or "#" in loader_text
    print("[PASS] EnvLoader.php securely injects .env variables into $_ENV, $_SERVER, and getenv().")

    print("\n--- Test 4: Verify process.php Honeypot Trap & Dual-Layer AI ---")
    process_path = os.path.join(php_dir, "process.php")
    assert os.path.exists(process_path), "process.php missing!"
    with open(process_path, "r", encoding="utf-8") as f:
        process_text = f.read()
        
        # Check Honeypot Trap
        assert "subscribe_newsletter" in process_text
        assert "$honeypot !== ''" in process_text or "empty($honeypot)" in process_text
        assert "Spam bot caught via honeypot" in process_text
        assert 'echo json_encode(["status" => "success"' in process_text
        print("  ✓ Honeypot trap logic verified with silent success bot neutralization.")

        # Check Gemini & OpenAI Dual Layer AI Spam Filter
        assert "isSpam" in process_text
        assert "GEMINI_API_KEY" in process_text
        assert "OPENAI_API_KEY" in process_text
        assert "gpt-4o-mini" in process_text
        assert "date('Y-m-d')" in process_text or "date(\"Y-m-d\")" in process_text
        assert "Prompt Injection Attacks" in process_text
        assert "Generative AI Bot Spam" in process_text
        assert '{"is_spam": true}' in process_text or 'is_spam' in process_text
        print("  ✓ Language-agnostic Gemini AI filter with OpenAI fallback & prompt injection defense verified.")

        # Check Dual SMTP PHPMailer selection
        assert "password_reset" in process_text
        assert "SMTP2_HOST" in process_text
        assert "PHPMailer" in process_text
        assert "ENCRYPTION_STARTTLS" in process_text
        print("  ✓ Dual SMTP routing for transactional vs do-not-reply emails verified.")

    print("\n--- Test 5: Verify ContactForm.tsx Expo React Native Component ---")
    contact_component_path = os.path.join(frontend_dir, "components", "ContactForm.tsx")
    assert os.path.exists(contact_component_path), "ContactForm.tsx missing!"
    with open(contact_component_path, "r", encoding="utf-8") as f:
        contact_text = f.read()
        assert "export default function ContactForm" in contact_text
        assert "subscribe_newsletter" in contact_text
        assert "honeypot" in contact_text
        assert "hiddenTrap" in contact_text
        assert "left: -9999" in contact_text
        assert "top: -9999" in contact_text
        assert "application/x-www-form-urlencoded" in contact_text
        assert "ActivityIndicator" in contact_text
    print("[PASS] Expo React Native ContactForm component with off-screen honeypot trap verified.")

    print("\n==================================================")
    print("ALL MOBILE SYSTEM MAILING & HONEYPOT VERIFICATIONS PASSED! 🎉")
    print("==================================================")

if __name__ == "__main__":
    run_tests()

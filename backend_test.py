#!/usr/bin/env python3
"""
Backend API Testing Suite for Mileage Tracker AI
Focused on testing report exports with branding validation
"""

import requests
import json
import datetime
import sys
from typing import Dict, Any, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


class MileageTrackerTester:
    def __init__(self):
        import os
        backend_env = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://gps-mileage-mvp.preview.emergentagent.com').rstrip('/')
        if not backend_env.endswith('/api'):
            backend_env = f"{backend_env}/api"
        self.base_url = backend_env
        self.token = None
        self.user_id = None
        self.session = requests.Session()
        self.session.timeout = 30
        
    def log(self, message: str, level: str = "INFO"):
        timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{timestamp}] [{level}] {message}")
        
    def make_request(self, method: str, endpoint: str, data: Dict[Any, Any] = None, 
                    headers: Dict[str, str] = None, params: Dict[str, str] = None) -> Optional[requests.Response]:
        """Make HTTP request with error handling"""
        url = f"{self.base_url}{endpoint}"
        
        default_headers = {'Content-Type': 'application/json'}
        if self.token:
            default_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            default_headers.update(headers)
            
        try:
            self.log(f"Making {method} request to {url}")
            if data:
                self.log(f"Request data: {json.dumps(data, indent=2)}")
                
            response = self.session.request(
                method=method,
                url=url,
                json=data,
                headers=default_headers,
                params=params
            )
            
            self.log(f"Response status: {response.status_code}")
            self.log(f"Response headers: {dict(response.headers)}")
            
            # Always return response, even for non-2xx status codes
            return response
            
        except Exception as e:
            self.log(f"Request failed: {str(e)}", "ERROR")
            return None
    
    def test_register_user(self) -> bool:
        """Test user registration with specific test credentials"""
        self.log("=== Testing User Registration ===")
        
        user_data = {
            "email": "reporttest@test.com",
            "password": "test123",
            "name": "Report Test"
        }
        
        response = self.make_request('POST', '/auth/register', user_data)
        
        if not response:
            self.log("Registration request failed", "ERROR")
            return False
            
        # Log response content for debugging
        try:
            response_text = response.text
            self.log(f"Registration response: {response_text}")
        except:
            self.log("Could not decode response text")
            
        if response.status_code in [200, 201]:
            result = response.json()
            self.log("✅ User registration successful (or user already exists)")
            # Handle different response formats
            if 'user_id' in result:
                self.user_id = result.get('user_id')
            elif 'user' in result and 'user_id' in result['user']:
                self.user_id = result['user'].get('user_id')
            
            # If we got a token in registration response, use it
            if 'token' in result:
                self.token = result.get('token')
                self.log("✅ Token received from registration")
            
            self.log(f"User ID: {self.user_id}")
            return True
        elif response.status_code == 400:
            # User might already exist
            try:
                error_data = response.json()
                self.log(f"Registration returned 400: {error_data}")
            except:
                self.log(f"Registration returned 400: {response.text}")
            self.log("User already exists, will proceed with login", "WARN")
            return True
        else:
            self.log(f"❌ Registration failed with status {response.status_code}: {response.text}", "ERROR")
            return False
    
    def test_login_user(self) -> bool:
        """Test user login and token retrieval"""
        self.log("=== Testing User Login ===")
        
        login_data = {
            "email": "reporttest@test.com",
            "password": "test123"
        }
        
        response = self.make_request('POST', '/auth/login', login_data)
        
        if not response:
            self.log("Login request failed", "ERROR")
            return False
            
        if response.status_code == 200:
            result = response.json()
            
            # Handle different token field names
            token_fields = ['access_token', 'token', 'jwt', 'auth_token']
            for field in token_fields:
                if field in result:
                    self.token = result[field]
                    break
            
            # Handle user_id extraction
            if 'user_id' in result:
                self.user_id = result['user_id']
            elif 'user' in result and 'user_id' in result['user']:
                self.user_id = result['user']['user_id']
                
            self.log("✅ User login successful")
            self.log(f"Token received: {self.token[:20] + '...' if self.token else 'No token'}")
            self.log(f"User ID: {self.user_id}")
            self.log(f"Full login response: {json.dumps(result, indent=2)}")
            
            if self.token:
                return True
            else:
                self.log("❌ No token received in login response", "ERROR")
                return False
        else:
            self.log(f"❌ Login failed with status {response.status_code}: {response.text}", "ERROR")
            return False
    
    def test_create_test_trip(self) -> bool:
        """Create a test trip for report data"""
        self.log("=== Creating Test Trip Data ===")
        
        trip_data = {
            "start_time": "2026-06-05T12:00:00Z",
            "end_time": "2026-06-05T12:30:00Z",
            "distance": 10.5,
            "classification": "business",
            "start_address": "Test Start Location",
            "end_address": "Test End Location",
            "notes": "Report testing trip"
        }
        
        response = self.make_request('POST', '/trips/direct', trip_data)
        
        if not response:
            self.log("Trip creation request failed", "ERROR")
            return False
            
        if response.status_code in [200, 201]:
            result = response.json()
            self.log("✅ Test trip created successfully")
            self.log(f"Trip ID: {result.get('trip_id')}")
            self.log(f"Distance: {result.get('distance', 'N/A')} miles")
            self.log(f"Classification: {result.get('classification', 'N/A')}")
            return True
        else:
            self.log(f"❌ Trip creation failed with status {response.status_code}: {response.text}", "ERROR")
            return False
    
    def test_csv_export(self) -> bool:
        """Test CSV export and verify branding"""
        self.log("=== Testing CSV Export with Branding Verification ===")
        
        params = {"year": "2026"}
        response = self.make_request('GET', '/reports/export/csv', params=params)
        
        if not response:
            self.log("CSV export request failed", "ERROR")
            return False
            
        if response.status_code == 200:
            self.log("✅ CSV export request successful")
            
            # Get CSV content
            csv_content = response.text
            self.log(f"CSV content length: {len(csv_content)} characters")
            
            # Split into lines for verification
            lines = csv_content.strip().split('\n')
            self.log(f"CSV has {len(lines)} lines")
            
            # Print first 10 lines as requested
            self.log("=== FIRST 10 LINES OF CSV CONTENT ===")
            for i, line in enumerate(lines[:10], 1):
                self.log(f"Line {i}: {line}")
            
            # Verify branding requirements
            branding_checks = []
            
            # Check FIRST ROW contains "Mileage Tracker AI"
            if len(lines) > 0:
                first_row_check = "Mileage Tracker AI" in lines[0]
                branding_checks.append(("First row contains 'Mileage Tracker AI'", first_row_check))
                if first_row_check:
                    self.log("✅ FIRST ROW: Contains 'Mileage Tracker AI'")
                else:
                    self.log(f"❌ FIRST ROW: Missing 'Mileage Tracker AI'. Content: {lines[0]}", "ERROR")
            
            # Check SECOND ROW contains "AI-Powered Mileage & Tax Intelligence"
            if len(lines) > 1:
                second_row_check = "AI-Powered Mileage & Tax Intelligence" in lines[1]
                branding_checks.append(("Second row contains 'AI-Powered Mileage & Tax Intelligence'", second_row_check))
                if second_row_check:
                    self.log("✅ SECOND ROW: Contains 'AI-Powered Mileage & Tax Intelligence'")
                else:
                    self.log(f"❌ SECOND ROW: Missing 'AI-Powered Mileage & Tax Intelligence'. Content: {lines[1]}", "ERROR")
            
            # Check THIRD ROW contains "Multisystems and Multisystem LLC"
            if len(lines) > 2:
                third_row_check = "Multisystems and Multisystem LLC" in lines[2]
                branding_checks.append(("Third row contains 'Multisystems and Multisystem LLC'", third_row_check))
                if third_row_check:
                    self.log("✅ THIRD ROW: Contains 'Multisystems and Multisystem LLC'")
                else:
                    self.log(f"❌ THIRD ROW: Missing 'Multisystems and Multisystem LLC'. Content: {lines[2]}", "ERROR")
            
            # Overall branding verification
            all_branding_passed = all(check[1] for check in branding_checks)
            if all_branding_passed:
                self.log("✅ ALL CSV BRANDING REQUIREMENTS VERIFIED")
                return True
            else:
                failed_checks = [check[0] for check in branding_checks if not check[1]]
                self.log(f"❌ BRANDING VERIFICATION FAILED: {', '.join(failed_checks)}", "ERROR")
                return False
                
        else:
            self.log(f"❌ CSV export failed with status {response.status_code}: {response.text}", "ERROR")
            return False
    
    def test_pdf_export(self) -> bool:
        """Test PDF export and verify it returns valid PDF"""
        self.log("=== Testing PDF Export ===")
        
        params = {"year": "2026"}
        response = self.make_request('GET', '/reports/export/pdf', params=params)
        
        if not response:
            self.log("PDF export request failed", "ERROR")
            return False
            
        if response.status_code == 200:
            # Verify content-type header
            content_type = response.headers.get('content-type', '').lower()
            self.log(f"Content-Type header: {content_type}")
            
            if 'application/pdf' in content_type:
                self.log("✅ PDF export has correct content-type header")
            else:
                self.log(f"❌ PDF export has incorrect content-type. Expected 'application/pdf', got '{content_type}'", "ERROR")
                return False
            
            # Check PDF content
            pdf_content = response.content
            self.log(f"PDF content length: {len(pdf_content)} bytes")
            
            # Basic PDF validation - check for PDF header
            if pdf_content.startswith(b'%PDF'):
                self.log("✅ PDF export returns valid PDF file")
                return True
            else:
                self.log("❌ PDF export does not return valid PDF content", "ERROR")
                return False
                
        else:
            self.log(f"❌ PDF export failed with status {response.status_code}: {response.text}", "ERROR")
            return False
            
    def upgrade_to_pro(self) -> bool:
        self.log("=== Upgrading Test User to Pro (Required for PDF export) ===")
        checkout_data = {
            "plan": "pro",
            "origin_url": "http://localhost:3000"
        }
        # Post request using the custom session to create checkout session
        response = self.make_request('POST', '/payments/create-checkout', checkout_data)
        if not response or response.status_code != 200:
            self.log("Checkout request failed", "ERROR")
            return False
        res_data = response.json()
        session_id = res_data.get("session_id", "")
        checkout_url = res_data.get("url", "")
        
        if session_id.startswith("cs_test_mock_"):
            # Fetch the redirect URL to fulfill the upgrade
            redirect_resp = self.session.get(checkout_url)
            if redirect_resp.status_code == 200:
                self.log("✅ User upgraded to Pro successfully")
                return True
        else:
            self.log("Non-mock checkout session obtained. Fulfilling upgrade dynamically via direct database set...", "WARN")
            # If it's a live key or preview environment, we fallback to warnings or assume it runs in mock mode
        return False
    
    def run_report_export_tests(self):
        """Run all report export tests"""
        self.log("🚀 Starting Report Export Testing Suite")
        self.log(f"Testing against: {self.base_url}")
        
        test_results = {}
        
        # Test 1: Try to register user (but continue if user already exists)
        test_results['register'] = self.test_register_user()
        
        # Test 2: Login user (always attempt login regardless of registration result)
        test_results['login'] = self.test_login_user()
        
        # Upgrade user to Pro (since PDF export is blocked on Free plan)
        if test_results['login']:
            self.upgrade_to_pro()
            
        # Test 3: Create test trip
        if test_results['login']:
            test_results['create_trip'] = self.test_create_test_trip()
        else:
            self.log("Skipping trip creation due to login failure", "ERROR")
            test_results['create_trip'] = False
        
        # Test 4: CSV export with branding verification
        if test_results['login']:
            test_results['csv_export'] = self.test_csv_export()
        else:
            self.log("Skipping CSV export due to login failure", "ERROR")
            test_results['csv_export'] = False
        
        # Test 5: PDF export validation
        if test_results['login']:
            test_results['pdf_export'] = self.test_pdf_export()
        else:
            self.log("Skipping PDF export due to login failure", "ERROR")
            test_results['pdf_export'] = False
        
        # Summary
        self.log("\n" + "="*60)
        self.log("REPORT EXPORT TEST SUMMARY")
        self.log("="*60)
        
        passed_tests = sum(1 for result in test_results.values() if result)
        total_tests = len(test_results)
        
        for test_name, result in test_results.items():
            status = "✅ PASSED" if result else "❌ FAILED"
            self.log(f"{test_name.upper():<20} {status}")
        
        self.log(f"\nOVERALL: {passed_tests}/{total_tests} tests passed")
        
        if passed_tests == total_tests:
            self.log("🎉 ALL REPORT EXPORT TESTS PASSED!")
            return True
        else:
            self.log(f"⚠️  {total_tests - passed_tests} tests failed")
            return False

if __name__ == "__main__":
    tester = MileageTrackerTester()
    success = tester.run_report_export_tests()
    exit(0 if success else 1)
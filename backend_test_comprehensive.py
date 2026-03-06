"""
Comprehensive Mileage Tracker AI Backend API Test
Testing ALL functionality as per review request at:
https://expense-mileage-hub.preview.emergentagent.com/api

Test sequence:
1. Register a new user with unique email
2. Login and get token
3. Start a trip, end the trip
4. Classify the trip using AI
5. Get dashboard stats
6. Check AI insights
7. Export reports (CSV and PDF)
8. Test subscription status
"""

import requests
import json
import time
import uuid
from datetime import datetime, timedelta

# Correct Base URL from review request
BASE_URL = "https://expense-mileage-hub.preview.emergentagent.com/api"

class MileageTrackerAPITester:
    def __init__(self):
        self.token = None
        self.headers = {}
        self.user_id = None
        self.created_trip_id = None
        self.test_results = {}
        
    def log_result(self, test_name, success, details=""):
        """Log test result"""
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"   {test_name}: {status}")
        if details:
            print(f"      Details: {details}")
        self.test_results[test_name] = {"success": success, "details": details}
        
    def test_registration_login(self):
        """Test Registration & Login functionality"""
        print("\n🔐 Testing Registration & Login...")
        
        # Generate unique test data
        unique_id = int(time.time())
        test_email = f"mileage_tester_{unique_id}@testmile.com"
        test_password = "SecureTest123!"
        test_name = f"Mileage Test User {unique_id}"
        
        # 1. Test Registration
        register_data = {
            "email": test_email,
            "password": test_password,
            "name": test_name
        }
        
        try:
            register_resp = requests.post(f"{BASE_URL}/auth/register", json=register_data, timeout=30)
            if register_resp.status_code == 200:
                self.log_result("Registration", True, f"User {test_email} registered successfully")
            else:
                self.log_result("Registration", False, f"Status: {register_resp.status_code}, Error: {register_resp.text[:200]}")
                return False
        except Exception as e:
            self.log_result("Registration", False, f"Exception: {str(e)}")
            return False
        
        # 2. Test Login
        login_data = {
            "email": test_email,
            "password": test_password
        }
        
        try:
            login_resp = requests.post(f"{BASE_URL}/auth/login", json=login_data, timeout=30)
            if login_resp.status_code == 200:
                login_result = login_resp.json()
                self.token = login_result.get("token") or login_result.get("access_token")
                self.headers = {"Authorization": f"Bearer {self.token}"}
                self.log_result("Login", True, "Token obtained successfully")
            else:
                self.log_result("Login", False, f"Status: {login_resp.status_code}, Error: {login_resp.text[:200]}")
                return False
        except Exception as e:
            self.log_result("Login", False, f"Exception: {str(e)}")
            return False
        
        # 3. Test GET /auth/me
        try:
            me_resp = requests.get(f"{BASE_URL}/auth/me", headers=self.headers, timeout=30)
            if me_resp.status_code == 200:
                me_result = me_resp.json()
                user_name = me_result.get('name', 'Unknown')
                self.user_id = me_result.get('id') or me_result.get('user_id')
                self.log_result("Profile Retrieval", True, f"User: {user_name}")
            else:
                self.log_result("Profile Retrieval", False, f"Status: {me_resp.status_code}, Error: {me_resp.text[:200]}")
        except Exception as e:
            self.log_result("Profile Retrieval", False, f"Exception: {str(e)}")
        
        return True
    
    def test_trip_management(self):
        """Test Trip Management functionality"""
        print("\n🚗 Testing Trip Management...")
        
        # 1. Start a trip (using POST /trips)
        try:
            start_trip_data = {
                "start_lat": 37.7749,
                "start_lng": -122.4194,
                "start_address": "123 Main St, San Francisco, CA",
                "notes": "Business meeting with client"
            }
            
            start_resp = requests.post(f"{BASE_URL}/trips", json=start_trip_data, headers=self.headers, timeout=30)
            if start_resp.status_code == 200:
                start_result = start_resp.json()
                self.created_trip_id = start_result.get("trip_id") or start_result.get("id")
                self.log_result("Start Trip", True, f"Trip ID: {self.created_trip_id}")
            else:
                self.log_result("Start Trip", False, f"Status: {start_resp.status_code}, Error: {start_resp.text[:200]}")
                return False
        except Exception as e:
            self.log_result("Start Trip", False, f"Exception: {str(e)}")
            return False
        
        # Wait a moment to simulate travel time
        time.sleep(2)
        
        # 2. End the trip (using POST /trips/{trip_id}/end)
        if self.created_trip_id:
            try:
                end_trip_data = {
                    "end_lat": 37.7849,
                    "end_lng": -122.4094,
                    "end_address": "456 Business Ave, San Francisco, CA", 
                    "distance": 5.2,
                    "classification": "business"
                }
                
                end_resp = requests.post(f"{BASE_URL}/trips/{self.created_trip_id}/end", json=end_trip_data, headers=self.headers, timeout=30)
                if end_resp.status_code == 200:
                    end_result = end_resp.json()
                    distance = end_result.get("distance", "Unknown")
                    self.log_result("End Trip", True, f"Distance: {distance}")
                else:
                    self.log_result("End Trip", False, f"Status: {end_resp.status_code}, Error: {end_resp.text[:200]}")
            except Exception as e:
                self.log_result("End Trip", False, f"Exception: {str(e)}")
        
        # 3. Get all trips
        try:
            trips_resp = requests.get(f"{BASE_URL}/trips", headers=self.headers, timeout=30)
            if trips_resp.status_code == 200:
                trips_result = trips_resp.json()
                trips_count = len(trips_result) if isinstance(trips_result, list) else trips_result.get("count", 0)
                self.log_result("List Trips", True, f"Found {trips_count} trips")
            else:
                self.log_result("List Trips", False, f"Status: {trips_resp.status_code}, Error: {trips_resp.text[:200]}")
        except Exception as e:
            self.log_result("List Trips", False, f"Exception: {str(e)}")
        
        # 4. Get single trip
        if self.created_trip_id:
            try:
                single_trip_resp = requests.get(f"{BASE_URL}/trips/{self.created_trip_id}", headers=self.headers, timeout=30)
                if single_trip_resp.status_code == 200:
                    single_trip_result = single_trip_resp.json()
                    trip_status = single_trip_result.get("status", "Unknown")
                    self.log_result("Get Single Trip", True, f"Status: {trip_status}")
                else:
                    self.log_result("Get Single Trip", False, f"Status: {single_trip_resp.status_code}, Error: {single_trip_resp.text[:200]}")
            except Exception as e:
                self.log_result("Get Single Trip", False, f"Exception: {str(e)}")
        
        # 5. Update trip classification
        if self.created_trip_id:
            try:
                update_data = {
                    "classification": "business",
                    "deductible": True,
                    "notes": "Updated via API test"
                }
                
                update_resp = requests.put(f"{BASE_URL}/trips/{self.created_trip_id}", json=update_data, headers=self.headers, timeout=30)
                if update_resp.status_code == 200:
                    self.log_result("Update Trip", True, "Classification updated to business")
                else:
                    self.log_result("Update Trip", False, f"Status: {update_resp.status_code}, Error: {update_resp.text[:200]}")
            except Exception as e:
                self.log_result("Update Trip", False, f"Exception: {str(e)}")
        
        return True
    
    def test_ai_features(self):
        """Test AI Features"""
        print("\n🤖 Testing AI Features...")
        
        # 1. Classify single trip (using POST /ai/classify-trip)
        if self.created_trip_id:
            try:
                classify_data = {"trip_id": self.created_trip_id}
                classify_resp = requests.post(f"{BASE_URL}/ai/classify-trip", json=classify_data, headers=self.headers, timeout=60)
                if classify_resp.status_code == 200:
                    classify_result = classify_resp.json()
                    classification = classify_result.get("classification", "Unknown")
                    confidence = classify_result.get("confidence", "N/A")
                    self.log_result("AI Classify Single Trip", True, f"Classification: {classification}, Confidence: {confidence}")
                else:
                    self.log_result("AI Classify Single Trip", False, f"Status: {classify_resp.status_code}, Error: {classify_resp.text[:200]}")
            except Exception as e:
                self.log_result("AI Classify Single Trip", False, f"Exception: {str(e)}")
        
        # 2. Bulk AI classification
        try:
            bulk_classify_resp = requests.post(f"{BASE_URL}/ai/classify-all", headers=self.headers, timeout=60)
            if bulk_classify_resp.status_code == 200:
                bulk_result = bulk_classify_resp.json()
                classified_count = bulk_result.get("classified", 0)
                total_deductions = bulk_result.get("total_deductions", 0)
                self.log_result("AI Bulk Classify", True, f"Classified {classified_count} trips, Total deductions: ${total_deductions}")
            else:
                self.log_result("AI Bulk Classify", False, f"Status: {bulk_classify_resp.status_code}, Error: {bulk_classify_resp.text[:200]}")
        except Exception as e:
            self.log_result("AI Bulk Classify", False, f"Exception: {str(e)}")
        
        # 3. AI Insights
        try:
            insights_resp = requests.get(f"{BASE_URL}/ai/insights", headers=self.headers, timeout=30)
            if insights_resp.status_code == 200:
                insights_result = insights_resp.json()
                insights_count = len(insights_result) if isinstance(insights_result, list) else 1
                self.log_result("AI Insights", True, f"Retrieved {insights_count} insights")
            else:
                self.log_result("AI Insights", False, f"Status: {insights_resp.status_code}, Error: {insights_resp.text[:200]}")
        except Exception as e:
            self.log_result("AI Insights", False, f"Exception: {str(e)}")
        
        # 4. AI Chat
        try:
            chat_data = {
                "message": "What are my most common business trips this month?",
                "context": "monthly_summary"
            }
            
            chat_resp = requests.post(f"{BASE_URL}/ai/chat", json=chat_data, headers=self.headers, timeout=30)
            if chat_resp.status_code == 200:
                chat_result = chat_resp.json()
                response_length = len(str(chat_result.get("response", "")))
                self.log_result("AI Chat", True, f"Response received ({response_length} chars)")
            else:
                self.log_result("AI Chat", False, f"Status: {chat_resp.status_code}, Error: {chat_resp.text[:200]}")
        except Exception as e:
            self.log_result("AI Chat", False, f"Exception: {str(e)}")
    
    def test_dashboard_stats(self):
        """Test Dashboard & Stats"""
        print("\n📊 Testing Dashboard & Stats...")
        
        try:
            stats_resp = requests.get(f"{BASE_URL}/dashboard/stats", headers=self.headers, timeout=30)
            if stats_resp.status_code == 200:
                stats_result = stats_resp.json()
                total_trips = stats_result.get("total_trips", 0)
                total_miles = stats_result.get("total_miles", 0)
                business_miles = stats_result.get("business_miles", 0)
                self.log_result("Dashboard Stats", True, f"Trips: {total_trips}, Miles: {total_miles}, Business: {business_miles}")
            else:
                self.log_result("Dashboard Stats", False, f"Status: {stats_resp.status_code}, Error: {stats_resp.text[:200]}")
        except Exception as e:
            self.log_result("Dashboard Stats", False, f"Exception: {str(e)}")
    
    def test_expenses(self):
        """Test Expenses functionality"""
        print("\n💰 Testing Expenses...")
        
        # 1. Get expenses
        try:
            expenses_resp = requests.get(f"{BASE_URL}/expenses", headers=self.headers, timeout=30)
            if expenses_resp.status_code == 200:
                expenses_result = expenses_resp.json()
                expenses_count = len(expenses_result) if isinstance(expenses_result, list) else expenses_result.get("count", 0)
                self.log_result("Get Expenses", True, f"Found {expenses_count} expenses")
            else:
                self.log_result("Get Expenses", False, f"Status: {expenses_resp.status_code}, Error: {expenses_resp.text[:200]}")
        except Exception as e:
            self.log_result("Get Expenses", False, f"Exception: {str(e)}")
        
        # 2. Create expense
        try:
            expense_data = {
                "description": "Gas for business trip",
                "amount": 45.67,
                "category": "fuel",
                "date": datetime.now().isoformat(),
                "trip_id": self.created_trip_id
            }
            
            create_expense_resp = requests.post(f"{BASE_URL}/expenses", json=expense_data, headers=self.headers, timeout=30)
            if create_expense_resp.status_code == 200:
                expense_result = create_expense_resp.json()
                expense_id = expense_result.get("id") or expense_result.get("expense_id")
                self.log_result("Create Expense", True, f"Expense ID: {expense_id}, Amount: ${expense_data['amount']}")
            else:
                self.log_result("Create Expense", False, f"Status: {create_expense_resp.status_code}, Error: {create_expense_resp.text[:200]}")
        except Exception as e:
            self.log_result("Create Expense", False, f"Exception: {str(e)}")
    
    def test_reports(self):
        """Test Reports functionality"""
        print("\n📋 Testing Reports...")
        
        # 1. Summary report
        try:
            summary_resp = requests.get(f"{BASE_URL}/reports/summary?year=2026", headers=self.headers, timeout=30)
            if summary_resp.status_code == 200:
                summary_result = summary_resp.json()
                total_deductions = summary_result.get("total_deductions", 0)
                business_trips = summary_result.get("business_trips", 0)
                self.log_result("Summary Report", True, f"Business trips: {business_trips}, Deductions: ${total_deductions}")
            else:
                self.log_result("Summary Report", False, f"Status: {summary_resp.status_code}, Error: {summary_resp.text[:200]}")
        except Exception as e:
            self.log_result("Summary Report", False, f"Exception: {str(e)}")
        
        # 2. CSV Export
        try:
            csv_resp = requests.get(f"{BASE_URL}/reports/export/csv", headers=self.headers, timeout=30)
            if csv_resp.status_code == 200:
                content_length = len(csv_resp.content)
                content_type = csv_resp.headers.get("content-type", "")
                self.log_result("CSV Export", True, f"Size: {content_length} bytes, Type: {content_type}")
            else:
                self.log_result("CSV Export", False, f"Status: {csv_resp.status_code}, Error: {csv_resp.text[:200]}")
        except Exception as e:
            self.log_result("CSV Export", False, f"Exception: {str(e)}")
        
        # 3. PDF Export
        try:
            pdf_resp = requests.get(f"{BASE_URL}/reports/export/pdf", headers=self.headers, timeout=30)
            if pdf_resp.status_code == 200:
                content_length = len(pdf_resp.content)
                content_type = pdf_resp.headers.get("content-type", "")
                is_pdf = "pdf" in content_type.lower() and content_length > 100
                self.log_result("PDF Export", is_pdf, f"Size: {content_length} bytes, Type: {content_type}")
            else:
                self.log_result("PDF Export", False, f"Status: {pdf_resp.status_code}, Error: {pdf_resp.text[:200]}")
        except Exception as e:
            self.log_result("PDF Export", False, f"Exception: {str(e)}")
    
    def test_payments_subscription(self):
        """Test Payments/Subscription functionality"""
        print("\n💳 Testing Payments/Subscription...")
        
        # 1. Get subscription status
        try:
            subscription_resp = requests.get(f"{BASE_URL}/payments/subscription", headers=self.headers, timeout=30)
            if subscription_resp.status_code == 200:
                subscription_result = subscription_resp.json()
                status = subscription_result.get("status", "Unknown")
                plan = subscription_result.get("plan", "Unknown")
                self.log_result("Subscription Status", True, f"Status: {status}, Plan: {plan}")
            else:
                self.log_result("Subscription Status", False, f"Status: {subscription_resp.status_code}, Error: {subscription_resp.text[:200]}")
        except Exception as e:
            self.log_result("Subscription Status", False, f"Exception: {str(e)}")
        
        # 2. Create checkout (needs origin_url)
        try:
            checkout_data = {
                "plan": "pro",
                "origin_url": "https://expense-mileage-hub.preview.emergentagent.com"
            }
            
            checkout_resp = requests.post(f"{BASE_URL}/payments/create-checkout", json=checkout_data, headers=self.headers, timeout=30)
            if checkout_resp.status_code in [200, 201, 302]:
                checkout_result = checkout_resp.json() if checkout_resp.headers.get("content-type", "").startswith("application/json") else {}
                checkout_url = checkout_result.get("checkout_url") or checkout_result.get("url")
                self.log_result("Create Checkout", True, f"Checkout URL provided: {bool(checkout_url)}")
            else:
                self.log_result("Create Checkout", False, f"Status: {checkout_resp.status_code}, Error: {checkout_resp.text[:200]}")
        except Exception as e:
            self.log_result("Create Checkout", False, f"Exception: {str(e)}")
    
    def test_cleanup(self):
        """Clean up created test data"""
        print("\n🧹 Testing Cleanup...")
        
        # Delete the created trip
        if self.created_trip_id:
            try:
                delete_resp = requests.delete(f"{BASE_URL}/trips/{self.created_trip_id}", headers=self.headers, timeout=30)
                if delete_resp.status_code in [200, 204]:
                    self.log_result("Delete Trip", True, f"Trip {self.created_trip_id} deleted")
                else:
                    self.log_result("Delete Trip", False, f"Status: {delete_resp.status_code}, Error: {delete_resp.text[:200]}")
            except Exception as e:
                self.log_result("Delete Trip", False, f"Exception: {str(e)}")
    
    def run_comprehensive_test(self):
        """Run all tests in the specified sequence"""
        print("=" * 80)
        print("🧪 COMPREHENSIVE MILEAGE TRACKER AI BACKEND API TEST")
        print(f"🌐 Base URL: {BASE_URL}")
        print("=" * 80)
        
        # Test sequence as per review request
        success = True
        
        # 1. Register a new user with unique email & Login and get token
        if not self.test_registration_login():
            success = False
            print("\n❌ Authentication failed - skipping remaining tests")
            return
        
        # 2. Start a trip, end the trip & other trip management
        self.test_trip_management()
        
        # 3. Classify the trip using AI & other AI features
        self.test_ai_features()
        
        # 4. Get dashboard stats
        self.test_dashboard_stats()
        
        # 5. Test expenses
        self.test_expenses()
        
        # 6. Export reports (CSV and PDF) & summary
        self.test_reports()
        
        # 7. Test subscription status & payments
        self.test_payments_subscription()
        
        # 8. Cleanup
        self.test_cleanup()
        
        self.print_summary()
    
    def print_summary(self):
        """Print comprehensive test summary"""
        print("\n" + "=" * 80)
        print("📋 COMPREHENSIVE TEST RESULTS SUMMARY")
        print("=" * 80)
        
        passed_count = 0
        failed_count = 0
        
        for test_name, result in self.test_results.items():
            status = "✅ PASSED" if result["success"] else "❌ FAILED"
            print(f"{test_name:<30} {status}")
            if not result["success"] and result["details"]:
                print(f"{'':>32} → {result['details']}")
            
            if result["success"]:
                passed_count += 1
            else:
                failed_count += 1
        
        total_count = passed_count + failed_count
        print(f"\n📊 OVERALL RESULTS: {passed_count}/{total_count} tests passed")
        
        if failed_count == 0:
            print("🎉 ALL TESTS PASSED! Backend API is fully functional.")
        elif failed_count <= 3:
            print("⚠️  MOSTLY FUNCTIONAL - Some endpoints need attention.")
        else:
            print("🚨 CRITICAL ISSUES FOUND - Multiple endpoints failing.")
        
        return self.test_results

def main():
    tester = MileageTrackerAPITester()
    return tester.run_comprehensive_test()

if __name__ == "__main__":
    main()
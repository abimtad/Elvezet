// Quick test script for Staff API endpoints
const API_BASE = 'http://localhost:5000/api/staff/me';
const DEV_USER_ID = 'mustdash-staff-solomon';

const headers = {
  'x-dev-user-id': DEV_USER_ID,
  'Content-Type': 'application/json'
};

async function testEndpoints() {
  console.log('🧪 Testing Staff Self-Service API...\n');

  try {
    // Test 1: Get Profile
    console.log('1️⃣  GET /profile');
    let response = await fetch(`${API_BASE}/profile`, { headers });
    let data = await response.json();
    console.log('✅ Status:', response.status);
    console.log('📦 User:', data.data.user.fullName);
    console.log('📦 Role:', data.data.myRole);
    if (data.data.staffProfile) {
      console.log('📦 Staff ID:', data.data.staffProfile._id);
    }
    console.log('');

    // Test 2: Get Today's Bookings
    console.log('2️⃣  GET /bookings?status=today');
    response = await fetch(`${API_BASE}/bookings?status=today`, { headers });
    data = await response.json();
    console.log('✅ Status:', response.status);
    console.log('📦 Today Stats:', data.data.todayStats);
    console.log('📦 Bookings Count:', data.data.bookings.length);
    console.log('');

    // Test 3: Get Calendar
    console.log('3️⃣  GET /bookings/calendar?month=2026-06');
    response = await fetch(`${API_BASE}/bookings/calendar?month=2026-06`, { headers });
    data = await response.json();
    console.log('✅ Status:', response.status);
    console.log('📦 Dates with appointments:', data.data.datesWithAppointments.length);
    if (data.data.datesWithAppointments.length > 0) {
      console.log('📦 Sample:', data.data.datesWithAppointments.slice(0, 3));
    }
    console.log('');

    // Test 4: Get Stats
    console.log('4️⃣  GET /stats?period=week');
    response = await fetch(`${API_BASE}/stats?period=week`, { headers });
    data = await response.json();
    console.log('✅ Status:', response.status);
    console.log('📦 My Earnings:', data.data.myEarnings);
    console.log('📦 Completed Bookings:', data.data.completedBookings);
    console.log('📦 Hours Worked:', data.data.hoursWorked);
    console.log('📦 Can See Full Revenue:', data.data.canSeeFullRevenue);
    console.log('');

    // Test 5: Get Availability
    console.log('5️⃣  GET /availability');
    response = await fetch(`${API_BASE}/availability`, { headers });
    data = await response.json();
    console.log('✅ Status:', response.status);
    console.log('📦 Availability Slots:', data.data.length);
    console.log('');

    console.log('🎉 All API tests passed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.cause) console.error('Cause:', error.cause);
  }
}

testEndpoints();

let currentUser = null;

// Check auth on page load
document.addEventListener('DOMContentLoaded', async () => {
  const userData = localStorage.getItem('user');
  
  if (!userData) {
    window.location.href = '/login.html';
    return;
  }

  try {
    currentUser = JSON.parse(userData);
    if (currentUser.role !== 'admin') {
      alert('Admin access required');
      window.location.href = '/login.html';
      return;
    }
    
    // Validate session before loading
    if (await validateSession()) {
      loadBookings();
    }
  } catch {
    localStorage.removeItem('user');
    window.location.href = '/login.html';
  }
});

// Validate session by checking if server still recognizes us
async function validateSession() {
  try {
    const response = await fetch('/api/bookings', { 
      credentials: 'include',
      method: 'HEAD' // Just check auth without getting data
    });
    
    if (response.status === 401) {
      localStorage.removeItem('user');
      currentUser = null;
      window.location.href = '/login.html';
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function loadBookings() {
  try {
    const response = await fetch('/api/bookings', {
      credentials: 'include'
    });
    
    // Check for authentication issues
    if (response.status === 401) {
      localStorage.removeItem('user');
      currentUser = null;
      window.location.href = '/login.html';
      return;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const bookings = await response.json();
    renderBookings(bookings);
    updateStats(bookings);
  } catch (err) {
    console.error('Error loading bookings:', err);
    document.getElementById('bookingsList').innerHTML = '<p>Error loading bookings. Please refresh the page.</p>';
  }
}

// Render bookings to DOM
function renderBookings(bookings) {
  const bookingsList = document.getElementById('bookingsList');
  if (!bookingsList) return;

  if (bookings.length === 0) {
    bookingsList.innerHTML = '<p>No bookings found.</p>';
    return;
  }

  bookingsList.innerHTML = bookings.map(booking => `
    <div class="booking-card">
      <h3>Booking #${booking.id}</h3>
      <p><strong>Guest:</strong> ${booking.name} (${booking.email})</p>
      <p><strong>Room:</strong> ${booking.room_type} room</p>
      <p><strong>Dates:</strong> ${booking.check_in} to ${booking.check_out}</p>
      <p><strong>Created:</strong> ${new Date(booking.created_at).toLocaleDateString()}</p>
      <button class="delete-btn" data-booking-id="${booking.id}" style="background-color: #f44336; color: white; padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
    </div>
  `).join('');
  
  // Add event listeners to delete buttons (CSP-safe)
  const deleteButtons = document.querySelectorAll('.delete-btn');
  deleteButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const bookingId = e.target.getAttribute('data-booking-id');
      deleteBooking(bookingId);
    });
  });
}

// Update stats display
function updateStats(bookings) {
  const totalBookings = bookings.length;
  const roomTypes = bookings.reduce((acc, booking) => {
    acc[booking.room_type] = (acc[booking.room_type] || 0) + 1;
    return acc;
  }, {});
  
  const statsHtml = `
    <strong>Total Bookings:</strong> ${totalBookings} | 
    <strong>Single:</strong> ${roomTypes.single || 0} | 
    <strong>Double:</strong> ${roomTypes.double || 0} | 
    <strong>Suite:</strong> ${roomTypes.suite || 0}
  `;
  
  const statsElement = document.getElementById('statsText');
  if (statsElement) {
    statsElement.innerHTML = statsHtml;
  }
}

// Delete booking function
async function deleteBooking(id) {
  if (confirm('Delete this booking?')) {
    try {
      const response = await fetch(`/api/bookings/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.status === 401) {
        localStorage.removeItem('user');
        currentUser = null;
        window.location.href = '/login.html';
        return;
      }
      
      if (response.ok) {
        loadBookings(); // Reload all bookings
      } else {
        alert('Failed to delete booking');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Connection error');
    }
  }
}

// Logout function
function logout() {
  localStorage.removeItem('user');
  document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  currentUser = null;
  window.location.href = '/login.html';
}

// Logout event listener
document.addEventListener('DOMContentLoaded', () => {
  const logoutLink = document.querySelector('.logout');
  if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }
});
// Global variables
let currentUser = null;
let currentBookingData = {};

// DOM Elements (will be set after DOM loads)
let bookingForm, bookingsList, userInfo, authLinks, welcomeText, adminLink;

// Check authentication and initialize page
document.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    bookingForm = document.getElementById('bookingForm');
    bookingsList = document.getElementById('bookingsList');
    userInfo = document.getElementById('userInfo');
    authLinks = document.getElementById('authLinks');
    welcomeText = document.getElementById('welcomeText');
    adminLink = document.getElementById('adminLink');

    // Get current user
    currentUser = getCurrentUser();
    
    // Update UI based on authentication status
    updateAuthenticationUI();
    
    // Add logout button event listener (CSP-safe approach)
    const logoutButton = document.getElementById('logoutBtn');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
    
    // Handle different pages
    const currentPage = window.location.pathname;
    
    if (currentPage.includes('login.html') || currentPage.includes('register.html')) {
        return;
    }
    
    // For main page and admin page
    if (currentUser) {
        if (bookingsList) {
            loadBookings();
        }
        
        // Pre-fill email in booking form if it exists
        if (bookingForm && document.getElementById('email')) {
            document.getElementById('email').value = currentUser.email;
        }
    } else {
        window.location.href = '/login.html';
        return;
    }

    // Initialize payment flow
    if (bookingForm) {
        initializePaymentFlow();
    }
});

// Get current user from localStorage
function getCurrentUser() {
    const userData = localStorage.getItem('user');
    return userData ? JSON.parse(userData) : null;
}

// Update UI based on authentication status
function updateAuthenticationUI() {
    if (currentUser) {
        if (userInfo) {
            userInfo.style.display = 'block';
        }
        if (authLinks) {
            authLinks.style.display = 'none';
        }
        if (welcomeText) {
            welcomeText.textContent = `Welcome, ${currentUser.email}`;
        }
        
        if (adminLink && currentUser.role === 'admin') {
            adminLink.style.display = 'inline';
        }
    } else {
        if (userInfo) {
            userInfo.style.display = 'none';
        }
        if (authLinks) {
            authLinks.style.display = 'block';
        }
    }
}

// Logout function
function logout() {
    localStorage.removeItem('user');
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    
    currentUser = null;
    updateAuthenticationUI();
    
    if (bookingsList) {
        bookingsList.innerHTML = '<p>Please login to view bookings.</p>';
    }
    
    if (bookingForm) {
        resetBookingForm();
    }
    
    alert('Logged out successfully!');
    window.location.href = '/login.html';
}

// Initialize Payment Flow
function initializePaymentFlow() {
    // Step navigation buttons
    document.getElementById('nextToPayment').addEventListener('click', handleNextToPayment);
    document.getElementById('backToBooking').addEventListener('click', () => showStep(1));
    document.getElementById('proceedToPayment').addEventListener('click', () => showStep(3));
    document.getElementById('backToSummary').addEventListener('click', () => showStep(2));
    document.getElementById('newBooking').addEventListener('click', resetBookingForm);

    // Payment method switching
    const paymentMethods = document.querySelectorAll('input[name="paymentMethod"]');
    paymentMethods.forEach(method => {
        method.addEventListener('change', handlePaymentMethodChange);
    });

    // Card number formatting
    document.getElementById('cardNumber').addEventListener('input', formatCardNumber);
    document.getElementById('cardExpiry').addEventListener('input', formatCardExpiry);

    // Form submission
    bookingForm.addEventListener('submit', handlePaymentSubmission);

    // Date change listeners for price calculation
    document.getElementById('checkin').addEventListener('change', calculatePrice);
    document.getElementById('checkout').addEventListener('change', calculatePrice);
    document.getElementById('roomType').addEventListener('change', calculatePrice);
}

// Step Navigation
function showStep(stepNumber) {
    // Hide all steps
    for (let i = 1; i <= 5; i++) {
        const step = document.getElementById(`step${i}`);
        if (step) step.style.display = 'none';
    }
    
    // Show current step
    const currentStep = document.getElementById(`step${stepNumber}`);
    if (currentStep) currentStep.style.display = 'block';
}

// Handle Next to Payment
function handleNextToPayment() {
    if (validateStep1()) {
        calculatePrice();
        updatePaymentSummary();
        showStep(2);
    }
}

// Validate Step 1
function validateStep1() {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const checkin = document.getElementById('checkin').value;
    const checkout = document.getElementById('checkout').value;
    const roomType = document.getElementById('roomType').value;

    if (!name || !email || !checkin || !checkout || !roomType) {
        alert('Please fill in all fields before proceeding.');
        return false;
    }

    // Validate dates
    const checkinDate = new Date(checkin);
    const checkoutDate = new Date(checkout);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (checkinDate < today) {
        alert('Check-in date cannot be in the past.');
        return false;
    }

    if (checkoutDate <= checkinDate) {
        alert('Check-out date must be after check-in date.');
        return false;
    }

    return true;
}

// Calculate Price
function calculatePrice() {
    const checkin = document.getElementById('checkin').value;
    const checkout = document.getElementById('checkout').value;
    const roomType = document.getElementById('roomType').value;

    if (!checkin || !checkout || !roomType) return;

    const checkinDate = new Date(checkin);
    const checkoutDate = new Date(checkout);
    const timeDiff = checkoutDate.getTime() - checkinDate.getTime();
    const nights = Math.ceil(timeDiff / (1000 * 3600 * 24));

    const roomOption = document.querySelector(`#roomType option[value="${roomType}"]`);
    const pricePerNight = roomOption ? parseInt(roomOption.dataset.price) : 0;
    const totalPrice = nights * pricePerNight;

    // Store calculation data
    currentBookingData = {
        nights,
        pricePerNight,
        totalPrice,
        roomType,
        checkin,
        checkout
    };
}

// Update Payment Summary
function updatePaymentSummary() {
    const roomTypeSelect = document.getElementById('roomType');
    const roomTypeName = roomTypeSelect.options[roomTypeSelect.selectedIndex].text;

    document.getElementById('summaryRoomType').textContent = roomTypeName;
    document.getElementById('summaryCheckin').textContent = formatDate(currentBookingData.checkin);
    document.getElementById('summaryCheckout').textContent = formatDate(currentBookingData.checkout);
    document.getElementById('summaryNights').textContent = currentBookingData.nights;
    document.getElementById('summaryRate').textContent = `$${currentBookingData.pricePerNight}`;
    document.getElementById('summaryTotal').innerHTML = `<strong>$${currentBookingData.totalPrice}</strong>`;
}

// Handle Payment Method Change
function handlePaymentMethodChange(e) {
    const method = e.target.value;
    
    // Hide all payment forms
    document.getElementById('cardForm').style.display = 'none';
    document.getElementById('paypalForm').style.display = 'none';
    document.getElementById('applePayForm').style.display = 'none';
    
    // Show selected payment form
    document.getElementById(`${method}Form`).style.display = 'block';
}

// Format Card Number
function formatCardNumber(e) {
    let value = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    let formattedValue = value.match(/.{1,4}/g)?.join(' ') || '';
    if (formattedValue.length > 19) formattedValue = formattedValue.substring(0, 19);
    e.target.value = formattedValue;
}

// Format Card Expiry
function formatCardExpiry(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
    }
    e.target.value = value;
}

// Handle Payment Submission
async function handlePaymentSubmission(e) {
    e.preventDefault();
    
    if (!validatePaymentForm()) return;
    
    // Show processing step
    showStep(4);
    
    // Simulate payment processing
    await simulatePaymentProcessing();
    
    // Process the actual booking
    await processBooking();
}

// Validate Payment Form
function validatePaymentForm() {
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
    
    if (paymentMethod === 'card') {
        const cardNumber = document.getElementById('cardNumber').value.replace(/\s/g, '');
        const cardExpiry = document.getElementById('cardExpiry').value;
        const cardCVV = document.getElementById('cardCVV').value;
        const cardName = document.getElementById('cardName').value.trim();
        
        if (!cardNumber || cardNumber.length < 13) {
            alert('Please enter a valid card number.');
            return false;
        }
        
        if (!cardExpiry || cardExpiry.length < 5) {
            alert('Please enter a valid expiry date.');
            return false;
        }
        
        if (!cardCVV || cardCVV.length < 3) {
            alert('Please enter a valid CVV.');
            return false;
        }
        
        if (!cardName) {
            alert('Please enter the name on the card.');
            return false;
        }
    }
    
    return true;
}

// Simulate Payment Processing
async function simulatePaymentProcessing() {
    const steps = ['stepVerifying', 'stepProcessing', 'stepConfirming'];
    
    for (let i = 0; i < steps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Remove active from previous step
        if (i > 0) {
            document.getElementById(steps[i - 1]).classList.remove('active');
        }
        
        // Add active to current step
        document.getElementById(steps[i]).classList.add('active');
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
}

// Process Booking
async function processBooking() {
    const booking = {
        name: document.getElementById('name').value,
        email: document.getElementById('email').value,
        check_in: document.getElementById('checkin').value,
        check_out: document.getElementById('checkout').value,
        room_type: document.getElementById('roomType').value
    };

    try {
        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(booking)
        });
        
        if (response.ok) {
            const result = await response.json();
            showSuccessStep(result.id);
            loadBookings(); // Refresh bookings list
        } else {
            const error = await response.json();
            alert(error.error || 'Booking failed. Please try again.');
            showStep(1); // Go back to first step
        }
    } catch (err) {
        console.error('Booking error:', err);
        alert('Connection error. Please check your network.');
        showStep(1); // Go back to first step
    }
}

// Show Success Step
function showSuccessStep(bookingId) {
    // Generate fake confirmation data
    const confirmationNumber = `THD${Date.now().toString().slice(-6)}`;
    const transactionId = `TX${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    const amountPaid = `$${currentBookingData.totalPrice}`;
    
    // Update success step with data
    document.getElementById('confirmationNumber').textContent = confirmationNumber;
    document.getElementById('transactionId').textContent = transactionId;
    document.getElementById('amountPaid').textContent = amountPaid;
    
    // Show success step
    showStep(5);
}

// Reset Booking Form
function resetBookingForm() {
    bookingForm.reset();
    currentBookingData = {};
    
    // Reset all processing steps
    document.querySelectorAll('.processing-step').forEach(step => {
        step.classList.remove('active');
    });
    document.getElementById('stepVerifying').classList.add('active');
    
    // Pre-fill email again
    if (currentUser && document.getElementById('email')) {
        document.getElementById('email').value = currentUser.email;
    }
    
    // Show first step
    showStep(1);
}

// Format Date for Display
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        weekday: 'short', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Load bookings function
async function loadBookings() {
    if (!bookingsList) return;
    
    try {
        const response = await fetch('/api/bookings', {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            localStorage.removeItem('user');
            currentUser = null;
            window.location.href = '/login.html';
            return;
        }

        const bookings = await response.json();
        renderBookings(bookings);
    } catch (err) {
        console.error('Failed to load bookings:', err);
        bookingsList.innerHTML = '<p>Failed to load bookings. Please refresh the page.</p>';
    }
}

// Render bookings to DOM
function renderBookings(bookings) {
    if (!bookingsList) return;

    const isAdmin = currentUser?.role === 'admin';
    const canDeleteBookings = currentUser && (isAdmin || currentUser.role === 'user');
    
    if (bookings.length === 0) {
        bookingsList.innerHTML = '<p>No bookings found.</p>';
        return;
    }
    
    bookingsList.innerHTML = bookings.map(booking => `
        <div class="booking-card">
            <h3>Booking #${booking.id}</h3>
            <p><strong>Guest:</strong> ${booking.name} (${booking.email})</p>
            <p><strong>Room:</strong> ${booking.room_type}</p>
            <p><strong>Dates:</strong> ${booking.check_in} to ${booking.check_out}</p>
            <p><strong>Created:</strong> ${new Date(booking.created_at).toLocaleDateString()}</p>
            ${canDeleteBookings ? `
                <button class="delete-btn" data-booking-id="${booking.id}" style="background-color: #f44336; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                    ${isAdmin ? 'Delete Booking' : 'Cancel Reservation'}
                </button>
            ` : ''}
        </div>
    `).join('');
    
    // Add event listeners to delete buttons (CSP-safe)
    if (canDeleteBookings) {
        const deleteButtons = document.querySelectorAll('.delete-btn');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const bookingId = e.target.getAttribute('data-booking-id');
                deleteBooking(bookingId, isAdmin);
            });
        });
    }
}

// Delete booking - Updated for both users and admins
async function deleteBooking(id, isAdmin = false) {
    const confirmMessage = isAdmin 
        ? 'Are you sure you want to delete this booking?' 
        : 'Are you sure you want to cancel this reservation? This action cannot be undone.';
    
    if (confirm(confirmMessage)) {
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
            
            if (response.status === 403) {
                alert('You can only cancel your own reservations.');
                return;
            }
            
            if (response.ok) {
                const successMessage = isAdmin 
                    ? 'Booking deleted successfully.' 
                    : 'Reservation cancelled successfully.';
                alert(successMessage);
                loadBookings(); // Reload bookings
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = isAdmin 
                    ? 'Failed to delete booking. Please try again.' 
                    : 'Failed to cancel reservation. Please try again.';
                alert(errorData.error || errorMessage);
            }
        } catch (err) {
            console.error('Delete failed:', err);
            alert('Connection error. Please check your network.');
        }
    }
}
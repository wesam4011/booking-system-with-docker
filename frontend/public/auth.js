// Wait for DOM to load before adding event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Quick admin login button handler
    const quickAdminBtn = document.getElementById('quickAdminBtn');
    if (quickAdminBtn) {
        quickAdminBtn.addEventListener('click', quickAdminLogin);
    }
});

// Quick admin login function
function quickAdminLogin() {
    const emailField = document.getElementById('email');
    const passwordField = document.getElementById('password');
    const loginForm = document.getElementById('loginForm');
    
    if (emailField && passwordField && loginForm) {
        emailField.value = 'admin@thedormhotel.com';
        passwordField.value = 'admin123';
        
        // Trigger the form submission
        const event = new Event('submit', { bubbles: true, cancelable: true });
        loginForm.dispatchEvent(event);
    }
}

// Login form handler
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: document.getElementById('email').value,
                password: document.getElementById('password').value
            })
        });

        if (response.ok) {
            const userData = await response.json();
            
            // Store user info
            localStorage.setItem('user', JSON.stringify(userData));
            
            // Redirect based on role
            if (userData.role === 'admin') {
                window.location.href = '/admin.html';
            } else {
                window.location.href = '/';
            }
        } else {
            const error = await response.json();
            alert(error.error || 'Login failed. Please check your credentials.');
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Connection error. Please try again.');
    }
});

// Registration form handler
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: document.getElementById('email').value,
                password: document.getElementById('password').value
            })
        });

        if (response.ok) {
            alert('Registration successful! Please login.');
            window.location.href = '/login.html';
        } else {
            const error = await response.json();
            alert(error.error || 'Registration failed');
        }
    } catch (err) {
        console.error('Registration error:', err);
        alert('Connection error. Please try again.');
    }
});